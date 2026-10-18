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
      expect(runs.reduce((sum, r) => sum + r.webhooks.sent, 0)).toBe(6)
      expect(runs.reduce((sum, r) => sum + r.emails.sent, 0)).toBe(6)
      expect([...received].sort()).toEqual([...ids].sort())
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
      const results = await Promise.all([
        one.retryDelivery('webhook', row.id),
        one.retryDelivery('webhook', row.id),
      ])
      expect(results.filter((r) => r.ok)).toHaveLength(1)
      expect(received).toEqual(['clicked-twice'])
    } finally {
      await one.destroy()
    }
  })

  it("runs each of the config's jobs once when two instances run jobs together", async () => {
    const runs: string[] = []
    const withJobs = () =>
      defineConfig({
        ...config(),
        jobs: [
          { name: 'hourly', every: 3600, run: () => void runs.push('hourly') },
          { name: 'always', run: () => void runs.push('always') },
        ],
      })
    const cwd = tempProject()
    const one = await open(withJobs(), cwd)
    const two = await open(withJobs(), cwd)
    try {
      const now = new Date()
      await Promise.all([one.runJobs(now), two.runJobs(now)])
      // Each job once at this moment, whichever instance got to it.
      expect(runs.sort()).toEqual(['always', 'hourly'])
      // An hour has not passed: only the job without `every` runs again.
      runs.length = 0
      await Promise.all([
        one.runJobs(new Date(now.getTime() + 60_000)),
        two.runJobs(new Date(now.getTime() + 60_000)),
      ])
      expect(runs).toEqual(['always'])
      // The last result of each, for Settings → Jobs.
      const rows = await one.db.find({ collection: 'job-runs', sort: ['name'], limit: 0, page: 1 })
      expect(rows.docs.map((r) => [r.name, r.lastStatus, r.lastError])).toEqual([
        ['always', 'ok', null],
        ['hourly', 'ok', null],
      ])
      expect(typeof rows.docs[0]?.lastDurationMs).toBe('number')
    } finally {
      await one.destroy()
      await two.destroy()
    }
  })

  it('keeps when jobs last ran from before the job-runs table', async () => {
    const runs: string[] = []
    const cms = await open(
      defineConfig({
        ...config(),
        jobs: [{ name: 'hourly', every: 3600, run: () => void runs.push('hourly') }],
      }),
    )
    try {
      const ranAt = new Date(Date.now() - 10 * 60_000).toISOString()
      await cms.db.updateGlobal({
        slug: 'easy-cms:jobs',
        data: { hourly: ranAt, updatedAt: ranAt },
      })
      await cms.runJobs()
      expect(runs).toEqual([])
      await cms.runJobs(new Date(Date.now() + 3600_000))
      expect(runs).toEqual(['hourly'])
    } finally {
      await cms.destroy()
    }
  })
})
