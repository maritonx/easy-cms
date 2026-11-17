import { type Config, ConfigError, createRestHandler, defineConfig } from '@easy-cms/core'
import { describe, expect, it } from 'vitest'
import { db, open, SECRET } from './helpers.js'

// Endpoint `access`, `onResponse` and `onError` (#440, ADR-0072).

const PASSWORD = 'password123'
const BASE = 'http://cms.test/api/cms'

/** What the hooks saw, in order. */
let seen: string[] = []

const config = (extra: Partial<Config> = {}) =>
  defineConfig({
    secret: SECRET,
    db: db(),
    collections: [
      {
        slug: 'posts',
        access: { read: () => true },
        fields: [{ name: 'title', type: 'text', required: true }],
      },
    ],
    endpoints: [
      {
        path: '/reports/sales',
        method: 'get',
        access: ({ user }) => user?.role === 'admin',
        handler: () => ({ total: 42 }),
      },
      {
        path: '/reports/:region',
        method: 'get',
        access: ({ params }) => params.region !== 'secret',
        handler: ({ params }) => ({ region: params.region }),
      },
      {
        path: '/reports/boom',
        method: 'post',
        handler: () => {
          throw new Error('payment provider down')
        },
      },
    ],
    ...extra,
  } as Config)

async function setup(extra: Partial<Config> = {}) {
  seen = []
  const cms = await open(config(extra))
  const errors: string[] = []
  Object.assign(cms, { logger: { ...cms.logger, error: (m: string) => errors.push(m) } })
  const handle = createRestHandler(cms)
  const call = (path: string, init: RequestInit = {}) => handle(new Request(`${BASE}${path}`, init))
  await cms.create('users', { email: 'admin@x.co', password: PASSWORD, role: 'admin' })
  await cms.create('users', { email: 'ed@x.co', password: PASSWORD, role: 'editor' })
  const login = async (email: string) => {
    const response = await call('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }),
    })
    const cookie = response.headers
      .getSetCookie()
      .find((c) => c.startsWith('ecms-session='))
      ?.split(';')[0] as string
    return { cookie }
  }
  return { cms, call, login, errors }
}

describe('endpoint access (#440)', () => {
  it('answers 401 without a user and 403 with one, before the handler runs', async () => {
    const { cms, call, login } = await setup()
    expect((await call('/reports/sales')).status).toBe(401)
    expect((await call('/reports/sales', { headers: await login('ed@x.co') })).status).toBe(403)
    const ok = await call('/reports/sales', { headers: await login('admin@x.co') })
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ total: 42 })
    await cms.destroy()
  })

  it('gets the path params', async () => {
    const { cms, call } = await setup()
    expect(await (await call('/reports/north')).json()).toEqual({ region: 'north' })
    expect((await call('/reports/secret')).status).toBe(401)
    await cms.destroy()
  })

  it('must be a function', async () => {
    await expect(
      open(
        config({
          endpoints: [{ path: '/x/y', method: 'get', access: true as never, handler: () => null }],
        }),
      ),
    ).rejects.toThrow(ConfigError)
  })
})

describe('onResponse (#440)', () => {
  it('runs on every API response, in order, each given the one before', async () => {
    const { cms, call } = await setup({
      onResponse: [
        ({ response, url, user }) => {
          seen.push(`${url.pathname} ${response.status} ${user ? 'user' : 'anonymous'}`)
          const headers = new Headers(response.headers)
          headers.set('x-first', '1')
          return new Response(response.body, { status: response.status, headers })
        },
        ({ response }) => {
          // Sees the first one's response.
          response.headers.set('x-second', response.headers.get('x-first') ?? 'missing')
        },
      ],
    })
    const built = await call('/posts')
    expect(built.status).toBe(200)
    expect(built.headers.get('x-first')).toBe('1')
    expect(built.headers.get('x-second')).toBe('1')
    // The request id is still set.
    expect(built.headers.get('x-request-id')).toBeTruthy()
    const custom = await call('/reports/north')
    expect(custom.headers.get('x-second')).toBe('1')
    // Errors too.
    expect((await call('/reports/sales')).headers.get('x-first')).toBe('1')
    // Not health probes.
    expect((await call('/healthz')).headers.get('x-first')).toBeNull()
    expect(seen).toEqual([
      '/api/cms/posts 200 anonymous',
      '/api/cms/reports/north 200 anonymous',
      '/api/cms/reports/sales 401 anonymous',
    ])
    await cms.destroy()
  })

  it('keeps the response when one throws, and logs it', async () => {
    const { cms, call, errors } = await setup({
      onResponse: () => {
        throw new Error('logger down')
      },
    })
    expect((await call('/posts')).status).toBe(200)
    expect(errors.some((e) => e.includes('onResponse failed: logger down'))).toBe(true)
    await cms.destroy()
  })
})

describe('onError (#440)', () => {
  it('sees each failure with its status, and may replace the error response', async () => {
    const reported: string[] = []
    const { cms, call } = await setup({
      onError: [
        ({ error, status, url }) => {
          reported.push(`${url.pathname} ${status} ${(error as Error).message}`)
        },
        // Only the unexpected ones: the API's own body for the rest.
        ({ status }) =>
          status === 500
            ? Response.json({ message: 'Something went wrong', ref: 'abc' }, { status: 503 })
            : undefined,
      ],
    })
    const failed = await call('/reports/boom', { method: 'POST' })
    expect(failed.status).toBe(503)
    expect(await failed.json()).toEqual({ message: 'Something went wrong', ref: 'abc' })
    // The API's own error body for the others.
    const refused = await call('/reports/sales')
    expect(refused.status).toBe(401)
    expect(await refused.json()).toMatchObject({ errors: [{ code: 'UNAUTHORIZED' }] })
    expect((await call('/posts/999999')).status).toBe(404)
    expect(reported).toEqual([
      '/api/cms/reports/boom 500 payment provider down',
      '/api/cms/reports/sales 401 You must be logged in',
      expect.stringMatching(/^\/api\/cms\/posts\/999999 404 /),
    ])
    await cms.destroy()
  })

  it('falls back to the API error when one throws', async () => {
    const { cms, call, errors } = await setup({
      onError: () => {
        throw new Error('sentry down')
      },
    })
    expect((await call('/reports/sales')).status).toBe(401)
    expect(errors.some((e) => e.includes('onError failed: sentry down'))).toBe(true)
    await cms.destroy()
  })
})
