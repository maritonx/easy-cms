import { oidc } from '@easy-cms/auth-oauth'
import { type AdminSso, createRestHandler, defineConfig, type RestHandler } from '@easy-cms/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type MockProvider, startMockProvider } from '../../auth-oauth/test/mock-provider.js'
import { db, open, SECRET, tempProject } from './helpers.js'

/**
 * Who may sign in, set in the admin (#409, ADR-0068): who uses a password and who signs themselves
 * up, over the config's `auth.password` and `auth.providerSignUp`; the lockout guards; reset.
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

async function passwordLogin(email: string): Promise<{ jar: Jar; status: number }> {
  const jar: Jar = new Map()
  const response = await call('/auth/login', jar, {
    method: 'POST',
    json: { email, password: 'password123' },
  })
  return { jar, status: response.status }
}

async function providerLogin(sub: string, email: string, jar: Jar = new Map()) {
  const start = await call('/auth/acme/login', jar)
  mock.signInAs({ sub, email })
  const atProvider = await fetch(String(start.headers.get('location')), { redirect: 'manual' })
  const callback = await call(String(atProvider.headers.get('location')), jar)
  return { jar, location: String(callback.headers.get('location')) }
}

const me = async (jar: Jar) =>
  ((await (await call('/auth/me', jar)).json()) as { user: { email: string } | null }).user

const sso = async (jar: Jar) => (await (await call('/admin/ui/sso', jar)).json()) as AdminSso

const rules = (jar: Jar, json: unknown, dryRun = false) =>
  call(`/admin/sign-in/rules${dryRun ? '?dryRun=1' : ''}`, jar, { method: 'PUT', json })

const errorsOf = async (response: Response) =>
  ((await response.json()) as { errors: { field: string; message: string }[] }).errors

let admin: Jar
const ids: Record<string, string | number> = {}

beforeAll(async () => {
  mock = await startMockProvider()
  cms = await open(
    defineConfig({
      secret: SECRET,
      db: db(),
      serverURL: ORIGIN,
      audit: {},
      auth: {
        providers: [
          oidc({
            id: 'acme',
            name: 'Acme',
            issuer: mock.url,
            clientId: mock.clientId,
            clientSecret: mock.clientSecret,
          }),
        ],
      },
      collections: [{ slug: 'posts', fields: [{ name: 'title', type: 'text' }] }],
    }),
    tempProject(),
  )
  handle = createRestHandler(cms)
  for (const [email, role] of [
    ['admin@x.co', 'admin'],
    ['root@x.co', 'admin'],
    ['ann@x.co', 'editor'],
  ] as const)
    ids[email] = (await cms.create('users', { email, password: 'password123', role })).id
  admin = (await passwordLogin('admin@x.co')).jar
})
afterAll(async () => {
  await cms.destroy()
  await mock.close()
})

describe('sign-up set in the admin', () => {
  it("shows the config's rules first", async () => {
    const view = await sso(admin)
    expect(view.password).toBe('everyone')
    expect(view.signUp).toBeNull()
    expect(view.sources).toEqual({ password: 'code', signUp: 'code' })
    expect(view.locked).toBe(false)
    expect(view.signUpRoles.map((r) => r.key)).toEqual(['editor'])
  })

  it('refuses public email domains, admin, and roles that do not exist', async () => {
    const open = await rules(admin, { signUp: { domains: ['gmail.com'], role: 'editor' } })
    expect(open.status).toBe(400)
    expect((await errorsOf(open))[0]?.message).toMatch(/anyone can get an address at gmail\.com/)
    const asAdmin = await rules(admin, { signUp: { domains: ['x.co'], role: 'admin' } })
    expect((await errorsOf(asAdmin))[0]?.field).toBe('role')
    const unknown = await rules(admin, { signUp: { domains: ['x.co'], role: 'boss' } })
    expect((await errorsOf(unknown))[0]?.message).toMatch(/no role "boss"/)
    const notADomain = await rules(admin, { signUp: { domains: ['not a domain'], role: 'editor' } })
    expect(notADomain.status).toBe(400)
  })

  it('lets people from a domain sign themselves up with a provider', async () => {
    const before = await providerLogin('new-1', 'new@x.co')
    expect(before.location).toContain('sso=no-account')

    expect((await rules(admin, { signUp: { domains: ['@X.co'], role: 'editor' } })).status).toBe(
      200,
    )
    const view = await sso(admin)
    expect(view.signUp).toEqual({ domains: ['x.co'], role: 'editor' })
    expect(view.sources.signUp).toBe('admin')

    const after = await providerLogin('new-1', 'new@x.co')
    expect(after.location).not.toContain('sso=')
    expect((await me(after.jar))?.email).toBe('new@x.co')
  })

  it("goes back to the config's value", async () => {
    expect((await rules(admin, { signUp: 'code' })).status).toBe(200)
    const view = await sso(admin)
    expect(view.signUp).toBeNull()
    expect(view.sources.signUp).toBe('code')
  })
})

describe('passwords set in the admin', () => {
  it('says what a change would do before making it', async () => {
    const ann = (await passwordLogin('ann@x.co')).jar
    const preview = await rules(admin, { password: 'admins' }, true)
    expect(await preview.json()).toEqual({ passwordLost: 1, sessionsEnded: 1 })
    expect((await me(ann))?.email).toBe('ann@x.co')
    expect((await sso(admin)).password).toBe('everyone')
  })

  it('turns passwords off for everyone but admins, ending their password sessions', async () => {
    const ann = (await passwordLogin('ann@x.co')).jar
    const response = await rules(admin, { password: 'admins' })
    expect(await response.json()).toEqual({ passwordLost: 1, sessionsEnded: 2 })
    expect(await me(ann)).toBeNull()
    expect((await passwordLogin('ann@x.co')).status).toBe(401)
    expect((await me(admin))?.email).toBe('admin@x.co')

    const init = (await (await call('/auth/init', new Map())).json()) as { passwordFor: string }
    expect(init.passwordFor).toBe('admins')
    const { docs } = await cms.db.find({
      collection: 'audit-logs',
      where: { action: { equals: 'sign-in.rules' } },
      sort: ['id'],
      limit: 0,
      page: 1,
    })
    expect(docs.at(-1)?.detail).toMatchObject({ password: { from: 'everyone', to: 'admins' } })
  })

  it('refuses a change after which the admin making it could not sign in', async () => {
    const response = await rules(admin, { password: { breakGlass: [ids['root@x.co']] } })
    expect(response.status).toBe(400)
    expect((await errorsOf(response))[0]?.message).toMatch(/You couldn't sign in after this/)
  })

  it('refuses break-glass accounts without a password, and lists without an admin', async () => {
    const noAdmin = await rules(admin, {
      password: { breakGlass: [ids['ann@x.co']] },
    })
    expect((await errorsOf(noAdmin))[0]?.message).toMatch(/needs at least one admin|couldn't/)
    const unknown = await rules(admin, { password: { breakGlass: [999_999] } })
    expect((await errorsOf(unknown))[0]?.message).toMatch(/no account/)
  })

  it('keeps break-glass accounts chosen by id, and the last admin on the list', async () => {
    const response = await rules(admin, {
      password: { breakGlass: [ids['admin@x.co'], ids['root@x.co']] },
    })
    expect(response.status).toBe(200)
    const view = await sso(admin)
    expect(view.password).toBe('breakGlass')
    expect(view.breakGlassAccounts?.map((a) => a.email).sort()).toEqual(['admin@x.co', 'root@x.co'])
    // An admin without a password keeps an active admin, so only the break-glass guard applies.
    await cms.create('users', { email: 'sso-admin@x.co', role: 'admin' }, { overrideAccess: true })

    await cms.update(
      'users',
      ids['root@x.co'] as string,
      { active: false },
      { overrideAccess: true },
    )
    await expect(
      cms.update(
        'users',
        ids['admin@x.co'] as string,
        { role: 'editor' },
        { overrideAccess: true },
      ),
    ).rejects.toThrow(/last admin who can sign in with a password/)
    await expect(
      cms.delete('users', ids['admin@x.co'] as string, { overrideAccess: true }),
    ).rejects.toThrow(/last admin who can sign in with a password/)
    await cms.update(
      'users',
      ids['root@x.co'] as string,
      { active: true },
      { overrideAccess: true },
    )
  })

  it("goes back to the config's rules with reset, as easy-cms reset-sign-in does", async () => {
    const result = await cms.signIn.reset(null)
    expect(result.rules).toBe(true)
    const view = await sso(admin)
    expect(view.password).toBe('everyone')
    expect(view.sources).toEqual({ password: 'code', signUp: 'code' })
    expect((await passwordLogin('ann@x.co')).status).toBe(200)
  })

  it('keeps nothing when the admin saves what the config says', async () => {
    expect((await rules(admin, { password: 'everyone' })).status).toBe(200)
    expect((await sso(admin)).sources.password).toBe('code')
  })
})

describe('auth.locked, and rules the admin would refuse in the config', () => {
  let locked: Awaited<ReturnType<typeof open>>
  beforeAll(async () => {
    locked = await open(
      defineConfig({
        secret: SECRET,
        db: db(),
        serverURL: ORIGIN,
        auth: {
          locked: true,
          providers: [
            oidc({
              id: 'acme',
              name: 'Acme',
              issuer: mock.url,
              clientId: mock.clientId,
              clientSecret: mock.clientSecret,
            }),
          ],
          providerSignUp: { domains: ['gmail.com'] },
        },
        collections: [],
      }),
      tempProject(),
    )
    await locked.create('users', { email: 'admin@x.co', password: 'password123', role: 'admin' })
  })
  afterAll(() => locked.destroy())

  it('keeps the rules as the code sets them, and warns about an open sign-up', async () => {
    const view = await locked.auth.sso.settings(ORIGIN)
    expect(view.locked).toBe(true)
    expect(view.warnings[0]).toMatch(/anyone can get an address at gmail\.com/)
    const user = (await locked.find('users', { overrideAccess: true })).docs[0]
    await expect(
      locked.signIn.rules.set({ ...(user as object), role: 'admin' } as never, {
        password: 'admins',
      }),
    ).rejects.toThrow(/auth\.locked/)
  })
})
