import { oidc } from '@easy-cms/auth-oauth'
import {
  type AdminSso,
  consoleEmail,
  createRestHandler,
  defineConfig,
  type RestHandler,
  type UserIdentity,
} from '@easy-cms/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  type MockAccount,
  type MockProvider,
  startMockProvider,
} from '../../auth-oauth/test/mock-provider.js'
import { db, open, SECRET, tempProject } from './helpers.js'

/** Signing in to the admin with outside accounts (`auth.providers`), through the REST API. */
let mock: MockProvider
let cms: Awaited<ReturnType<typeof open>>
let handle: RestHandler
const mail = consoleEmail()

const ORIGIN = 'http://cms.test'
const API = `${ORIGIN}/api/cms`

const config = (password = true) =>
  defineConfig({
    secret: SECRET,
    db: db(),
    email: mail,
    auth: {
      password,
      providers: [
        oidc({
          id: 'acme',
          name: 'Acme',
          issuer: mock.url,
          clientId: mock.clientId,
          clientSecret: mock.clientSecret,
          // The organization's own provider: staff are signed in by email.
          linkByEmail: true,
        }),
        // Any other provider: staff link it from their account page first.
        oidc({
          id: 'other',
          name: 'Other',
          issuer: mock.url,
          clientId: mock.clientId,
          clientSecret: mock.clientSecret,
        }),
      ],
      allowSignUp: { domains: ['acme.test'], role: 'editor' },
      // Site members too: their sign-ups wait for the email to be confirmed.
      roles: ['admin', 'editor', 'customer'],
      members: { roles: ['customer'], signup: { role: 'customer' } },
    },
    collections: [{ slug: 'posts', fields: [{ name: 'title', type: 'text' }] }],
  })

/** Cookies a browser would keep, by name. */
type Jar = Map<string, string>
function keep(jar: Jar, response: Response) {
  for (const header of response.headers.getSetCookie()) {
    const [pair] = header.split(';')
    const eq = (pair as string).indexOf('=')
    const name = (pair as string).slice(0, eq)
    const value = decodeURIComponent((pair as string).slice(eq + 1))
    if (value === '' || /max-age=0/i.test(header)) jar.delete(name)
    else jar.set(name, value)
  }
}
const cookieHeader = (jar: Jar) =>
  [...jar].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ')

async function call(path: string, jar: Jar, init: RequestInit = {}) {
  const response = await handle(
    new Request(path.startsWith('http') ? path : `${API}${path}`, {
      ...init,
      headers: { cookie: cookieHeader(jar), origin: ORIGIN, ...(init.headers ?? {}) },
    }),
  )
  keep(jar, response)
  return response
}

/** The whole round trip: our login URL, the provider, and back to the callback. */
async function signIn(
  account: MockAccount | null,
  jar: Jar = new Map(),
  redirect = '/admin/collections/posts',
  provider = 'acme',
) {
  const start = await call(`/auth/${provider}/login?redirect=${encodeURIComponent(redirect)}`, jar)
  expect(start.status).toBe(302)
  if (account) mock.signInAs(account)
  const atProvider = await fetch(String(start.headers.get('location')), { redirect: 'manual' })
  const callback = await call(String(atProvider.headers.get('location')), jar)
  expect(callback.status).toBe(302)
  return { jar, location: String(callback.headers.get('location')) }
}
const me = async (jar: Jar) =>
  (
    (await (await call('/users/me', jar)).json()) as {
      user: { email: string; role: string } | null
    }
  ).user

beforeAll(async () => {
  mock = await startMockProvider()
  cms = await open(config(), tempProject())
  handle = createRestHandler(cms)
  await cms.create('users', { email: 'admin@x.co', password: 'password123', role: 'admin' })
  await cms.create('users', { email: 'ann@x.co', password: 'password123', role: 'editor' })
})
afterAll(async () => {
  await cms.destroy()
  await mock.close()
})

describe('signing in with a provider', () => {
  it('matches an existing user by verified email, and goes back where they were going', async () => {
    const { jar, location } = await signIn({ sub: 'ann-1', email: 'ANN@x.co' })
    expect(location).toBe('/admin/collections/posts')
    expect(await me(jar)).toMatchObject({ email: 'ann@x.co', role: 'editor' })
    // The provider's own id signs them in next time, even with another email there.
    const again = await signIn({ sub: 'ann-1', email: 'ann.new@other.test' })
    expect(await me(again.jar)).toMatchObject({ email: 'ann@x.co' })
  })

  it('makes accounts for allowed domains only, and never from unverified emails', async () => {
    const { jar } = await signIn({ sub: 'bob-1', email: 'bob@acme.test', name: 'Bob' })
    expect(await me(jar)).toMatchObject({ email: 'bob@acme.test', role: 'editor' })
    expect((await signIn({ sub: 'eve-1', email: 'eve@elsewhere.test' })).location).toBe(
      '/admin/login?sso=no-account',
    )
    expect((await signIn({ sub: 'mal-1', email: 'admin@x.co', verified: false })).location).toBe(
      '/admin/login?sso=unverified',
    )
  })

  it('refuses deactivated users, forged returns and other sites to go back to', async () => {
    const carl = await cms.create('users', {
      email: 'carl@x.co',
      password: 'password123',
      role: 'editor',
      active: false,
    })
    expect((await signIn({ sub: 'carl-1', email: 'carl@x.co' })).location).toBe(
      '/admin/login?sso=inactive',
    )
    await cms.delete('users', carl.id as number)

    // The callback without the cookie set at the start (another browser): nothing happens.
    const start = await call('/auth/acme/login', new Map())
    mock.signInAs({ sub: 'ann-1', email: 'ann@x.co' })
    const atProvider = await fetch(String(start.headers.get('location')), { redirect: 'manual' })
    const stranger = await call(String(atProvider.headers.get('location')), new Map())
    expect(stranger.headers.get('location')).toBe('/admin/login?sso=expired')
    expect(stranger.headers.getSetCookie().some((c) => c.startsWith('ecms-session='))).toBe(false)

    expect(
      (await signIn({ sub: 'ann-1', email: 'ann@x.co' }, new Map(), 'https://evil.test/')).location,
    ).toBe('/admin/')
    expect(
      (await signIn({ sub: 'ann-1', email: 'ann@x.co' }, new Map(), '//evil.test')).location,
    ).toBe('/admin/')
  })
})

describe('staff and providers not trusted with their email', () => {
  it('link the provider from their account first; site members are matched by email', async () => {
    const staff = await signIn({ sub: 'ann-9', email: 'ann@x.co' }, new Map(), '/admin/', 'other')
    expect(staff.location).toBe('/admin/login?sso=link-first')
    await cms.create('users', {
      email: 'meg@shop.test',
      password: 'member-pass-1',
      role: 'customer',
    } as never)
    const member = await signIn(
      { sub: 'meg-1', email: 'meg@shop.test' },
      new Map(),
      '/admin/',
      'other',
    )
    expect(member.location).not.toContain('sso=')
  })
})

describe('linked accounts', () => {
  it('lists and unlinks them, but not the last way to sign in', async () => {
    const { jar } = await signIn({ sub: 'bob-1', email: 'bob@acme.test' })
    const list = (await (await call('/auth/identities', jar)).json()) as UserIdentity[]
    expect(list).toMatchObject([{ provider: 'acme', name: 'Acme', email: 'bob@acme.test' }])
    // Bob has no password: Acme is his only way in.
    const unlink = await call(`/auth/identities/${list[0]?.id}`, jar, {
      method: 'DELETE',
      headers: { 'x-csrf-token': jar.get('ecms-csrf') as string },
    })
    expect(unlink.status).toBe(400)
  })

  it('links another account to the signed-in user, never one that is someone else’s', async () => {
    const admin = new Map<string, string>()
    const login = await call('/users/login', admin, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin@x.co', password: 'password123' }),
    })
    expect(login.status).toBe(200)
    const csrf = { 'x-csrf-token': admin.get('ecms-csrf') as string }
    const link = async (account: MockAccount) => {
      const started = await call('/auth/acme/link', admin, { method: 'POST', headers: csrf })
      const { url } = (await started.json()) as { url: string }
      mock.signInAs(account)
      const atProvider = await fetch(url, { redirect: 'manual' })
      return (await call(String(atProvider.headers.get('location')), admin)).headers.get('location')
    }
    expect(await link({ sub: 'ann-1', email: 'ann@x.co' })).toBe('/admin/account?sso=taken')
    expect(await link({ sub: 'admin-1', email: 'boss@other.test' })).toBe(
      '/admin/account?sso=linked',
    )
    // Now the admin signs in with it.
    expect(
      await me((await signIn({ sub: 'admin-1', email: 'boss@other.test' })).jar),
    ).toMatchObject({
      email: 'admin@x.co',
    })
    // Linking needs the CSRF token, like any change.
    expect((await call('/auth/acme/link', admin, { method: 'POST' })).status).toBe(403)

    const settings = (await (await call('/admin/sso', admin)).json()) as AdminSso
    expect(settings).toMatchObject({
      providers: [
        { id: 'acme', name: 'Acme', callbackURL: `${ORIGIN}/api/cms/auth/acme/callback` },
        { id: 'other', name: 'Other', callbackURL: `${ORIGIN}/api/cms/auth/other/callback` },
      ],
      password: 'everyone',
      signUp: { domains: ['acme.test'], role: 'editor' },
    })
    expect(
      (await call('/admin/sso', (await signIn({ sub: 'ann-1', email: 'ann@x.co' })).jar)).status,
    ).toBe(403)
  })

  it('are unlinked from someone else only by a system admin', async () => {
    const admin = (await cms.find('users', { where: { email: { equals: 'admin@x.co' } } })).docs[0]
    const [identity] = await cms.auth.sso.identities(admin?.id as number)
    expect(identity).toBeDefined()
    // The admin of one tenant (multi-tenant plugin) is an admin, but not of the system.
    const tenantAdmin = { id: 999, email: 'tenant@x.co', role: 'admin', scoped: true }
    await expect(
      cms.auth.sso.unlink(tenantAdmin as never, identity?.id as number),
    ).rejects.toMatchObject({ name: 'ForbiddenError' })
    expect(await cms.auth.sso.identities(admin?.id as number)).toHaveLength(1)
  })

  it('confirm an account still waiting for its email, and drop the password set before', async () => {
    // A sign-up made with someone else's email (never confirmed), and its password.
    await cms.create('users', {
      email: 'gus@acme.test',
      password: 'someone-else-1',
      role: 'customer',
      emailVerified: false,
    } as never)
    expect(await me((await signIn({ sub: 'gus-1', email: 'gus@acme.test' })).jar)).toMatchObject({
      email: 'gus@acme.test',
    })
    const gus = (await cms.find('users', { where: { email: { equals: 'gus@acme.test' } } }))
      .docs[0] as { emailVerified?: boolean }
    expect(gus.emailVerified).toBe(true)
    await expect(
      cms.auth.login({ email: 'gus@acme.test', password: 'someone-else-1' }),
    ).rejects.toThrow()
  })

  it('are forgotten with their user', async () => {
    const bob = (await cms.find('users', { where: { email: { equals: 'bob@acme.test' } } })).docs[0]
    await cms.delete('users', bob?.id as number)
    expect(await cms.auth.sso.identities(bob?.id as number)).toEqual([])
  })
})

describe('without passwords (auth.password: false)', () => {
  it('lets only admins use a password, and invites people to sign in with the provider', async () => {
    const cwd = tempProject()
    const strict = await open(config(false), cwd)
    const strictHandle = createRestHandler(strict)
    try {
      await strict.create('users', { email: 'admin@x.co', password: 'password123', role: 'admin' })
      await strict.create('users', { email: 'ed@x.co', password: 'password123', role: 'editor' })
      const login = (email: string) =>
        strictHandle(
          new Request(`${API}/users/login`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', origin: ORIGIN },
            body: JSON.stringify({ email, password: 'password123' }),
          }),
        )
      expect((await login('admin@x.co')).status).toBe(200)
      const refused = await login('ed@x.co')
      expect(refused.status).toBe(401)
      expect(JSON.stringify(await refused.json())).toContain('Sign in with Acme')

      const init = (await (await strictHandle(new Request(`${API}/users/init`))).json()) as {
        providers: { id: string }[]
        password: boolean
      }
      expect(init).toMatchObject({
        providers: [
          { id: 'acme', name: 'Acme' },
          { id: 'other', name: 'Other' },
        ],
        password: false,
      })

      const invited = await strict.create('users', { email: 'new@x.co', role: 'editor' })
      mail.sent.length = 0
      await strict.auth.sendPasswordLink(invited.id as number, { origin: ORIGIN })
      expect(mail.sent[0]?.text).toContain('Sign in with Acme')
      expect(mail.sent[0]?.text).toContain(`${ORIGIN}/admin/login`)
      // No password links for them.
      mail.sent.length = 0
      await strict.auth.requestPasswordReset({ email: 'ed@x.co', origin: ORIGIN })
      expect(mail.sent).toEqual([])
    } finally {
      await strict.destroy()
    }
  })
})
