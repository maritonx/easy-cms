import { createRestHandler, defineConfig } from '@easy-cms/core'
import { describe, expect, it } from 'vitest'
import { db, open, rawQuery, SECRET, table, tempProject } from './helpers.js'

const config = defineConfig({
  secret: SECRET,
  db: db(),
  apiKeys: true,
  rateLimit: { anonymous: 3, users: 5, apiKeys: 4 },
  collections: [
    { slug: 'notes', access: { read: () => true }, fields: [{ name: 'text', type: 'text' }] },
  ],
})

const BASE = 'http://cms.test/api/cms'

/** The limiter of an instance (internal): to sync its counts now instead of after a few seconds. */
const limiter = (cms: unknown) =>
  (cms as { rateLimiter: { sync(): Promise<void>; clear(now: Date): Promise<number> } }).rateLimiter

describe('rate limits (#168)', () => {
  it('limits each IP, user and API key, with 429 and Retry-After', async () => {
    const cms = await open(config)
    let ip = '203.0.113.1'
    const handle = createRestHandler(cms, { getClientIp: () => ip })
    const get = (path = '/notes', headers: Record<string, string> = {}) =>
      handle(new Request(`${BASE}${path}`, { headers }))

    for (let i = 0; i < 3; i++) expect((await get()).status).toBe(200)
    const refused = await get()
    expect(refused.status).toBe(429)
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(Number(refused.headers.get('retry-after'))).toBeLessThanOrEqual(60)
    // Health checks aren't counted.
    expect((await get('/healthz')).status).toBe(200)
    // Another visitor has a count of their own.
    ip = '203.0.113.2'
    expect((await get()).status).toBe(200)

    // A signed-in user is counted as themselves, from any IP.
    const email = 'admin@example.test'
    const admin = await cms.create('users', {
      email,
      password: 'password123',
      role: 'admin',
    } as never)
    const { token } = await cms.auth.login({ email, password: 'password123' })
    const asUser = { authorization: `Bearer ${token}` }
    for (let i = 0; i < 5; i++) expect((await get('/notes', asUser)).status).toBe(200)
    expect((await get('/notes', asUser)).status).toBe(429)

    const { key } = await cms.createApiKey({
      name: 'Script',
      user: admin.id,
      permissions: { collections: { notes: ['read'] } },
    })
    const asKey = { authorization: `Bearer ${key}` }
    for (let i = 0; i < 4; i++) expect((await get('/notes', asKey)).status).toBe(200)
    expect((await get('/notes', asKey)).status).toBe(429)
    await cms.destroy()
  })

  it('shares counts between instances through the database', async () => {
    const cwd = tempProject()
    const one = await open(config, cwd)
    const two = await open(config, cwd)
    const get = (cms: typeof one) =>
      createRestHandler(cms, { getClientIp: () => '198.51.100.7' })(new Request(`${BASE}/notes`))
    expect((await get(one)).status).toBe(200)
    expect((await get(two)).status).toBe(200)
    expect((await get(two)).status).toBe(200)
    // Each adds what it counted and reads the total: 3 requests, the limit.
    await limiter(one).sync()
    await limiter(two).sync()
    await limiter(one).sync()
    expect((await get(one)).status).toBe(429)
    // No IP is stored.
    const rows = await rawQuery(cwd, `select key, count from ${table(cwd, 'rate_limits')}`)
    expect(rows).toHaveLength(1)
    expect(String(rows[0]?.key)).not.toContain('198.51.100.7')
    expect(Number(rows[0]?.count)).toBe(3)
    // Windows that are over are cleared by the jobs.
    expect(await limiter(one).clear(new Date(Date.now() + 120_000))).toBe(1)
    await one.destroy()
    await two.destroy()
  })

  it("doesn't limit visitors when the adapter can't tell their IP", async () => {
    const cms = await open(config)
    const handle = createRestHandler(cms)
    for (let i = 0; i < 6; i++)
      expect((await handle(new Request(`${BASE}/notes`))).status).toBe(200)
    await cms.destroy()
  })
})
