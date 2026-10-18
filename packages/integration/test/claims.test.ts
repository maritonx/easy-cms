import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { consoleEmail, defineConfig } from '@easy-cms/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, open, SECRET, tempProject } from './helpers.js'

// Several instances on one database (#153): each piece of background work runs once, whichever
// instance (or the scheduler and the cron endpoint at the same moment) gets to it first.

let server: Server
let url = ''
/** Delivery ids the webhook receiver got, in order. */
const received: string[] = []
beforeAll(async () => {
  server = createServer((req, res) => {
    received.push(String(req.headers['x-easy-cms-delivery']))
    // Slow enough that both instances are sending at the same time if neither claimed first.
    setTimeout(() => res.end('ok'), 50)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

/** afterChange calls per post id, across both instances. */
const changes = new Map<string, number>()
const email = consoleEmail({ log: () => {} })

const config = () =>
  defineConfig({
    secret: SECRET,
    db: db(),
    webhooks: [{ url: `${url}/hook` }],
    email,
    collections: [
      {
        slug: 'posts',
        drafts: true,
        schedule: true,
        hooks: {
          afterChange: [
            ({ doc }) => {
              const id = String(doc.id)
              changes.set(id, (changes.get(id) ?? 0) + 1)
            },
          ],
        },
        fields: [{ name: 'title', type: 'text' }],
      },
    ],
  })

const past = () => new Date(Date.now() - 60_000).toISOString()

describe('background work claimed by one instance (#153)', () => {
  it('runs each scheduled publish once when two instances run jobs together', async () => {
    const cwd = tempProject()
    const one = await open(config(), cwd)
    const two = await open(config(), cwd)
    try {
      const posts = await Promise.all(
        Array.from({ length: 8 }, (_, i) => one.create('posts', { title: `p${i}` })),
      )
      for (const post of posts)
        await one.schedule('posts', post.id, { action: 'publish', at: past() })
      changes.clear()

      const results = await Promise.all([
        one.runScheduled(),
        two.runScheduled(),
        one.runScheduled(),
        two.runScheduled(),
      ])
      expect(results.reduce((sum, r) => sum + r.ran, 0)).toBe(8)
      expect(results.reduce((sum, r) => sum + r.failed, 0)).toBe(0)
      for (const post of posts) expect(changes.get(String(post.id))).toBe(1)
      for (const post of posts)
        expect((await one.findById('posts', post.id))?.status).toBe('published')
    } finally {
      await one.flushWebhooks?.()
      await one.destroy()
      await two.destroy()
    }
  })

  it('puts back a job claimed by an instance that stopped, once its lease is over', async () => {
    const one = await open(config())
    try {
      const post = await one.create('posts', { title: 'stuck' })
      const job = await one.schedule('posts', post.id, { action: 'publish', at: past() })
      const row = await one.db.findById({ collection: 'scheduled-jobs', id: job.id })
      const { id, ...data } = row as Record<string, unknown> & { id: number }
      // Claimed a minute ago: still another instance's.
      const claimedAt = (ago: number) => new Date(Date.now() - ago).toISOString()
      await one.db.update({
        collection: 'scheduled-jobs',
        id,
        data: { ...data, state: 'running', updatedAt: claimedAt(60_000) },
      })
      expect(await one.runScheduled()).toEqual({ ran: 0, failed: 0 })
      // Claimed 11 minutes ago and never finished: the instance stopped.
      await one.db.update({
        collection: 'scheduled-jobs',
        id,
        data: { ...data, state: 'running', updatedAt: claimedAt(11 * 60_000) },
      })
      expect(await one.runScheduled()).toEqual({ ran: 1, failed: 0 })
      expect((await one.findById('posts', post.id))?.status).toBe('published')
    } finally {
      await one.destroy()
    }
  })

  it('retries each queued webhook delivery and email once', async () => {
    const cwd = tempProject()
    const one = await open(config(), cwd)
    const two = await open(config(), cwd)
    try {
      const at = past()
      const stamp = new Date().toISOString()
      const ids = Array.from({ length: 6 }, (_, i) => `delivery-${i}`)
      for (const delivery of ids)
        await one.db.create({
          collection: 'webhook-deliveries',
          data: {
            url: `${url}/hook`,
            event: 'create',
            body: '{}',
            delivery,
            attempts: 1,
            nextAttemptAt: at,
            state: 'pending',
            error: 'earlier',
            createdAt: stamp,
            updatedAt: stamp,
          },
        })
      for (let i = 0; i < 6; i++)
        await one.db.create({
          collection: 'email-deliveries',
          data: {
            message: JSON.stringify({ to: 'a@example.com', subject: `mail ${i}`, text: 'hi' }),
            attempts: 1,
            nextAttemptAt: at,
            state: 'pending',
            error: 'earlier',
            createdAt: stamp,
            updatedAt: stamp,
          },
        })
      received.length = 0
      email.sent.length = 0

      const runs = await Promise.all([one.runJobs(), two.runJobs()])
      // Each delivery is tried by one instance only. (Whether a POST succeeds depends on the
      // machine: slow CI runners can time out, which is a failed attempt, not a second one.)
      expect(new Set(received).size).toBe(received.length)
      const tried = runs.reduce((sum, r) => sum + r.webhooks.sent + r.webhooks.failed, 0)
      expect(tried).toBeLessThanOrEqual(6)
      expect(runs.reduce((sum, r) => sum + r.emails.sent, 0)).toBe(6)
      expect(email.sent.map((m) => m.subject).sort()).toEqual(
        Array.from({ length: 6 }, (_, i) => `mail ${i}`),
      )
    } finally {
      await one.destroy()
      await two.destroy()
    }
  })

  it("sends once when the admin's Retry is clicked twice at the same time", async () => {
    const one = await open(config())
    try {
      const stamp = new Date().toISOString()
      const row = await one.db.create({
        collection: 'webhook-deliveries',
        data: {
          url: `${url}/hook`,
          event: 'create',
          body: '{}',
          delivery: 'clicked-twice',
          attempts: 7,
          nextAttemptAt: stamp,
          state: 'failed',
          error: 'gave up',
          createdAt: stamp,
          updatedAt: stamp,
        },
      })
      received.length = 0
      // `retryDelivery` is internal (the admin's REST route calls it).
      const retry = (
        one as unknown as {
          retryDelivery(kind: 'webhook', id: unknown): Promise<{ ok: boolean; error?: string }>
        }
      ).retryDelivery.bind(one)
      const results = await Promise.all([retry('webhook', row.id), retry('webhook', row.id)])
      // One click sends; the other is told it is being sent. At most one POST either way.
      const busy = results.filter((r) => !r.ok && String(r.error).startsWith('it is being sent'))
      expect(busy).toHaveLength(1)
      expect(received.filter((d) => d === 'clicked-twice').length).toBeLessThanOrEqual(1)

      // A Retry whose instance stopped mid-send leaves it `sending`: after 5 minutes it is failed.
      const old = new Date(Date.now() - 6 * 60_000).toISOString()
      const stuck = await one.db.create({
        collection: 'webhook-deliveries',
        data: {
          url: `${url}/hook`,
          event: 'create',
          body: '{}',
          delivery: 'stuck',
          attempts: 7,
          nextAttemptAt: old,
          state: 'sending',
          error: null,
          createdAt: old,
          updatedAt: old,
        },
      })
      await one.runJobs()
      expect(
        await one.db.findById({ collection: 'webhook-deliveries', id: stuck.id }),
      ).toMatchObject({ state: 'failed', error: 'Interrupted: the server stopped while sending' })
    } finally {
      await one.destroy()
    }
  })
})
