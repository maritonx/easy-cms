import { createRestHandler, defineConfig, type RestHandler } from '@easy-cms/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, open, SECRET } from './helpers.js'

const config = defineConfig({
  secret: SECRET,
  db: db(),
  collections: [
    {
      slug: 'posts',
      drafts: true,
      access: {
        read: () => true,
        create: () => true,
        // Editors may change posts that aren't locked; admins any.
        update: ({ user }) =>
          user?.role === 'admin' ? true : user ? { locked: { equals: false } } : false,
        delete: ({ user }) =>
          user?.role === 'admin' ? true : user ? { locked: { equals: false } } : false,
      },
      fields: [
        { name: 'n', type: 'number' },
        { name: 'locked', type: 'boolean', defaultValue: false },
      ],
    },
  ],
})

const BASE = 'http://cms.test/api/cms'
type CMS = Awaited<ReturnType<typeof open<typeof config>>>
let cms: CMS
let handle: RestHandler
const token: Record<string, string> = {}

function call(path: string, who: string, method = 'GET', body?: unknown) {
  return handle(
    new Request(`${BASE}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token[who]}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  )
}

type Operation = { id: number; state: string; total: number; done: number; skipped: number }

/** Asks for progress (which moves it on) until the operation finished. */
async function finished(id: number, who = 'admin'): Promise<Operation> {
  for (let i = 0; i < 200; i++) {
    const op = (await (await call(`/posts/bulk/${id}`, who)).json()) as Operation
    if (!['pending', 'running', 'cancelling'].includes(op.state)) return op
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error('the operation did not finish')
}

async function seed(count: number, locked = (_n: number) => false) {
  const ids: number[] = []
  for (let n = 0; n < count; n++)
    ids.push((await cms.create('posts', { n, locked: locked(n), status: 'draft' })).id as number)
  return ids
}

const published = () => cms.count('posts', { where: { status: { equals: 'published' } } })

beforeEach(async () => {
  cms = await open(config)
  handle = createRestHandler(cms)
  for (const [email, role] of [
    ['admin@x.co', 'admin'],
    ['editor@x.co', 'editor'],
  ] as const) {
    await cms.create('users', { email, password: 'password123', role })
    token[role] = (await cms.auth.login({ email, password: 'password123' })).token
  }
})

describe('bulk actions on named documents (#280)', () => {
  it('publishes each with the user’s access, going on past those it may not change', async () => {
    const ids = await seed(4, (n) => n === 1)
    const response = await call('/posts/bulk', 'editor', 'POST', {
      action: 'publish',
      ids: [...ids, 999],
    })
    expect(response.status).toBe(200)
    const result = (await response.json()) as {
      done: number
      skipped: { id: number; reason: string }[]
    }
    expect(result.done).toBe(3)
    expect(result.skipped).toEqual([
      { id: ids[1], reason: 'forbidden' },
      { id: 999, reason: 'not-found' },
    ])
    expect(await published()).toBe(3)
  })

  it('refuses more than 100 ids, an unknown action, and requests without a user', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => i + 1)
    expect((await call('/posts/bulk', 'admin', 'POST', { action: 'publish', ids })).status).toBe(
      400,
    )
    expect((await call('/posts/bulk', 'admin', 'POST', { action: 'nope', ids: [1] })).status).toBe(
      400,
    )
    expect((await call('/posts/bulk', 'admin', 'POST', { action: 'move', ids: [1] })).status).toBe(
      400,
    )
    const anonymous = await handle(
      new Request(`${BASE}/posts/bulk`, { method: 'POST', body: '{"action":"publish","ids":[1]}' }),
    )
    expect(anonymous.status).toBe(401)
  })
})

describe('bulk actions on every match, in the background (#280)', () => {
  it('publishes every match in steps, with progress and a summary', async () => {
    await seed(230, (n) => n % 50 === 7)
    const response = await call('/posts/bulk', 'editor', 'POST', {
      action: 'publish',
      where: { n: { gte: 0 } },
    })
    expect(response.status).toBe(202)
    const started = (await response.json()) as Operation
    expect(started).toMatchObject({ total: 230, done: 0 })
    const op = (await finished(started.id, 'editor')) as Operation & {
      problems: { reason: string }[]
    }
    expect(op).toMatchObject({ state: 'done', done: 225, skipped: 5 })
    expect(op.problems.map((p) => p.reason)).toEqual(Array(5).fill('forbidden'))
    expect(await published()).toBe(225)
    // In the user's list, not in anyone else's.
    const mine = (await (await call('/admin/ui/bulk', 'editor')).json()) as { docs: Operation[] }
    expect(mine.docs.map((d) => d.id)).toEqual([started.id])
    expect((await call(`/posts/bulk/${started.id}`, 'admin')).status).toBe(404)
  })

  it('only changes what still matches, and deletes', async () => {
    await seed(120)
    const started = (await (
      await call('/posts/bulk', 'admin', 'POST', { action: 'delete', where: { n: { lt: 100 } } })
    ).json()) as Operation
    expect(started.total).toBe(100)
    expect(await finished(started.id)).toMatchObject({ state: 'done', done: 100 })
    expect(await cms.count('posts', { draft: true })).toBe(20)
  })

  it('refuses more than 10,000 matches', async () => {
    for (let n = 0; n < 10_001; n++)
      await cms.db.create({
        collection: 'posts',
        data: {
          n,
          locked: false,
          status: 'draft',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      })
    const response = await call('/posts/bulk', 'admin', 'POST', { action: 'publish' })
    expect(response.status).toBe(400)
    expect(await response.text()).toMatch(/More than 10,000 documents match/)
  }, 120_000)

  it('stops after the step running when cancelled', async () => {
    await seed(300)
    const started = (await (
      await call('/posts/bulk', 'admin', 'POST', { action: 'publish', where: {} })
    ).json()) as Operation
    const cancelled = await call(`/posts/bulk/${started.id}/cancel`, 'admin', 'POST')
    expect(cancelled.status).toBe(200)
    const op = await finished(started.id)
    expect(op.state).toBe('cancelled')
    expect(op.done).toBeLessThan(300)
    expect(await published()).toBe(op.done)
  })

  it('is picked up by the jobs when the process that started it stopped', async () => {
    await seed(5)
    const now = new Date().toISOString()
    const admin = await cms.auth.login({ email: 'admin@x.co', password: 'password123' })
    // As left by a process that stopped before its first step.
    const row = await cms.db.create({
      collection: 'bulk-operations',
      data: {
        collection: 'posts',
        action: 'publish',
        query: null,
        folder: null,
        transferTo: null,
        user: String(admin.user.id),
        state: 'running',
        total: 5,
        done: 0,
        skipped: 0,
        failed: 0,
        after: null,
        problems: [],
        error: null,
        leaseUntil: new Date(Date.now() - 1000).toISOString(),
        finishedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    })
    const ran = await cms.runJobs()
    expect(ran.bulk.steps).toBeGreaterThan(0)
    expect(await cms.db.findById({ collection: 'bulk-operations', id: row.id })).toMatchObject({
      state: 'done',
      done: 5,
    })
    expect(await published()).toBe(5)
  })
})
