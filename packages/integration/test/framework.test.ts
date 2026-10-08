import { createApiHandler, defineConfig, sharedEasyCMS } from '@easy-cms/core'
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
    const login = (ip: string, password = 'wrong-password') =>
      api(
        new Request('http://cms.test/api/cms/users/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-forwarded-for': `${ip}, 10.0.0.1` },
          body: JSON.stringify({ email: 'a@x.co', password }),
        }),
      )
    // Login attempts count per client IP: from X-Forwarded-For.
    await login('1.1.1.1')
    await login('1.1.1.1')
    expect((await login('1.1.1.1', 'password123')).status).toBe(429)
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
