import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createEasyCMS,
  createRestHandler,
  defineConfig,
  type EasyCMS,
  silentLogger,
} from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { multiTenantPlugin, tenantContext } from '../src/index.js'

const config = defineConfig({
  secret: 'x'.repeat(32),
  db: sqlite({ url: 'file:./cms.db' }),
  apiKeys: true,
  audit: true,
  upload: { folders: true },
  collections: [
    {
      slug: 'categories',
      access: { read: () => true },
      fields: [{ name: 'name', type: 'text', required: true }],
    },
    {
      slug: 'posts',
      useAsTitle: 'title',
      access: { read: () => true },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'slug', type: 'slug', from: 'title' },
        { name: 'category', type: 'relationship', to: 'categories' },
        { name: 'cover', type: 'upload', folder: 'covers' },
      ],
    },
    // Shared by every tenant.
    { slug: 'notes', access: { read: () => true }, fields: [{ name: 'text', type: 'text' }] },
  ],
  globals: [
    { slug: 'site', access: { read: () => true }, fields: [{ name: 'name', type: 'text' }] },
    { slug: 'footer', access: { read: () => true }, fields: [{ name: 'text', type: 'text' }] },
  ],
  plugins: [
    multiTenantPlugin({ collections: ['posts', 'categories', 'media'], globals: ['site'] }),
  ],
})

const ORIGIN = 'http://cms.test'
let dir: string
let cms: Awaited<ReturnType<typeof createEasyCMS<typeof config>>>
let handle: (request: Request) => Promise<Response>
const token: Record<string, string> = {}
let a: number
let b: number

// biome-ignore lint/suspicious/noExplicitAny: response bodies, checked by the assertions
type Body = Record<string, any>

async function call(
  method: string,
  path: string,
  options: { as?: string; tenant?: string; host?: string; body?: unknown; key?: string } = {},
): Promise<{ status: number; body: Body }> {
  const auth = options.key ?? (options.as ? token[options.as] : undefined)
  const response = await handle(
    new Request(`${options.host ? `http://${options.host}` : ORIGIN}/api/cms${path}`, {
      method,
      headers: {
        ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(auth ? { authorization: `Bearer ${auth}` } : {}),
        ...(options.tenant ? { 'x-easy-cms-tenant': options.tenant } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    }),
  )
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : {} }
}

/** A relationship's id, populated or not. */
const idOf = (value: unknown) =>
  value && typeof value === 'object' ? (value as { id: unknown }).id : value

const titles = (body: Body) => (body.docs as { title: string }[]).map((d) => d.title).sort()

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'easy-cms-tenants-'))
  cms = await createEasyCMS(config, { cwd: dir, schema: 'push', logger: silentLogger })
  handle = createRestHandler(cms)
  a = (await cms.create('tenants', { name: 'Brand A', slug: 'a', domains: [{ domain: 'a.test' }] }))
    .id as number
  b = (await cms.create('tenants', { name: 'Brand B', slug: 'b', domains: [{ domain: 'b.test' }] }))
    .id as number
  const users = [
    { email: 'root@x.co', role: 'admin' },
    { email: 'alice@x.co', role: 'editor', tenants: [{ tenant: a, role: 'editor' }] },
    {
      email: 'bob@x.co',
      role: 'editor',
      tenants: [
        { tenant: a, role: 'admin' },
        { tenant: b, role: 'editor' },
      ],
    },
  ]
  for (const user of users) {
    await cms.create('users', { ...user, password: 'password123' } as never)
    token[user.email.split('@')[0] as string] = (
      await cms.auth.login({ email: user.email, password: 'password123' })
    ).token
  }
})

afterAll(async () => {
  await cms.destroy()
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  } catch {
    // Windows may still hold the SQLite file; the OS cleans temp.
  }
})

describe('documents of a tenant', () => {
  it('belong to the tenant the request works in', async () => {
    const created = await call('POST', '/posts', { as: 'alice', body: { title: 'Hello A' } })
    expect(created.status).toBe(201)
    expect(idOf(created.body.tenant)).toBe(a)
    // Alice is not in B: she stays in A, and can't give a post to B.
    const moved = await call('POST', '/posts', {
      as: 'alice',
      tenant: 'b',
      body: { title: 'Sneaky', tenant: b },
    })
    expect(idOf(moved.body.tenant)).toBe(a)
    const inB = await call('POST', '/posts', { as: 'bob', tenant: 'b', body: { title: 'Hello B' } })
    expect(idOf(inB.body.tenant)).toBe(b)
    const root = await call('POST', '/posts', {
      as: 'root',
      tenant: 'b',
      body: { title: 'Root B' },
    })
    expect(idOf(root.body.tenant)).toBe(b)
  })

  it('are listed per tenant; users with access to all see every one', async () => {
    expect(titles((await call('GET', '/posts', { as: 'alice' })).body)).toEqual([
      'Hello A',
      'Sneaky',
    ])
    expect(titles((await call('GET', '/posts', { as: 'bob', tenant: 'b' })).body)).toEqual([
      'Hello B',
      'Root B',
    ])
    expect((await call('GET', '/posts', { as: 'root' })).body.totalDocs).toBe(4)
    expect((await call('GET', '/posts', { as: 'root', tenant: 'a' })).body.totalDocs).toBe(2)
  })

  it('show visitors the tenant they name, by header, ?tenant= or domain, and nothing otherwise', async () => {
    expect((await call('GET', '/posts')).body.totalDocs).toBe(0)
    expect(titles((await call('GET', '/posts', { tenant: 'a' })).body)).toEqual([
      'Hello A',
      'Sneaky',
    ])
    expect((await call('GET', '/posts?tenant=b')).body.totalDocs).toBe(2)
    expect(titles((await call('GET', '/posts', { host: 'b.test' })).body)).toEqual([
      'Hello B',
      'Root B',
    ])
    // Shared collections are everyone's.
    await cms.create('notes', { text: 'shared' })
    expect((await call('GET', '/notes')).body.totalDocs).toBe(1)
  })

  it("can't be changed from another tenant", async () => {
    const [inB] = (await cms.find('posts', { where: { title: { equals: 'Hello B' } } })).docs
    const patch = await call('PATCH', `/posts/${inB?.id}`, { as: 'alice', body: { title: 'Mine' } })
    expect(patch.status).toBe(403)
    // Bob is in B too, but works in A unless he says otherwise.
    expect(
      (await call('PATCH', `/posts/${inB?.id}`, { as: 'bob', body: { title: 'x' } })).status,
    ).toBe(403)
    expect(
      (await call('PATCH', `/posts/${inB?.id}`, { as: 'bob', tenant: 'b', body: { title: 'B!' } }))
        .status,
    ).toBe(200)
  })

  it('have unique values per tenant', async () => {
    const one = await call('POST', '/posts', { as: 'alice', body: { title: 'About' } })
    const other = await call('POST', '/posts', { as: 'bob', tenant: 'b', body: { title: 'About' } })
    const again = await call('POST', '/posts', { as: 'alice', body: { title: 'About' } })
    expect([one.body.slug, other.body.slug, again.body.slug]).toEqual(['about', 'about', 'about-2'])
  })

  it('point only to documents of their tenant', async () => {
    const news = await call('POST', '/categories', {
      as: 'bob',
      tenant: 'b',
      body: { name: 'News' },
    })
    const refused = await call('POST', '/posts', {
      as: 'alice',
      body: { title: 'Linked', category: news.body.id },
    })
    expect(refused.status).toBe(400)
    expect(refused.body.errors[0]).toMatchObject({ field: 'category' })
    // The picker offers only this tenant's.
    const picker = await call('GET', '/categories?filterFor=posts.category', { as: 'alice' })
    expect(picker.body.totalDocs).toBe(0)
  })

  it('include files, which visitors of another tenant do not see', async () => {
    const form = new FormData()
    form.append('file', new Blob(['%PDF-1.4\n% a\n'], { type: 'application/pdf' }), 'a.pdf')
    const response = await handle(
      new Request(`${ORIGIN}/api/cms/media`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token.alice}` },
        body: form,
      }),
    )
    const media = (await response.json()) as Body
    expect(idOf(media.tenant)).toBe(a)
    expect((await call('GET', '/media', { tenant: 'a' })).body.totalDocs).toBe(1)
    expect((await call('GET', '/media', { tenant: 'b' })).body.totalDocs).toBe(0)
    // Another tenant's file can't be used, even by id.
    const theirs = await cms.upload(
      { data: new TextEncoder().encode('%PDF-1.4\n% b\n'), name: 'b.pdf' },
      {},
      { context: { tenant: b } },
    )
    expect(idOf(theirs.tenant)).toBe(b)
    const refused = await call('POST', '/posts', {
      as: 'alice',
      body: { title: 'With their file', cover: theirs.id },
    })
    expect(refused.status).toBe(400)
    expect(refused.body.errors[0]).toMatchObject({ field: 'cover' })
    expect(
      (await call('POST', '/posts', { as: 'alice', body: { title: 'Mine', cover: media.id } }))
        .status,
    ).toBe(201)
  })

  it("have folders per tenant, made where an upload field's key says", async () => {
    const folderOf = async (as: string, tenant?: string) => {
      const schema = (await call('GET', '/admin/schema', { as, ...(tenant ? { tenant } : {}) }))
        .body
      const posts = (schema.collections as Body[]).find((c) => c.slug === 'posts') as Body
      return (posts.fields as Body[]).find((f) => f.name === 'cover')?.folder.id
    }
    const inA = await folderOf('alice')
    const inB = await folderOf('bob', 'b')
    expect(inA).toBeDefined()
    expect(inB).not.toBe(inA)
    expect(await folderOf('bob')).toBe(inA)
    const folders = await cms.find('media-folders', { where: { key: { equals: 'covers' } } })
    expect(folders.docs.map((f) => idOf((f as Body).tenant)).sort()).toEqual([a, b].sort())
  })

  it('made by plugins take the tenant of what they point to', async () => {
    const category = await cms.create('categories', { name: 'In A', tenant: a } as never)
    const post = await cms.create('posts', { title: 'Follows', category: category.id } as never, {
      depth: 0,
    })
    expect(post.tenant).toBe(a)
  })
})

describe('globals per tenant', () => {
  it('keep a value for each tenant, and none without one', async () => {
    expect(
      (await call('POST', '/globals/site', { as: 'bob', body: { name: 'Site A' } })).status,
    ).toBe(200)
    await call('POST', '/globals/site', { as: 'bob', tenant: 'b', body: { name: 'Site B' } })
    expect((await call('GET', '/globals/site', { tenant: 'a' })).body.name).toBe('Site A')
    expect((await call('GET', '/globals/site', { host: 'b.test' })).body.name).toBe('Site B')
    expect((await call('GET', '/globals/site')).body.name).toBeNull()
    // All tenants: nothing to change until one is chosen.
    expect((await call('POST', '/globals/site', { as: 'root', body: { name: '?' } })).status).toBe(
      400,
    )
    // Shared globals stay shared.
    await call('POST', '/globals/footer', { as: 'root', body: { text: 'Everyone' } })
    expect((await call('GET', '/globals/footer', { tenant: 'b' })).body.text).toBe('Everyone')
  })

  it('give the Local API the tenant of a domain', async () => {
    const site = await cms.findGlobal('site', {
      overrideAccess: false,
      user: null,
      context: await tenantContext(cms as unknown as EasyCMS, { host: 'a.test:3000' }),
    })
    expect(site.name).toBe('Site A')
  })
})

describe('roles per tenant', () => {
  it('give members their role in the tenant they work in, never the system', async () => {
    const me = async (tenant?: string) =>
      (await call('GET', '/users/me', { as: 'bob', ...(tenant ? { tenant } : {}) })).body.user
    expect(await me()).toMatchObject({ role: 'admin', scoped: true })
    expect(await me('b')).toMatchObject({ role: 'editor', scoped: true })
    const schema = (await call('GET', '/admin/schema', { as: 'bob' })).body
    expect(schema.views).toMatchObject({ backups: false, roles: false })
    expect(schema.switcher).toMatchObject({ cookie: 'ecms-tenant', options: '/tenant-options' })
    expect((await call('GET', '/admin/backups', { as: 'bob' })).status).toBe(403)
    const root = (await call('GET', '/admin/schema', { as: 'root' })).body
    expect(root.views.backups).toBe(true)
  })

  it('offer each user the tenants they are in', async () => {
    expect((await call('GET', '/tenant-options', { as: 'alice' })).body).toEqual({
      options: [{ value: 'a', label: 'Brand A' }],
    })
    const root = (await call('GET', '/tenant-options', { as: 'root' })).body
    expect(root.options).toHaveLength(2)
    expect(root.all).toMatchObject({ en: 'All tenants' })
  })

  it('let members see the people of their tenant only', async () => {
    const emails = async (as: string, tenant?: string) =>
      ((await call('GET', '/users', { as, ...(tenant ? { tenant } : {}) })).body.docs as Body[])
        .map((u) => u.email)
        .sort()
    expect(await emails('alice')).toEqual(['alice@x.co', 'bob@x.co'])
    expect(await emails('bob', 'b')).toEqual(['bob@x.co'])
    expect((await emails('root')).length).toBe(3)
  })
})

describe('members', () => {
  it('are managed by the admins of a tenant', async () => {
    expect((await call('GET', '/tenant-members', { as: 'alice' })).status).toBe(403)
    expect((await call('GET', '/tenant-members', { as: 'bob', tenant: 'b' })).status).toBe(403)
    const added = await call('POST', '/tenant-members', {
      as: 'bob',
      body: { email: 'Carol@x.co', role: 'editor' },
    })
    expect(added.status).toBe(201)
    expect(added.body.member).toMatchObject({ email: 'carol@x.co', role: 'editor' })
    const list = (await call('GET', '/tenant-members', { as: 'bob' })).body
    expect((list.members as Body[]).map((m) => m.email)).toEqual([
      'alice@x.co',
      'bob@x.co',
      'carol@x.co',
    ])
    const carol = (list.members as Body[]).find((m) => m.email === 'carol@x.co') as Body
    const changed = await call('PATCH', `/tenant-members/${carol.id}`, {
      as: 'bob',
      body: { role: 'admin' },
    })
    expect(changed.body.member.role).toBe('admin')
    expect(
      (await call('PATCH', `/tenant-members/${carol.id}`, { as: 'bob', body: { role: 'boss' } }))
        .status,
    ).toBe(400)
    expect((await call('DELETE', `/tenant-members/${carol.id}`, { as: 'bob' })).status).toBe(200)
    expect(
      ((await call('GET', '/tenant-members', { as: 'bob' })).body.members as Body[]).length,
    ).toBe(2)
    // Someone with an account in another tenant: added, with the answer given for someone new.
    await cms.create('users', {
      email: 'dora@x.co',
      name: 'Dora',
      role: 'editor',
      password: 'password123',
      tenants: [{ tenant: b, role: 'editor' }],
    } as never)
    const dora = await call('POST', '/tenant-members', {
      as: 'bob',
      body: { email: 'dora@x.co', role: 'editor' },
    })
    expect(dora.status).toBe(201)
    expect(dora.body.member).toMatchObject({ email: 'dora@x.co', name: null })
    // Not someone with access to all tenants.
    const root = await call('POST', '/tenant-members', {
      as: 'bob',
      body: { email: 'root@x.co', role: 'editor' },
    })
    expect(root.status).toBe(400)
    // Members can't be given tenants by editing users.
    const alice = (await call('GET', '/users/me', { as: 'alice' })).body.user
    const self = await call('PATCH', `/users/${alice.id}`, {
      as: 'alice',
      body: { tenants: [{ tenant: b, role: 'admin' }] },
    })
    expect(self.body.tenants).toHaveLength(1)
  })
})

describe('API keys', () => {
  it('keep the tenant they were created in', async () => {
    const created = await call('POST', '/api-keys', {
      as: 'bob',
      tenant: 'b',
      body: { name: 'B importer', permissions: { collections: { posts: ['read', 'create'] } } },
    })
    expect(created.status).toBe(201)
    const key = created.body.key as string
    const listed = await call('GET', '/posts', { key, tenant: 'a' })
    expect(titles(listed.body)).toEqual(['About', 'B!', 'Root B'])
    const made = await call('POST', '/posts', { key, tenant: 'a', body: { title: 'By key' } })
    // Stored in B (the key may not read tenants, so the response shows none).
    expect((await cms.findById('posts', made.body.id, { depth: 0 }))?.tenant).toBe(b)
    // Changing its permissions keeps its tenant.
    await call('PATCH', `/api-keys/${created.body.id}`, {
      as: 'bob',
      tenant: 'b',
      body: { permissions: { collections: { posts: ['read'] } } },
    })
    expect(titles((await call('GET', '/posts', { key, tenant: 'a' })).body)).toContain('By key')
  })
})

describe('audit log', () => {
  it("shows the admins of a tenant that tenant's entries", async () => {
    const titles = async (as: string, tenant?: string) => {
      const response = await call('GET', '/admin/audit', { as, ...(tenant ? { tenant } : {}) })
      return response.status === 200
        ? (response.body.docs as Body[]).map((e) => e.title).filter(Boolean)
        : response.status
    }
    const inA = (await titles('bob')) as string[]
    expect(inA).toContain('Hello A')
    expect(inA).not.toContain('Hello B')
    expect(await titles('alice')).toBe(403)
    const all = (await titles('root')) as string[]
    expect(all).toEqual(expect.arrayContaining(['Hello A', 'Hello B']))
    expect(await titles('root', 'b')).not.toContain('Hello A')
  })
})

describe('tenants', () => {
  it('ask to type their name before deleting, saying what goes', async () => {
    const schema = (await call('GET', '/admin/schema', { as: 'root' })).body
    const tenants = (schema.collections as Body[]).find((c) => c.slug === 'tenants') as Body
    expect(tenants.confirmDelete).toEqual({ typeTitle: true, impact: '/tenant-impact' })
    const impact = await call('GET', `/tenant-impact?id=${b}`, { as: 'root' })
    expect(impact.body.message.en).toMatch(/Also deleted: \d+ posts/)
    expect((await call('GET', `/tenant-impact?id=${b}`, { as: 'bob' })).status).toBe(403)
  })

  it('are managed by users with access to all', async () => {
    expect((await call('POST', '/tenants', { as: 'bob', body: { name: 'C' } })).status).toBe(403)
    expect((await call('GET', '/tenants', { as: 'alice' })).body.totalDocs).toBe(1)
  })

  it('give documents without one to a tenant (tenants:assign)', async () => {
    const orphan = await cms.create('posts', { title: 'Imported' } as never)
    expect(orphan.tenant ?? null).toBeNull()
    const command = cms.config.commands.find((c) => c.name === 'tenants:assign')
    const lines: string[] = []
    await command?.run({ cms: cms as unknown as EasyCMS, args: ['a'], log: (l) => lines.push(l) })
    expect((await cms.findById('posts', orphan.id, { depth: 0 }))?.tenant).toBe(a)
    expect(lines).toContain('posts: 1 given to Brand A')
  })

  it('take their documents and memberships with them when deleted', async () => {
    expect((await call('DELETE', `/tenants/${b}`, { as: 'root' })).status).toBe(200)
    expect((await call('GET', '/posts', { as: 'root' })).body.totalDocs).toBe(
      await cms.count('posts'),
    )
    expect(await cms.count('posts', { where: { tenant: { equals: b } } })).toBe(0)
    const bob = (await cms.find('users', { where: { email: { equals: 'bob@x.co' } } })).docs[0]
    expect(bob?.tenants as unknown[]).toHaveLength(1)
  })
})
