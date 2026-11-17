import { oidc } from '@easy-cms/auth-oauth'
import {
  ConfigError,
  consoleEmail,
  createRestHandler,
  defineConfig,
  resolveConfig,
} from '@easy-cms/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type MockProvider, startMockProvider } from '../../auth-oauth/test/mock-provider.js'
import { db, open, SECRET, tempProject } from './helpers.js'

// `admin: { enabled: false }` (#442): the API without the admin UI.

const ORIGIN = 'https://site.test'
const API = `${ORIGIN}/api/cms`
const mail = consoleEmail({ log: () => {} })
let mock: MockProvider

const config = () =>
  defineConfig({
    secret: SECRET,
    db: db(),
    serverURL: ORIGIN,
    email: mail,
    admin: { enabled: false, siteURL: ORIGIN },
    auth: {
      providers: [
        oidc({
          id: 'acme',
          name: 'Acme',
          issuer: mock.url,
          clientId: mock.clientId,
          clientSecret: mock.clientSecret,
          linkByEmail: true,
        }),
      ],
      roles: ['admin', 'editor', 'customer'],
      members: {
        roles: ['customer'],
        pages: { resetPassword: '/account/reset', verifyEmail: '/account/verify' },
      },
    },
    collections: [{ slug: 'posts', fields: [{ name: 'title', type: 'text' }] }],
  })

let cms: Awaited<ReturnType<typeof open>>
let handle: (request: Request) => Promise<Response>

beforeAll(async () => {
  mock = await startMockProvider()
  cms = await open(config(), tempProject())
  handle = createRestHandler(cms)
  await cms.create('users', { email: 'admin@x.co', password: 'password123', role: 'admin' })
  await cms.create('users', { email: 'ed@x.co', password: 'password123', role: 'editor' })
})
afterAll(async () => {
  await cms.destroy()
  await mock.close()
})

const call = (path: string, init: RequestInit = {}) =>
  handle(new Request(path.startsWith('http') ? path : `${API}${path}`, init))

async function signedIn(email: string) {
  const login = await call('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ email, password: 'password123' }),
  })
  const cookie = login.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')
  return { cookie }
}

describe('the config (#442)', () => {
  it('refuses admin: false, with the way to write it', async () => {
    const error = await resolveConfig({ ...config(), admin: false as never }).catch((e) => e)
    expect(error).toBeInstanceOf(ConfigError)
    expect(String(error.message)).toContain('admin: { enabled: false }')
  })

  it('warns when emails would link to admin pages that are not there', async () => {
    const { auth, ...rest } = config()
    const resolved = await resolveConfig({
      ...rest,
      auth: { ...auth, members: { roles: ['customer'] } },
    })
    expect(resolved.warnings.map((w) => w.path)).toContain('auth.members.pages')
    expect((await resolveConfig(config())).warnings.map((w) => w.path)).not.toContain(
      'auth.members.pages',
    )
  })
})

describe('the API without the admin UI (#442)', () => {
  it("answers 404 for the admin's own routes, and serves the rest", async () => {
    const headers = await signedIn('admin@x.co')
    expect((await call('/admin/ui/schema', { headers })).status).toBe(404)
    expect((await call('/admin/ui/counts', { headers })).status).toBe(404)
    // In semver, for an admin app of your own.
    // (`admin/sign-in` takes PUT: it is there, not 404.)
    expect((await call('/admin/sign-in', { headers })).status).toBe(405)
    expect((await call('/posts', { headers })).status).toBe(200)
  })

  it("links everyone's password emails to the site's pages", async () => {
    await call('/auth/forgot-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({ email: 'ed@x.co' }),
    })
    await cms.flushEmails()
    const email = [...mail.sent].reverse().find((m) => m.to === 'ed@x.co')
    expect(email?.text).toMatch(/https:\/\/site\.test\/account\/reset\?token=/)
    expect(email?.text).not.toContain('/admin/')
  })

  it('ends provider sign-in on the site, not in the admin', async () => {
    const jar = new Map<string, string>()
    const keep = (response: Response) => {
      for (const header of response.headers.getSetCookie()) {
        const [pair] = header.split(';') as [string]
        const eq = pair.indexOf('=')
        jar.set(pair.slice(0, eq), decodeURIComponent(pair.slice(eq + 1)))
      }
      return response
    }
    const cookie = () => [...jar].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ')
    const roundTrip = async (redirect: string) => {
      jar.clear()
      const start = keep(await call(`/auth/acme/login?redirect=${encodeURIComponent(redirect)}`))
      mock.signInAs({ sub: 'ed-1', email: 'ed@x.co', verified: true })
      const atProvider = await fetch(String(start.headers.get('location')), { redirect: 'manual' })
      const back = keep(
        await call(String(atProvider.headers.get('location')), {
          headers: { cookie: cookie(), origin: ORIGIN },
        }),
      )
      return back.headers.get('location')
    }
    expect(await roundTrip('/dashboard')).toBe('/dashboard')
    // Another site: the site's home.
    expect(await roundTrip('https://evil.test/')).toBe(ORIGIN)
  })
})
