import { createApiHandler, defineConfig, sharedEasyCMS } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { describe, expect, it } from 'vitest'
import { db, SECRET, tempProject } from './helpers.js'

/** What framework adapters share: one instance, the API on it, the user of a request. */

const config = (title = 'title') =>
  defineConfig({
    secret: SECRET,
    db: db(),
    auth: { maxLoginAttempts: 2 },
    collections: [{ slug: 'posts', fields: [{ name: title, type: 'text' }] }],
  })

describe('framework kit', () => {
  it('shares one instance for configs alike, and replaces it when the config changes', async () => {
    const cwd = tempProject()
    // Two objects, as frameworks bundle the config into each server layer.
    const a = await sharedEasyCMS(config(), { cwd })
    const b = await sharedEasyCMS(config())
    expect(b).toBe(a)
    const changed = await sharedEasyCMS(config('heading'), { cwd })
    expect(changed).not.toBe(a)
    await changed.destroy()
  })

  it('serves the API on it, with the client IP behind a trusted proxy, and knows the user', async () => {
    const cwd = tempProject()
    const cfg = config('body')
    // Made with its project directory; the API handler then finds it.
    const cms = await sharedEasyCMS(cfg, { cwd })
    await cms.create('users', { email: 'a@x.co', password: 'password123', role: 'admin' })
    const api = createApiHandler(cfg, { trustProxy: true })
    let spoofed = 0
    const login = (ip: string, password = 'wrong-password') =>
      api(
        new Request('http://cms.test/api/cms/auth/login', {
          method: 'POST',
          // What the client sent first (anything), then the address the proxy added.
          headers: {
            'content-type': 'application/json',
            'x-forwarded-for': `6.6.6.${spoofed++}, ${ip}`,
          },
          body: JSON.stringify({ email: 'a@x.co', password }),
        }),
      )
    // Login attempts count per client IP: the one the proxy added to X-Forwarded-For, not what
    // the client wrote before it.
    await login('1.1.1.1')
    await login('1.1.1.1')
    const locked = await login('1.1.1.1', 'password123')
    expect(locked.status).toBe(429)
    // How long to wait, and a code programs can tell apart.
    expect(locked.headers.get('retry-after')).toBe(String(15 * 60))
    expect(((await locked.json()) as { errors: { code: string }[] }).errors[0]?.code).toBe(
      'TOO_MANY_REQUESTS',
    )
    const ok = await login('2.2.2.2', 'password123')
    expect(ok.status).toBe(200)
    const { token } = await cms.auth.login({ email: 'a@x.co', password: 'password123' })

    expect((await cms.auth.userFromHeaders(new Headers()))?.email).toBeUndefined()
    const bearer = new Headers({ authorization: `Bearer ${token}` })
    expect((await cms.auth.userFromHeaders(bearer))?.email).toBe('a@x.co')
    const cookie = new Headers({
      cookie: `theme=dark; ecms-session=${encodeURIComponent(token)}`,
    })
    expect((await cms.auth.userFromHeaders(cookie))?.email).toBe('a@x.co')
    expect(await cms.auth.userFromHeaders(new Headers({ cookie: 'ecms-session=nope' }))).toBeNull()
    await cms.destroy()
  })
})

describe('work after the response (serverless hosts)', () => {
  // A field of its own per test: shared instances are found by config.
  const backupConfig = (field: string) =>
    defineConfig({
      secret: SECRET,
      db: db(),
      backups: { sqlite },
      collections: [
        { slug: 'notes', access: { read: () => true }, fields: [{ name: field, type: 'text' }] },
      ],
    })
  const backUp = async (api: (request: Request) => Promise<Response>, token: string) =>
    api(
      new Request('http://cms.test/api/cms/admin/backups', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      }),
    )

  it('hands a backup to the host’s waitUntil, which keeps the function until it is done', async () => {
    const cwd = tempProject()
    const cfg = backupConfig('first')
    const cms = await sharedEasyCMS(cfg, { cwd })
    await cms.create('users', { email: 'a@x.co', password: 'password123', role: 'admin' })
    const { token } = await cms.auth.login({ email: 'a@x.co', password: 'password123' })
    const kept: Promise<unknown>[] = []
    const api = createApiHandler(cfg, { waitUntil: (task) => kept.push(task) })
    const started = await backUp(api, token)
    expect(started.status).toBe(202)
    // The response is out, the backup isn't done: the host waits for it.
    expect(kept).toHaveLength(1)
    await kept[0]
    expect(cms.busy).toBe(false)
    const [row] = (
      await cms.db.find({ collection: 'database-backups', sort: ['id'], limit: 1, page: 1 })
    ).docs
    expect(row?.state).toBe('done')
    await cms.destroy()
  })

  it('finds Vercel’s waitUntil without being told', async () => {
    const cwd = tempProject()
    const cfg = backupConfig('second')
    const cms = await sharedEasyCMS(cfg, { cwd })
    await cms.create('users', { email: 'b@x.co', password: 'password123', role: 'admin' })
    const { token } = await cms.auth.login({ email: 'b@x.co', password: 'password123' })
    const kept: Promise<unknown>[] = []
    const key = Symbol.for('@vercel/request-context')
    ;(globalThis as Record<symbol, unknown>)[key] = {
      get: () => ({ waitUntil: (task: Promise<unknown>) => kept.push(task) }),
    }
    try {
      expect((await backUp(createApiHandler(cfg), token)).status).toBe(202)
      expect(kept).toHaveLength(1)
      await kept[0]
    } finally {
      delete (globalThis as Record<symbol, unknown>)[key]
    }
    // Nothing goes on after a plain read: nothing to wait for.
    const read = await createApiHandler(cfg, { waitUntil: (task) => kept.push(task) })(
      new Request('http://cms.test/api/cms/notes'),
    )
    expect(read.status).toBe(200)
    expect(kept).toHaveLength(1)
    await cms.destroy()
  })
})
