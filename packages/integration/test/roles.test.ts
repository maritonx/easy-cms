import {
  type AdminRole,
  type AdminRoles,
  type AdminSchema,
  createRestHandler,
  defineConfig,
  type RestHandler,
} from '@easy-cms/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, open, SECRET, tempProject } from './helpers.js'

/** Roles from the admin (`auth.rbac`): permissions ticked per role, on top of access rules. */
let cms: Awaited<ReturnType<typeof open>>
let handle: RestHandler
const tokens: Record<string, Record<string, string>> = {}

const config = () =>
  defineConfig({
    secret: SECRET,
    db: db(),
    auth: { rbac: true, roles: ['admin', 'editor'] },
    apiKeys: true,
    webhooks: [{ url: 'https://hooks.example.com/x', events: ['create'] }],
    admin: {
      pages: [{ path: 'report', label: 'Report', component: 'ecms-report' }],
      dashboard: [{ component: 'ecms-chart', label: 'Chart' }],
    },
    collections: [
      {
        slug: 'categories',
        fields: [{ name: 'title', type: 'text' }],
      },
      {
        slug: 'posts',
        drafts: true,
        access: { read: () => true },
        fields: [
          { name: 'title', type: 'text' },
          { name: 'category', type: 'relationship', to: 'categories' },
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
        ...(as ? tokens[as] : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  )
const json = async <T>(response: Response | Promise<Response>) =>
  (await (await response).json()) as T
const roles = () => json<AdminRoles>(call('/admin/roles', 'GET', 'admin'))
const userId = async (email: string) =>
  (await cms.find('users', { where: { email: { equals: email } } })).docs[0]?.id as number
const role = async (key: string) => (await roles()).roles.find((r) => r.key === key) as AdminRole

beforeAll(async () => {
  cms = await open(config(), tempProject())
  handle = createRestHandler(cms)
  for (const [email, role] of [
    ['admin@x.co', 'admin'],
    ['editor@x.co', 'editor'],
  ] as const)
    await cms.create('users', { email, password: 'password123', role })
  for (const email of ['admin@x.co', 'editor@x.co']) {
    const { token } = await cms.auth.login({ email, password: 'password123' })
    tokens[email.split('@')[0] as string] = { authorization: `Bearer ${token}` }
  }
})
afterAll(() => cms.destroy())

describe('roles from the admin', () => {
  it('starts with the roles of the config; editors keep everything they had', async () => {
    const list = await roles()
    expect(list.roles.map((r) => [r.key, r.system, r.users])).toEqual([
      ['admin', true, 1],
      ['editor', true, 1],
    ])
    const editor = list.roles[1] as AdminRole
    expect(editor.permissions.collections?.posts).toEqual([
      'read',
      'create',
      'update',
      'delete',
      'publish',
    ])
    expect(editor.permissions.collections?.users).toEqual(['read', 'create', 'update', 'delete'])
    expect(editor.permissions.globals?.site).toEqual(['read', 'update'])
    // Plugin pages and panels as before; the status panel and deliveries stay with admins.
    expect(editor.permissions.admin).toEqual(['page:report', 'widget:ecms-chart'])
    expect(list.collections.map((c) => [c.slug, c.new])).toEqual([
      ['users', false],
      ['media', false],
      ['categories', false],
      ['posts', false],
    ])
    expect(list.collections.find((c) => c.slug === 'posts')?.references).toEqual(['categories'])
    expect(list.views.map((v) => v.id)).toEqual([
      'status',
      'deliveries',
      'page:report',
      'widget:ecms-chart',
    ])
    expect((await call('/posts', 'POST', 'editor', { title: 'Hi' })).status).toBe(201)
  })

  it('a new role can do only what is ticked, checked on the server', async () => {
    const created = await call('/admin/roles', 'POST', 'admin', {
      key: 'writer',
      name: 'นักเขียน',
      permissions: {
        // read comes with the others; unknown collections and operations are dropped
        collections: { posts: ['create', 'update'], nope: ['read'], categories: ['read', 'fly'] },
        admin: ['status', 'page:missing'],
      },
    })
    expect(created.status).toBe(201)
    const writer = await json<AdminRole>(created)
    expect(writer.permissions).toEqual({
      collections: { posts: ['read', 'create', 'update'], categories: ['read'] },
      globals: {},
      admin: ['status'],
      own: {},
      fields: { collections: {}, globals: {} },
    })
    await cms.update('users', await userId('editor@x.co'), { role: 'writer' })

    const post = await json<{ id: number }>(call('/posts', 'POST', 'editor', { title: 'Draft' }))
    expect(post.id).toBeTypeOf('number')
    // No publish, no delete, no categories writes, no globals.
    expect(
      (await call(`/posts/${post.id}`, 'PATCH', 'editor', { status: 'published' })).status,
    ).toBe(403)
    expect((await call(`/posts/${post.id}`, 'DELETE', 'editor')).status).toBe(403)
    expect((await call('/categories', 'POST', 'editor', { title: 'X' })).status).toBe(403)
    expect((await call('/globals/site', 'GET', 'editor')).status).toBe(403)
    // The status panel was given; deliveries were not.
    expect((await call('/admin/status', 'GET', 'editor')).status).toBe(200)
    expect((await call('/admin/deliveries', 'GET', 'editor')).status).toBe(403)

    // The admin UI is told the same.
    const schema = await json<AdminSchema>(call('/admin/ui/schema', 'GET', 'editor'))
    const posts = schema.collections.find((c) => c.slug === 'posts')
    expect(posts?.permissions).toEqual({
      read: true,
      create: true,
      update: true,
      delete: false,
      publish: false,
    })
    expect(schema.collections.find((c) => c.slug === 'media')?.permissions.read).toBe(false)
    expect(schema.globals[0]?.permissions.read).toBe(false)
    expect(schema.views).toEqual({
      status: true,
      deliveries: false,
      backups: false,
      email: false,
      roles: false,
      sso: false,
      audit: false,
    })
    expect(schema.pages).toEqual([])
    expect(schema.dashboard).toEqual([])
    // A user's role is one of the roles, by name.
    const roleField = schema.collections
      .find((c) => c.slug === 'users')
      ?.fields.find((f) => f.name === 'role')
    expect(roleField?.type).toBe('select')
    expect(roleField?.options).toContainEqual({ label: 'นักเขียน', value: 'writer' })
  })

  it('everyone keeps their own account, but not other users', async () => {
    const me = await json<{ user: { id: number } }>(call('/auth/me', 'GET', 'editor'))
    const list = await json<{ docs: { email: string }[] }>(call('/users', 'GET', 'editor'))
    expect(list.docs.map((u) => u.email)).toEqual(['editor@x.co'])
    expect((await call(`/users/${me.user.id}`, 'PATCH', 'editor', { name: 'Ed' })).status).toBe(200)
    const admin = await userId('admin@x.co')
    expect((await call(`/users/${admin}`, 'PATCH', 'editor', { name: 'X' })).status).toBe(403)
  })

  it('access rules still apply: what is not logged in is left to them', async () => {
    // posts.access.read allows anyone; roles only narrow logged-in users.
    expect((await call('/posts')).status).toBe(200)
    expect((await call('/categories')).status).toBe(401)
  })

  it('changes apply at once, and are kept as history', async () => {
    const writer = await role('writer')
    expect((await call('/globals/site', 'GET', 'editor')).status).toBe(403)
    const saved = await call(`/admin/roles/${writer.id}`, 'PATCH', 'admin', {
      name: 'Writer',
      permissions: { ...writer.permissions, globals: { site: ['read'] } },
    })
    expect(saved.status).toBe(200)
    expect((await call('/globals/site', 'GET', 'editor')).status).toBe(200)
    const history = await json<{ author: string | null; name: string }[]>(
      call(`/admin/roles/${writer.id}/history`, 'GET', 'admin'),
    )
    expect(history.map((h) => [h.author, h.name])).toEqual([
      ['admin@x.co', 'Writer'],
      ['admin@x.co', 'นักเขียน'],
    ])
  })

  it('protects admins, roles of the config and roles in use; only admins manage roles', async () => {
    const admin = await role('admin')
    const editor = await role('editor')
    const writer = await role('writer')
    expect(
      (await call(`/admin/roles/${admin.id}`, 'PATCH', 'admin', { permissions: {} })).status,
    ).toBe(400)
    expect((await call(`/admin/roles/${editor.id}`, 'DELETE', 'admin')).status).toBe(400)
    expect((await call(`/admin/roles/${writer.id}`, 'DELETE', 'admin')).status).toBe(409)
    expect((await call('/admin/roles', 'GET', 'editor')).status).toBe(403)
    expect((await call('/admin/roles', 'POST', 'admin', { key: 'Bad Key' })).status).toBe(400)
    expect((await call('/admin/roles', 'POST', 'admin', { key: 'writer' })).status).toBe(400)
    // Users can only be given roles that exist.
    await expect(
      cms.create('users', { email: 'x@x.co', password: 'password123', role: 'ghost' }),
    ).rejects.toThrow('there is no role "ghost"')

    await cms.update('users', await userId('editor@x.co'), { role: 'editor' })
    expect((await call(`/admin/roles/${writer.id}`, 'DELETE', 'admin')).status).toBe(200)
    expect((await roles()).roles.map((r) => r.key)).toEqual(['admin', 'editor'])
  })

  it('API keys can do no more than their owner’s role', async () => {
    const editor = await role('editor')
    await call(`/admin/roles/${editor.id}`, 'PATCH', 'admin', {
      permissions: { ...editor.permissions, collections: { posts: ['read'] } },
    })
    const { key } = await cms.createApiKey({
      name: 'ci',
      user: await userId('editor@x.co'),
      permissions: { collections: { posts: ['read', 'create'] } },
    })
    const headers = { authorization: `Bearer ${key}`, 'content-type': 'application/json' }
    const post = (body: unknown) =>
      handle(
        new Request('http://cms.test/api/cms/posts', {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        }),
      )
    expect((await post({ title: 'From CI' })).status).toBe(403)
  })
})
