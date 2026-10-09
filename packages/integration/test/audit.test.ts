import {
  type AdminRoles,
  type AdminStatus,
  type AuditPage,
  type AuditVerification,
  createRestHandler,
  defineConfig,
  type RestHandler,
} from '@easy-cms/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, open, SECRET, tempProject } from './helpers.js'

/** The audit log (`audit`): who changed what and when, sign-ins, admin actions. */
let cms: Awaited<ReturnType<typeof open>>
let handle: RestHandler
const tokens: Record<string, Record<string, string>> = {}

const config = () =>
  defineConfig({
    secret: SECRET,
    db: db(),
    audit: { failedLogins: 3 },
    auth: { rbac: true },
    collections: [
      {
        slug: 'posts',
        drafts: true,
        schedule: true,
        useAsTitle: 'title',
        access: { read: () => true },
        fields: [
          { name: 'title', type: 'text' },
          { name: 'views', type: 'number' },
          { name: 'body', type: 'json' },
        ],
      },
    ],
    globals: [{ slug: 'site', fields: [{ name: 'name', type: 'text' }] }],
  })

const call = (path: string, method = 'GET', as?: string, body?: unknown) =>
  handle(
    new Request(`http://cms.test/api/cms${path}`, {
      method,
      headers: {
        'user-agent': 'AuditTest/1.0',
        ...(as ? tokens[as] : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  )
const json = async <T>(response: Response | Promise<Response>) =>
  (await (await response).json()) as T
const log = (query = '') => json<AuditPage>(call(`/admin/audit${query}`, 'GET', 'admin'))
const login = (email: string, password: string) =>
  call('/auth/login', 'POST', undefined, { email, password })

beforeAll(async () => {
  cms = await open(config(), tempProject())
  handle = createRestHandler(cms, { getClientIp: () => '203.0.113.7' })
  for (const [email, role] of [
    ['admin@x.co', 'admin'],
    ['ed@x.co', 'editor'],
  ] as const) {
    await cms.create('users', { email, password: 'password123', role })
    const { token } = await cms.auth.login({ email, password: 'password123' })
    tokens[email.split('@')[0] as string] = { authorization: `Bearer ${token}` }
  }
})
afterAll(() => cms.destroy())

describe('changes to content', () => {
  it('records who created, changed, published and deleted what, field by field', async () => {
    const post = await json<{ id: number }>(
      call('/posts', 'POST', 'ed', { title: 'First', views: 1 }),
    )
    await call(`/posts/${post.id}`, 'PATCH', 'ed', {
      title: 'First, edited',
      views: 2,
      body: { a: 1 },
    })
    await call(`/posts/${post.id}`, 'PATCH', 'ed', { status: 'published' })
    await call(`/posts/${post.id}`, 'DELETE', 'admin')

    const { docs } = await log(`?target=posts&doc=${post.id}`)
    expect(docs.map((e) => [e.action, e.actor.email])).toEqual([
      ['delete', 'admin@x.co'],
      ['publish', 'ed@x.co'],
      ['update', 'ed@x.co'],
      ['create', 'ed@x.co'],
    ])
    const [deleted, , update, create] = docs
    // The title stays readable after the document is gone.
    expect(deleted?.title).toBe('First, edited')
    expect(update?.changes).toEqual([
      { field: 'title', before: 'First', after: 'First, edited' },
      { field: 'views', before: 1, after: 2 },
      // JSON, rich text, blocks and arrays: only that they changed.
      { field: 'body' },
    ])
    expect(create?.changes).toContainEqual({ field: 'title', before: null, after: 'First' })
    expect(update?.actor).toMatchObject({
      via: 'user',
      ip: '203.0.113.7',
      userAgent: 'AuditTest/1.0',
    })
  })

  it('records globals, scheduled publishing and code (system) too', async () => {
    await call('/globals/site', 'PATCH', 'admin', { name: 'My site' })
    const draft = await cms.create('posts', { title: 'Later' })
    expect((await log(`?target=posts&doc=${draft.id}`)).docs[0]?.actor.via).toBe('system')

    const at = new Date(Date.now() - 1000).toISOString()
    await call(`/posts/${draft.id}/schedule`, 'POST', 'admin', { action: 'publish', at })
    await cms.runJobs()
    const entries = (await log(`?target=posts&doc=${draft.id}`)).docs
    expect(entries.map((e) => [e.action, e.actor.via])).toEqual([
      ['publish', 'scheduler'],
      ['schedule', 'user'],
      ['create', 'system'],
    ])
    expect((await log('?target=global:site')).docs[0]).toMatchObject({
      action: 'update',
      changes: [{ field: 'name', before: null, after: 'My site' }],
    })
  })

  it('never keeps passwords or their hashes', async () => {
    const ed = (await cms.find('users', { where: { email: { equals: 'ed@x.co' } } })).docs[0]
    await call(`/users/${ed?.id}`, 'PATCH', 'admin', { name: 'Ed', password: 'another-password-1' })
    const entry = (await log(`?target=users&doc=${ed?.id}`)).docs[0]
    expect(entry?.changes).toEqual([
      { field: 'name', before: null, after: 'Ed' },
      { field: 'password' },
    ])
    const everything = JSON.stringify((await log()).docs)
    expect(everything).not.toMatch(/scrypt|passwordHash|another-password/)
  })
})

describe('signing in', () => {
  it('records logins, failures and logouts, and warns about many failures', async () => {
    expect((await login('ed@x.co', 'another-password-1')).status).toBe(200)
    for (const password of ['nope-1', 'nope-2', 'nope-3']) await login('ed@x.co', password)
    await login('ghost@x.co', 'whatever')
    const failed = await log('?action=login')
    expect(failed.docs.map((e) => e.action)).toContain('login.failed')
    expect(failed.docs.find((e) => e.actor.email === 'ghost@x.co')?.detail).toEqual({
      reason: 'unknown email',
    })

    const status = await json<AdminStatus>(call('/admin/status', 'GET', 'admin'))
    expect(status.attention).toContainEqual({ id: 'failed-logins', count: 4 })
  })
})

describe('admin actions and access', () => {
  it('records role changes, and is for admins and roles given it', async () => {
    // Changing Ed's password above signed him out everywhere.
    const { token } = await cms.auth.login({ email: 'ed@x.co', password: 'another-password-1' })
    tokens.ed = { authorization: `Bearer ${token}` }
    expect((await call('/admin/audit', 'GET', 'ed')).status).toBe(403)
    const { roles } = await json<AdminRoles>(call('/admin/roles', 'GET', 'admin'))
    const editor = roles.find((r) => r.key === 'editor')
    await call(`/admin/roles/${editor?.id}`, 'PATCH', 'admin', {
      permissions: {
        ...editor?.permissions,
        admin: [...(editor?.permissions.admin ?? []), 'audit'],
      },
    })
    expect((await log('?action=role')).docs[0]).toMatchObject({
      action: 'role.update',
      title: 'editor',
      changes: [{ field: 'permissions' }],
    })
    expect((await call('/admin/audit', 'GET', 'ed')).status).toBe(200)
  })

  it('exports CSV, safe to open in a spreadsheet', async () => {
    await cms.create('posts', { title: '=HYPERLINK("http://evil.test")' })
    const response = await call('/admin/audit.csv?target=posts', 'GET', 'admin')
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8')
    const csv = await response.text()
    expect(csv.split('\r\n')[0]).toBe('at,action,target,doc,title,actor,via,ip,changes,detail')
    expect(csv).toContain(`"'=HYPERLINK(""http://evil.test"")"`)
  })
})

describe('tamper evidence', () => {
  it('finds entries changed or removed in the database, and says so on the dashboard', async () => {
    const clean = await json<AuditVerification>(call('/admin/audit/verify', 'POST', 'admin'))
    expect(clean.invalid).toEqual([])
    expect(clean.gaps).toBe(0)

    const { docs } = await log('?target=posts')
    const [first, second] = docs
    const row = await cms.db.findById({ collection: 'audit-logs', id: first?.id as number })
    const { id, ...rest } = row as Record<string, unknown>
    await cms.db.update({
      collection: 'audit-logs',
      id: id as number,
      data: { ...rest, actorEmail: 'someone@else.co' },
    })
    await cms.db.delete({ collection: 'audit-logs', id: second?.id as number })

    const found = await json<AuditVerification>(call('/admin/audit/verify', 'POST', 'admin'))
    expect(found.invalid).toEqual([first?.id])
    expect(found.gaps).toBe(1)
    const status = await json<AdminStatus>(call('/admin/status', 'GET', 'admin'))
    expect(status.attention).toContainEqual(
      expect.objectContaining({ id: 'audit-tampered', invalid: 1 }),
    )
    // Entries can't be changed or deleted through the API.
    expect((await call(`/audit-logs/${first?.id}`, 'DELETE', 'admin')).status).toBe(404)
  })

  it('deletes entries older than `keep` days, once a day', async () => {
    const old = new Date(Date.now() - 400 * 86_400_000).toISOString()
    const row = await cms.db.create({
      collection: 'audit-logs',
      data: { action: 'update', via: 'system', createdAt: old, updatedAt: old },
    })
    // The last check is recent: nothing happens until a day has passed. (`upkeep` is internal.)
    const audit = cms.audit as unknown as { upkeep(now?: Date): Promise<void> }
    await audit.upkeep()
    expect(await cms.db.findById({ collection: 'audit-logs', id: row.id })).not.toBeNull()
    await audit.upkeep(new Date(Date.now() + 2 * 86_400_000))
    expect(await cms.db.findById({ collection: 'audit-logs', id: row.id })).toBeNull()
  })
})
