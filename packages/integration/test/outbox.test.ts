import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  type AdminJobs,
  type Config,
  ConfigError,
  createRestHandler,
  type DatabaseAdapter,
  defineConfig,
} from '@easy-cms/core'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { db, open, SECRET, tempProject } from './helpers.js'

// The outbox (#178, ADR-0053): after hooks, webhooks and purges of a save are written in its
// transaction and run after it commits, retried until they succeed.

let server: Server
let url = ''
/** Webhook events received, as `event:id`. */
let received: string[] = []
beforeAll(async () => {
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      const payload = JSON.parse(body)
      received.push(`${payload.event}:${payload.id ?? payload.global}`)
      res.end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

/** What the hooks saw, in order. */
let calls: Record<string, unknown>[] = []
/** Set to make the next hook calls throw. */
let failing = 0
let purged: string[][] = []
beforeEach(() => {
  received = []
  calls = []
  failing = 0
  purged = []
})

const config = (extra: Partial<Config> = {}) =>
  defineConfig({
    secret: SECRET,
    db: db(),
    outbox: true,
    webhooks: [{ url: `${url}/hook` }],
    httpCache: { purge: (tags) => void purged.push(tags) },
    collections: [
      {
        slug: 'posts',
        drafts: true,
        versions: true,
        hooks: {
          afterChange: [
            ({ doc, previousDoc, operation, user, context }) => {
              if (failing > 0) {
                failing--
                throw new Error('hook down')
              }
              calls.push({ hook: 'afterChange', doc, previousDoc, operation, user, context })
            },
          ],
          afterDelete: [({ id, doc }) => void calls.push({ hook: 'afterDelete', id, doc })],
        },
        fields: [
          { name: 'title', type: 'text' },
          { name: 'slug', type: 'text', unique: true },
        ],
      },
    ],
    globals: [
      {
        slug: 'site',
        hooks: { afterChange: [({ doc }) => void calls.push({ hook: 'site', doc })] },
        fields: [{ name: 'name', type: 'text' }],
      },
    ],
    ...extra,
  } as Config)

const rows = async (cms: Awaited<ReturnType<typeof open>>) =>
  (await cms.db.find({ collection: 'outbox', sort: ['id'], limit: 0, page: 1 })).docs

const later = (minutes: number) => new Date(Date.now() + minutes * 60_000)

describe('outbox (#178)', () => {
  it('runs after hooks, webhooks and purges after the save, from its row', async () => {
    const cms = await open(config())
    const editor = await cms.create('users', {
      email: 'ed@x.co',
      password: 'password123',
      role: 'admin',
    })
    const user = { ...editor, passwordHash: 'secret-hash' }
    await cms.flushOutbox()
    purged = []
    const post = await cms.create(
      'posts',
      { title: 'Hello', status: 'published' },
      { user: user as never, context: { requestId: 'r1' } },
    )
    await cms.flushOutbox()
    await cms.flushWebhooks()
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      hook: 'afterChange',
      operation: 'create',
      doc: { id: post.id, title: 'Hello', status: 'published' },
      user: { id: editor.id, email: 'ed@x.co' },
      // Not serializable in general: hooks from the outbox get none.
      context: {},
    })
    expect(calls[0]?.user).not.toHaveProperty('passwordHash')
    expect(received.sort()).toEqual([`create:${post.id}`, `publish:${post.id}`])
    expect(purged).toEqual([['ecms', 'ecms:posts', `ecms:posts:${post.id}`]])
    // Done: the row is gone.
    expect(await rows(cms)).toEqual([])

    await cms.update('posts', post.id, { title: 'Next' })
    await cms.delete('posts', post.id)
    await cms.updateGlobal('site', { name: 'Site' })
    await cms.flushOutbox()
    expect(calls.slice(1)).toMatchObject([
      { hook: 'afterChange', operation: 'update', previousDoc: { title: 'Hello' } },
      { hook: 'afterDelete', id: post.id, doc: { title: 'Next' } },
      { hook: 'site', doc: { name: 'Site' } },
    ])
    await cms.destroy()
  })

  it('writes no row when the save fails', async () => {
    const cms = await open(config())
    const post = await cms.create('posts', { title: 'A', slug: 'a' })
    await cms.flushOutbox()
    calls = []
    await expect(cms.create('posts', { title: 'B', slug: 'a' })).rejects.toThrow()
    expect(await rows(cms)).toEqual([])
    // A compare-and-set that doesn't match writes nothing either.
    const missed = await cms.update(
      'posts',
      post.id,
      { title: 'C' },
      { where: { title: { equals: 'not this' } } },
    )
    expect(missed).toBeNull()
    expect(await rows(cms)).toEqual([])
    await cms.flushOutbox()
    expect(calls).toEqual([])

    // One transaction: when the row can't be written, neither is the document.
    const broken = {
      collection: 'outbox',
      data: () => {
        throw new Error('no row')
      },
    }
    const now = new Date().toISOString()
    const { id } = post
    await expect(
      cms.db.create({
        collection: 'posts',
        data: { title: 'X', createdAt: now, updatedAt: now },
        outbox: broken,
      }),
    ).rejects.toThrow('no row')
    await expect(
      cms.db.update({
        collection: 'posts',
        id,
        data: { ...post, title: 'X', updatedAt: now },
        outbox: broken,
      }),
    ).rejects.toThrow('no row')
    await expect(cms.db.delete({ collection: 'posts', id, outbox: broken })).rejects.toThrow()
    await expect(
      cms.db.updateGlobal({ slug: 'site', data: { name: 'X', updatedAt: now }, outbox: broken }),
    ).rejects.toThrow()
    expect((await cms.find('posts', { draft: true })).docs.map((d) => d.title)).toEqual(['A'])
    expect(await cms.db.findGlobal({ slug: 'site' })).toBeNull()
    await cms.destroy()
  })

  it('retries what failed, skipping the steps already done, then gives up', async () => {
    const purge = { fails: 1 }
    const cms = await open(
      config({
        httpCache: {
          purge: (tags) => {
            if (purge.fails-- > 0) throw new Error('CDN down')
            purged.push(tags)
          },
        },
      }),
    )
    const post = await cms.create('posts', { title: 'A', status: 'published' })
    await cms.flushOutbox()
    // The hooks and webhooks ran, the purge failed: the row waits for its retry.
    expect(calls).toHaveLength(1)
    let [row] = await rows(cms)
    expect(row).toMatchObject({ state: 'pending', attempts: 1, error: 'CDN down' })
    expect(String(row?.done).split(',').sort()).toEqual(['hooks', 'webhooks'])
    // Not due yet.
    expect((await cms.runJobs()).outbox).toEqual({ ran: 0, failed: 0 })
    expect((await cms.runJobs(later(2))).outbox).toEqual({ ran: 1, failed: 0 })
    expect(calls).toHaveLength(1)
    expect(purged).toEqual([['ecms', 'ecms:posts', `ecms:posts:${post.id}`]])
    expect(await rows(cms)).toEqual([])

    // A hook that keeps failing: retried with backoff, then failed and kept.
    failing = 100
    await cms.update('posts', post.id, { title: 'B' })
    await cms.flushOutbox()
    for (const minutes of [2, 10, 60, 180, 24 * 60]) await cms.runJobs(later(minutes))
    ;[row] = await rows(cms)
    expect(row).toMatchObject({ state: 'failed', attempts: 6, error: 'hook down' })
    expect((await cms.runJobs(later(48 * 60))).outbox).toEqual({ ran: 0, failed: 0 })
    // Put back in line (Settings → Jobs): runs again.
    failing = 0
    // @internal: what Settings → Jobs calls.
    const internal = cms as unknown as { retryOutbox(id: unknown): Promise<boolean> }
    expect(await internal.retryOutbox(row?.id)).toBe(true)
    await cms.flushOutbox()
    expect(calls.at(-1)).toMatchObject({ operation: 'update', doc: { title: 'B' } })
    expect(await rows(cms)).toEqual([])
    await cms.destroy()
  })

  it('picks up what a stopped worker left, and runs each entry once across instances', async () => {
    const cwd = tempProject()
    let release = () => {}
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    let stuck = true
    const first = await open(
      config({
        collections: [
          {
            slug: 'posts',
            hooks: {
              afterChange: [
                async ({ doc }) => {
                  calls.push({ doc })
                  // The first worker "stops" while running it.
                  if (stuck) await blocked
                },
              ],
            },
            fields: [{ name: 'title', type: 'text' }],
          },
        ],
      }),
      cwd,
    )
    const second = await open(config(), cwd)
    await first.create('posts', { title: 'A' })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(calls).toHaveLength(1)
    // Claimed: another instance leaves it alone until the lease runs out.
    expect((await second.runJobs()).outbox).toEqual({ ran: 0, failed: 0 })
    stuck = false
    const [retried, again] = await Promise.all([second.runJobs(later(6)), first.runJobs(later(6))])
    expect(retried.outbox.ran + again.outbox.ran).toBe(1)
    release()
    await first.flushOutbox()

    // Many saves, two instances running the outbox at once: each entry runs once.
    calls = []
    for (let i = 0; i < 20; i++) await second.create('posts', { title: `P${i}` })
    await Promise.all([first.runJobs(), second.runJobs(), second.flushOutbox()])
    await second.flushOutbox()
    const ids = calls.map((c) => (c.doc as { id: number }).id)
    expect(ids).toHaveLength(20)
    expect(new Set(ids).size).toBe(20)
    await first.destroy()
    await second.destroy()
  })

  it('shows failed entries in Settings → Jobs, where an admin can retry them', async () => {
    const cms = await open(config())
    const handle = createRestHandler(cms)
    await cms.create('users', { email: 'admin@x.co', password: 'password123', role: 'admin' })
    const { token } = await cms.auth.login({ email: 'admin@x.co', password: 'password123' })
    const call = async (path: string, method = 'GET') => {
      const response = await handle(
        new Request(`http://cms.test/api/cms${path}`, {
          method,
          headers: { authorization: `Bearer ${token}` },
        }),
      )
      return { status: response.status, json: (await response.json()) as AdminJobs }
    }
    await cms.flushOutbox()
    failing = 100
    const post = await cms.create('posts', { title: 'A' })
    await cms.flushOutbox()
    let { json } = await call('/admin/jobs')
    expect(json.builtIn).toContain('outbox')
    expect(json.outbox).toMatchObject({
      waiting: 1,
      failed: 0,
      entries: [
        {
          event: 'create',
          collection: 'posts',
          doc: String(post.id),
          attempts: 1,
          state: 'pending',
          error: 'hook down',
        },
      ],
    })
    const id = json.outbox?.entries[0]?.id
    // Only a failed entry can be put back in line.
    expect((await call(`/admin/jobs/outbox/${id}`, 'POST')).status).toBe(409)
    for (const minutes of [2, 10, 60, 180, 24 * 60]) await cms.runJobs(later(minutes))
    failing = 0
    ;({ json } = await call('/admin/jobs'))
    expect(json.outbox).toMatchObject({ waiting: 0, failed: 1, entries: [{ state: 'failed' }] })
    ;({ json } = await call(`/admin/jobs/outbox/${id}`, 'POST'))
    expect(json.outbox?.failed).toBe(0)
    await cms.flushOutbox()
    expect((await call('/admin/jobs')).json.outbox).toEqual({ waiting: 0, failed: 0, entries: [] })
    await cms.destroy()
  })

  it('needs an adapter that writes outbox rows', async () => {
    const adapter = db()
    const without: DatabaseAdapter = {
      ...adapter,
      init: async (args) =>
        Object.assign(Object.create(await adapter.init(args)), { outbox: false }),
    }
    await expect(open(config({ db: without }))).rejects.toThrow(ConfigError)
    await expect(open(config({ db: without }))).rejects.toThrow(/outbox/)
  })

  it('keeps hooks in the request without it', async () => {
    const cms = await open(config({ outbox: false }))
    await cms.create('posts', { title: 'A' })
    // Ran before create returned.
    expect(calls).toHaveLength(1)
    expect(cms.config.collections.some((c) => c.slug === 'outbox')).toBe(false)
    await cms.destroy()
  })
})
