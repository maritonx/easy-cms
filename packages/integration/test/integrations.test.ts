import { createRestHandler, defineConfig, type IntegrationConfig } from '@easy-cms/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, open, rawQuery, SECRET, table, tempProject } from './helpers.js'

// The Integrations page (#311): plugins' integrations, accounts connected, secrets encrypted.

const hook: IntegrationConfig = {
  id: 'status-hook',
  label: 'Status webhook',
  category: 'automation',
  kind: 'fields',
  fields: [
    { name: 'url', type: 'url', required: true },
    { name: 'token', secret: true, required: true },
  ],
  env: { token: 'TEST_STATUS_HOOK_TOKEN' },
  test: (values) =>
    values.token === 'bad'
      ? { ok: false, message: 'token refused' }
      : { ok: true, account: new URL(values.url ?? 'http://x').host },
}

const page: IntegrationConfig = {
  id: 'pages',
  label: 'Page network',
  category: 'social',
  kind: 'oauth',
  oauth: {
    authorizeUrl: ({ redirectUri, state }) =>
      `https://provider.test/auth?redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`,
    exchange: ({ code }) =>
      code === 'one'
        ? { values: { token: 'user-token-1' }, account: 'Only page' }
        : {
            accounts: [
              { id: 'a', name: 'Page A', values: { token: 'page-a-token' } },
              { id: 'b', name: 'Page B', values: { token: 'page-b-token' } },
            ],
          },
  },
}

const config = defineConfig({
  secret: SECRET,
  db: db(),
  audit: true,
  auth: { rbac: true },
  integrations: [hook, page],
  collections: [],
})

type CMS = Awaited<ReturnType<typeof open<typeof config>>>
let cms: CMS
let cwd: string
const tokens: Record<string, string> = {}

beforeAll(async () => {
  cwd = tempProject()
  cms = await open(config, cwd)
  for (const [email, role] of [
    ['admin@x.co', 'admin'],
    ['ed@x.co', 'editor'],
  ] as const) {
    await cms.create('users', { email, password: 'password123', role })
    tokens[email] = (await cms.auth.login({ email, password: 'password123' })).token
  }
})
afterAll(() => cms.destroy())

async function call(path: string, method = 'GET', body?: unknown, who = 'admin@x.co') {
  const res = await createRestHandler(cms)(
    new Request(`http://cms.test/api/cms/admin/integrations${path}`, {
      method,
      redirect: 'manual',
      headers: {
        authorization: `Bearer ${tokens[who]}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  )
  const text = await res.text()
  return { status: res.status, res, body: text ? (JSON.parse(text) as Record<string, any>) : null }
}

describe('integrations (#311)', () => {
  it('connects pasted values, tests them first, and encrypts the secret at rest', async () => {
    const refused = await call('/status-hook/connections', 'POST', {
      name: 'Main',
      values: { url: 'https://hooks.test/a', token: 'bad' },
    })
    expect(refused.status).toBe(400)
    const made = await call('/status-hook/connections', 'POST', {
      name: 'Main',
      values: { url: 'https://hooks.test/a', token: 'secret-token-1234' },
    })
    expect(made.status).toBe(201)

    // Not in the database as it was typed.
    const rows = await rawQuery(cwd, `select * from ${table(cwd, 'connections')}`)
    expect(JSON.stringify(rows)).not.toContain('secret-token-1234')
    // The admin sees it masked; plugins read it decrypted.
    const overview = await call('')
    const hookView = overview.body?.integrations.find((i: { id: string }) => i.id === 'status-hook')
    expect(hookView.connections[0]).toMatchObject({
      name: 'Main',
      isDefault: true,
      account: 'hooks.test',
      values: { url: 'https://hooks.test/a', token: '••••1234' },
    })
    expect(await cms.integrations.get('status-hook')).toEqual({
      name: 'Main',
      env: false,
      values: { url: 'https://hooks.test/a', token: 'secret-token-1234' },
    })
  })

  it('keeps several connections, a default, tests, errors for the dashboard, and turning off', async () => {
    const second = await call('/status-hook/connections', 'POST', {
      name: 'Backup',
      values: { url: 'https://hooks.test/b', token: 'second-5678' },
    })
    expect(
      (
        await call('/status-hook/connections', 'POST', {
          name: 'Backup',
          values: { url: 'https://x.test', token: 't' },
        })
      ).status,
    ).toBe(400)
    await call(`/status-hook/connections/${second.body?.id}`, 'PATCH', { isDefault: true })
    expect((await cms.integrations.get('status-hook'))?.name).toBe('Backup')
    expect((await cms.integrations.get('status-hook', { name: 'Main' }))?.values.token).toBe(
      'secret-token-1234',
    )

    // A change keeps the secret when it isn't typed again.
    await call(`/status-hook/connections/${second.body?.id}`, 'PATCH', {
      values: { url: 'https://hooks.test/c' },
    })
    expect((await cms.integrations.get('status-hook'))?.values).toEqual({
      url: 'https://hooks.test/c',
      token: 'second-5678',
    })

    expect((await call(`/status-hook/connections/${second.body?.id}/test`, 'POST')).body).toEqual({
      ok: true,
      account: 'hooks.test',
    })
    await cms.integrations.markError('status-hook', 'HTTP 500 from the hook')
    const status = await createRestHandler(cms)(
      new Request('http://cms.test/api/cms/admin/status', {
        headers: { authorization: `Bearer ${tokens['admin@x.co']}` },
      }),
    )
    expect(((await status.json()) as { attention: { id: string }[] }).attention).toContainEqual(
      expect.objectContaining({ id: 'integrations', count: 1, names: ['status-hook: Backup'] }),
    )
    await cms.integrations.markUsed('status-hook')

    await call('/status-hook', 'PUT', { enabled: false })
    expect(await cms.integrations.get('status-hook')).toBeNull()
    await call('/status-hook', 'PUT', { enabled: true })
    expect(await cms.integrations.get('status-hook')).not.toBeNull()

    // Disconnecting the default makes the oldest left the default.
    await call(`/status-hook/connections/${second.body?.id}`, 'DELETE')
    expect((await cms.integrations.get('status-hook'))?.name).toBe('Main')
  })

  it('lets an environment variable win', async () => {
    process.env.TEST_STATUS_HOOK_TOKEN = 'from-env'
    try {
      expect((await cms.integrations.get('status-hook'))?.values.token).toBe('from-env')
    } finally {
      delete process.env.TEST_STATUS_HOOK_TOKEN
    }
  })

  it('connects with OAuth: one account at once, or a choice among several', async () => {
    const { body } = await call('/pages/authorize', 'POST', { name: 'Pages' })
    const url = new URL(String(body?.url))
    const state = url.searchParams.get('state') ?? ''
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://cms.test/api/cms/admin/integrations/pages/callback',
    )

    const back = await call(`/pages/callback?code=many&state=${encodeURIComponent(state)}`)
    expect(back.status).toBe(302)
    const location = new URL(String(back.res.headers.get('location')))
    expect(location.pathname).toBe('/admin/integrations')
    const pending = location.searchParams.get('pending')
    expect((await call(`/pages/pending/${pending}`)).body).toEqual({
      name: 'Pages',
      accounts: [
        { id: 'a', name: 'Page A' },
        { id: 'b', name: 'Page B' },
      ],
    })
    expect((await call(`/pages/pending/${pending}`, 'POST', { account: 'b' })).status).toBe(201)
    expect(await cms.integrations.get('pages')).toEqual({
      name: 'Pages',
      env: false,
      values: { token: 'page-b-token' },
    })

    // A forged or someone else's state is refused.
    const forged = await call('/pages/callback?code=one&state=nope')
    expect(new URL(String(forged.res.headers.get('location'))).searchParams.get('error')).toMatch(
      /expired/,
    )
  })

  it('shows the page only to admins and roles given it, and logs changes', async () => {
    expect((await call('', 'GET', undefined, 'ed@x.co')).status).toBe(403)
    const entries = (await cms.audit.list({
      action: 'integration.connect',
    } as never)) as unknown as {
      docs: { target: string }[]
    }
    expect(entries.docs.map((e) => e.target)).toEqual(
      expect.arrayContaining(['status-hook', 'pages']),
    )
  })

  it('reads connections after the secret changes, and encrypts them again with the new one', async () => {
    await cms.destroy()
    const rotated = defineConfig({
      ...config,
      secret: 'f1e2d3c4b5a69788f1e2d3c4b5a69788',
      previousSecrets: [SECRET],
    })
    cms = (await open(rotated, cwd)) as unknown as CMS
    expect((await cms.integrations.get('status-hook', { name: 'Main' }))?.values.token).toBe(
      'secret-token-1234',
    )
    const { resealed } = await cms.integrations.rotate()
    expect(resealed).toBeGreaterThanOrEqual(0)
    expect((await cms.integrations.overview()).staleSecrets).toBe(0)
    await cms.destroy()
    // Without the old secret now.
    cms = (await open(defineConfig({ ...rotated, previousSecrets: [] }), cwd)) as unknown as CMS
    expect((await cms.integrations.get('pages'))?.values.token).toBe('page-b-token')
  })
})
