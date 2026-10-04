import {
  type AdminStatus,
  consoleEmail,
  createRestHandler,
  defineConfig,
  definePlugin,
  type RestHandler,
} from '@easy-cms/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, open, SECRET } from './helpers.js'

/** What the dashboard shows admins: the system, and what needs attention. */
const named = definePlugin((config) => config, { name: '@acme/stats', version: '1.2.0' })
const config = defineConfig({
  secret: SECRET,
  db: db(),
  email: consoleEmail({ log: () => {} }),
  webhooks: [{ url: 'https://hooks.example.com/build', events: ['create'] }],
  collections: [
    { slug: 'posts', drafts: true, schedule: true, fields: [{ name: 'title', type: 'text' }] },
  ],
  plugins: [named, (c) => c],
})

type CMS = Awaited<ReturnType<typeof open<typeof config>>>
let cms: CMS
let handle: RestHandler
beforeAll(async () => {
  cms = await open(config)
  handle = createRestHandler(cms)
  await cms.create('users', { email: 'admin@x.co', password: 'password123', role: 'admin' })
  await cms.create('users', { email: 'editor@x.co', password: 'password123', role: 'editor' })
})
afterAll(() => cms.destroy())

async function status(email = 'admin@x.co') {
  const { token } = await cms.auth.login({ email, password: 'password123' })
  return handle(
    new Request('http://cms.test/api/cms/admin/status', {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
}

describe('admin status', () => {
  it('describes the system, plugins included', async () => {
    const response = await status()
    expect(response.status).toBe(200)
    const body = (await response.json()) as AdminStatus
    expect(body.system).toMatchObject({
      database: expect.stringMatching(/sqlite|postgres|pglite/),
      storage: 'local',
      email: 'console',
      plugins: [{ name: '@acme/stats', version: '1.2.0' }, {}],
      fieldTypes: [],
    })
    expect(body.system.version).toMatch(/^\d+\.\d+\.\d+/)
    // Nothing wrong yet.
    expect(body.attention).toEqual([])
  })

  it('lists what needs attention', async () => {
    const now = new Date().toISOString()
    const hourAgo = new Date(Date.now() - 2 * 3_600_000).toISOString()
    const row = (data: Record<string, unknown>) => ({ createdAt: now, updatedAt: now, ...data })
    for (const url of [
      'https://hooks.example.com/build',
      'https://hooks.example.com/build',
      'https://other.example.com',
    ])
      await cms.db.create({
        collection: 'webhook-deliveries',
        data: row({
          url,
          event: 'create',
          body: '{}',
          delivery: crypto.randomUUID(),
          attempts: 8,
          nextAttemptAt: now,
          state: 'failed',
          error: 'HTTP 500',
        }),
      })
    // One email waiting two hours; one queued just now is fine.
    await cms.db.create({
      collection: 'email-deliveries',
      data: {
        ...row({ message: '{}', attempts: 1, nextAttemptAt: now, state: 'pending', error: null }),
        createdAt: hourAgo,
      },
    })
    await cms.db.create({
      collection: 'email-deliveries',
      data: row({ message: '{}', attempts: 0, nextAttemptAt: now, state: 'pending', error: null }),
    })
    // A publish an hour late: no cron is calling jobs/run.
    await cms.db.create({
      collection: 'scheduled-jobs',
      data: row({
        parent: 'posts',
        doc: 1,
        action: 'publish',
        runAt: hourAgo,
        state: 'pending',
        error: null,
        author: null,
      }),
    })

    const body = (await (await status()).json()) as AdminStatus
    expect(body.attention).toEqual([
      { id: 'webhooks', count: 3, url: 'https://hooks.example.com/build' },
      { id: 'emails', count: 1 },
      { id: 'scheduled', count: 1 },
    ])
  })

  it('is for admins only', async () => {
    expect((await status('editor@x.co')).status).toBe(403)
  })

  it('warns without email, and without serverURL in production', async () => {
    const plain = await open(defineConfig({ secret: SECRET, db: db(), collections: [] }))
    const production = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      await plain.create('users', { email: 'a@x.co', password: 'password123', role: 'admin' })
      const { token } = await plain.auth.login({ email: 'a@x.co', password: 'password123' })
      const response = await createRestHandler(plain)(
        new Request('http://cms.test/api/cms/admin/status', {
          headers: { authorization: `Bearer ${token}` },
        }),
      )
      const body = (await response.json()) as AdminStatus
      expect(body.attention).toEqual([{ id: 'no-email' }, { id: 'no-server-url' }])
      expect(body.system.email).toBeNull()
    } finally {
      process.env.NODE_ENV = production
      await plain.destroy()
    }
  })
})
