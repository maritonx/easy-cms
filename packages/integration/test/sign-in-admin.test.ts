import { oidc, oidcSignIn, signInPlugin } from '@easy-cms/auth-oauth'
import {
  type AdminSso,
  createRestHandler,
  defineConfig,
  type IntegrationConfig,
  type RestHandler,
} from '@easy-cms/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type MockProvider, startMockProvider } from '../../auth-oauth/test/mock-provider.js'
import { db, open, SECRET, tempProject } from './helpers.js'

/**
 * Sign-in providers turned on in the admin (ADR-0066): a connection of a sign-in integration,
 * tested first, beside the config's `auth.providers`; the lockout guard; `reset`.
 */
let mock: MockProvider
let cms: Awaited<ReturnType<typeof open>>
let handle: RestHandler

const ORIGIN = 'http://cms.test'
const API = `${ORIGIN}/api/cms`

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

async function call(path: string, jar: Jar, init: RequestInit & { json?: unknown } = {}) {
  const { json, ...rest } = init
  const response = await handle(
    new Request(path.startsWith('http') ? path : `${API}${path}`, {
      ...rest,
      ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
      headers: {
        cookie: cookieHeader(jar),
        origin: ORIGIN,
        ...(json !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(jar.has('ecms-csrf') ? { 'x-csrf-token': jar.get('ecms-csrf') as string } : {}),
        ...(rest.headers ?? {}),
      },
    }),
  )
  keep(jar, response)
  return response
}

async function passwordLogin(email: string): Promise<Jar> {
  const jar: Jar = new Map()
  const response = await call('/auth/login', jar, {
    method: 'POST',
    json: { email, password: 'password123' },
  })
  expect(response.status).toBe(200)
  return jar
}

/** Our login URL, the provider, and back to the callback. */
async function providerLogin(provider: string, sub: string, email: string, jar: Jar = new Map()) {
  const start = await call(`/auth/${provider}/login`, jar)
  if (start.status !== 302) return { jar, location: null, status: start.status }
  mock.signInAs({ sub, email })
  const atProvider = await fetch(String(start.headers.get('location')), { redirect: 'manual' })
  const callback = await call(String(atProvider.headers.get('location')), jar)
  return { jar, location: callback.headers.get('location'), status: callback.status }
}

const me = async (jar: Jar) =>
  ((await (await call('/auth/me', jar)).json()) as { user: { email: string } | null }).user

const buttons = async () =>
  (
    (await (await call('/auth/init', new Map())).json()) as { providers: { id: string }[] }
  ).providers.map((p) => p.id)

let admin: Jar
let connection: string

beforeAll(async () => {
  mock = await startMockProvider()
  cms = await open(
    defineConfig({
      secret: SECRET,
      db: db(),
      serverURL: ORIGIN,
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
      },
      plugins: [signInPlugin({ providers: [oidcSignIn] })],
      collections: [{ slug: 'posts', fields: [{ name: 'title', type: 'text' }] }],
    }),
    tempProject(),
  )
  handle = createRestHandler(cms)
  await cms.create('users', { email: 'admin@x.co', password: 'password123', role: 'admin' })
  await cms.create('users', { email: 'ann@x.co', password: 'password123', role: 'editor' })
  admin = await passwordLogin('admin@x.co')
})
afterAll(async () => {
  await cms.destroy()
  await mock.close()
})

describe('sign-in providers in the admin', () => {
  it('connects an OpenID Connect provider, which does nothing until it is tested and turned on', async () => {
    const created = await call('/admin/integrations/oidc-sign-in/connections', admin, {
      method: 'POST',
      json: {
        name: 'Okta',
        values: {
          label: 'Okta',
          id: 'okta',
          issuer: mock.url,
          clientId: mock.clientId,
          clientSecret: mock.clientSecret,
        },
      },
    })
    expect(created.status).toBe(201)
    connection = String(((await created.json()) as { id: unknown }).id)
    expect(await buttons()).toEqual(['acme'])

    const overview = (await (await call('/admin/integrations', admin)).json()) as {
      integrations: {
        id: string
        connections: {
          signIn?: { providerId: string; callbackURL: string; on: boolean; tested: unknown }
        }[]
      }[]
      signIn: { locked: boolean; code: { id: string; on: boolean }[] }
    }
    const card = overview.integrations.find((i) => i.id === 'oidc-sign-in')
    expect(card?.connections[0]?.signIn).toEqual({
      providerId: 'okta',
      callbackURL: `${API}/auth/okta/callback`,
      on: false,
      tested: null,
    })
    expect(overview.signIn).toEqual({
      locked: false,
      code: [expect.objectContaining({ id: 'acme', on: true })],
    })

    // Not tested yet: it can't be turned on.
    const early = await call('/admin/sign-in', admin, {
      method: 'PUT',
      json: { integration: 'oidc-sign-in', connection, on: true },
    })
    expect(early.status).toBe(400)
    expect(await early.text()).toContain('needs a passed sign-in test first')
  })

  it('tests the round trip at the provider without signing anyone in', async () => {
    const started = await call('/auth/test', admin, {
      method: 'POST',
      json: { integration: 'oidc-sign-in', connection },
    })
    expect(started.status).toBe(200)
    const { url } = (await started.json()) as { url: string }
    expect(url).toContain(encodeURIComponent(`${API}/auth/okta/callback`))
    mock.signInAs({ sub: 'someone', email: 'Someone@Okta.test' })
    const atProvider = await fetch(url, { redirect: 'manual' })
    const back = await call(String(atProvider.headers.get('location')), admin)
    expect(back.headers.get('location')).toBe(
      '/admin/integrations?sso=tested&integration=oidc-sign-in&email=someone%40okta.test',
    )
    // Still the admin, and nobody new.
    expect(await me(admin)).toMatchObject({ email: 'admin@x.co' })
    expect((await cms.find('users', { limit: 0 })).totalDocs).toBe(2)
    expect(await cms.signIn.tested({ integration: 'oidc-sign-in', connection })).toMatchObject({
      email: 'someone@okta.test',
    })
    // Only admins test.
    const editor = await passwordLogin('ann@x.co')
    const refused = await call('/auth/test', editor, {
      method: 'POST',
      json: { integration: 'oidc-sign-in', connection },
    })
    expect(refused.status).toBe(403)
  })

  it('turns it on: a button on the login page that signs people in, recorded with the session', async () => {
    const on = await call('/admin/sign-in', admin, {
      method: 'PUT',
      json: { integration: 'oidc-sign-in', connection, on: true },
    })
    expect(on.status).toBe(200)
    expect(await buttons()).toEqual(['acme', 'okta'])
    // Ann links Okta from her account page, then signs in with it.
    const ann = await passwordLogin('ann@x.co')
    const link = await call('/auth/okta/link', ann, { method: 'POST' })
    const { url } = (await link.json()) as { url: string }
    mock.signInAs({ sub: 'ann-okta', email: 'ann@x.co' })
    const atProvider = await fetch(url, { redirect: 'manual' })
    await call(String(atProvider.headers.get('location')), ann)
    const signedIn = await providerLogin('okta', 'ann-okta', 'ann@x.co')
    expect(await me(signedIn.jar)).toMatchObject({ email: 'ann@x.co' })
    const sessions = await cms.db.find({
      collection: 'sessions',
      where: { method: { equals: 'okta' } },
      sort: [],
      limit: 0,
      page: 1,
    })
    expect(sessions.totalDocs).toBe(1)

    const sso = (await (await call('/admin/ui/sso', admin)).json()) as AdminSso
    expect(sso.providers.map((p) => [p.id, p.source])).toEqual([
      ['acme', 'code'],
      ['okta', 'admin'],
    ])
    // While it signs people in, its values can't change and it can't be removed.
    const change = await call(`/admin/integrations/oidc-sign-in/connections/${connection}`, admin, {
      method: 'PATCH',
      json: { values: { label: 'Okta SSO' } },
    })
    expect(change.status).toBe(400)
    const remove = await call(`/admin/integrations/oidc-sign-in/connections/${connection}`, admin, {
      method: 'DELETE',
    })
    expect(remove.status).toBe(400)

    // Turned off: the button goes, and so do the sessions started with it.
    const off = await call('/admin/sign-in', admin, {
      method: 'PUT',
      json: { integration: 'oidc-sign-in', connection, on: false },
    })
    expect(((await off.json()) as { sessionsEnded: number }).sessionsEnded).toBe(1)
    expect(await buttons()).toEqual(['acme'])
    expect(await me(signedIn.jar)).toBeNull()
    expect(await me(ann)).toMatchObject({ email: 'ann@x.co' })
  })

  it("turns the config's provider off, but never so no admin can sign in", async () => {
    const off = await call('/admin/sign-in', admin, {
      method: 'PUT',
      json: { code: 'acme', on: false },
    })
    expect(off.status).toBe(200)
    expect(await buttons()).toEqual([])
    expect((await providerLogin('acme', 'x', 'admin@x.co')).status).toBe(404)
    expect(
      (await call('/admin/sign-in', admin, { method: 'PUT', json: { code: 'acme', on: true } }))
        .status,
    ).toBe(200)

    // The only admin signs in with acme alone (no password): turning it off would lock them out.
    const [boss] = (await cms.find('users', { where: { email: { equals: 'admin@x.co' } } })).docs
    const raw = await cms.db.findById({ collection: 'users', id: boss?.id as never })
    const { id, ...rest } = raw as Record<string, unknown>
    await cms.db.update({
      collection: 'users',
      id: id as never,
      data: { ...rest, passwordHash: null },
    })
    await cms.db.create({
      collection: 'user-identities',
      data: {
        user: id,
        provider: 'acme',
        subject: 'boss',
        email: 'admin@x.co',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    })
    const locked = await call('/admin/sign-in', admin, {
      method: 'PUT',
      json: { code: 'acme', on: false },
    })
    expect(locked.status).toBe(400)
    expect(await locked.text()).toContain('No admin could sign in after this')
    expect(await buttons()).toEqual(['acme'])
  })

  it('goes back to the config with reset, as easy-cms reset-sign-in does', async () => {
    await cms.signIn.reset(null)
    expect(await buttons()).toEqual(['acme'])
    expect(await cms.signIn.setting()).toEqual({ on: [], off: [] })
  })
})

describe('app keys shared between integrations', () => {
  it('keeps one Google app for Drive backups and signing in, also keys saved before 1.43', async () => {
    // Like @easy-cms/plugin-backups' Google Drive: an OAuth integration with the shared keys.
    const drive: IntegrationConfig = {
      id: 'google-drive',
      label: 'Google Drive',
      category: 'backups',
      kind: 'oauth',
      oauth: {
        app: {
          fields: [
            { name: 'clientId', required: true },
            { name: 'clientSecret', secret: true, required: true },
          ],
          shared: 'google',
        },
        authorizeUrl: () => 'https://accounts.google.test/',
        exchange: () => ({}),
      },
      backups: () => ({
        put: async () => undefined,
        get: async () => null,
        delete: async () => {},
      }),
    }
    const shared = await open(
      defineConfig({
        secret: SECRET,
        db: db(),
        integrations: [drive],
        plugins: [signInPlugin()],
        collections: [],
      }),
      tempProject(),
    )
    try {
      const now = new Date().toISOString()
      // Saved by 1.42, on Google Drive's own row.
      await shared.db.create({
        collection: 'connections',
        data: {
          kind: 'integration',
          integration: 'google-drive',
          name: null,
          values: { app: { clientId: 'old-id' } },
          createdAt: now,
          updatedAt: now,
        },
      })
      expect(await shared.integrations.app('google-sign-in')).toMatchObject({ clientId: 'old-id' })
      const boss = await shared.create('users', {
        email: 'boss@x.co',
        password: 'password123',
        role: 'admin',
      })
      const user = { ...boss, role: 'admin' } as never
      await shared.integrations.setApp(
        'google-sign-in',
        { values: { clientId: 'new-id', clientSecret: 'new-secret' } },
        user,
      )
      expect(await shared.integrations.app('google-drive')).toEqual({
        clientId: 'new-id',
        clientSecret: 'new-secret',
      })
      const overview = await shared.integrations.overview(
        'http://cms.test/api/cms/admin/integrations',
      )
      const drive = overview.integrations.find((i) => i.id === 'google-drive')
      expect(drive?.app?.sharedWith).toEqual(['Google'])
      expect(overview.integrations.find((i) => i.id === 'google-sign-in')?.app?.redirectUri).toBe(
        'http://cms.test/api/cms/auth/google/callback',
      )
    } finally {
      await shared.destroy()
    }
  })
})
