import {
  type AdminRoles,
  type AdminSchema,
  type CollectionConfig,
  createRestHandler,
  defineConfig,
  type RestHandler,
} from '@easy-cms/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, open, SECRET, tempProject } from './helpers.js'

/** Own documents only, field rules and who owns what (`auth.rbac`). */
let cms: Awaited<ReturnType<typeof open>>
let handle: RestHandler
const tokens: Record<string, Record<string, string>> = {}
const ids: Record<string, number> = {}

const collections = (versions: boolean): CollectionConfig[] => [
  {
    slug: 'posts',
    drafts: true,
    versions,
    admin: { ownerField: 'author' },
    access: { read: () => true },
    fields: [
      { name: 'title', type: 'text' },
      { name: 'author', type: 'relationship', to: 'users' },
    ],
  },
  {
    slug: 'notes',
    fields: [
      { name: 'title', type: 'text', required: true },
      { name: 'summary', type: 'text' },
      { name: 'secret', type: 'text' },
      { name: 'internal', type: 'text', access: { read: ({ user }) => user?.role === 'admin' } },
    ],
  },
]

const config = () =>
  defineConfig({
    secret: SECRET,
    db: db(),
    auth: { rbac: true, roles: ['admin', 'editor', 'writer'] },
    collections: collections(true),
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

beforeAll(async () => {
  cms = await open(config(), tempProject())
  handle = createRestHandler(cms)
  for (const [name, role] of [
    ['admin', 'admin'],
    ['ann', 'writer'],
    ['ben', 'writer'],
    ['eve', 'editor'],
  ] as const) {
    const user = await cms.create('users', {
      email: `${name}@x.co`,
      password: 'password123',
      role,
    })
    ids[name] = user.id as number
    const { token } = await cms.auth.login({ email: `${name}@x.co`, password: 'password123' })
    tokens[name] = { authorization: `Bearer ${token}` }
  }
  // Writers: read every post, change and publish only their own; their own notes only.
  const { roles } = await json<AdminRoles>(call('/admin/roles', 'GET', 'admin'))
  const writer = roles.find((r) => r.key === 'writer')
  const saved = await call(`/admin/roles/${writer?.id}`, 'PATCH', 'admin', {
    permissions: {
      collections: {
        posts: ['read', 'create', 'update', 'delete', 'publish'],
        notes: ['read', 'create', 'update'],
      },
      own: { posts: ['update', 'delete', 'publish'], notes: ['read', 'update'] },
      fields: { collections: { notes: { summary: 'read', secret: 'hidden' } } },
    },
  })
  expect(saved.status).toBe(200)
})
afterAll(() => cms.destroy())

describe('who created a document', () => {
  it('is recorded, and only trusted code may set it', async () => {
    const post = await json<{ id: number; createdBy: number; author: number }>(
      call('/posts?depth=0', 'POST', 'ann', { title: 'Ann’s', createdBy: ids.ben }),
    )
    // The creator, whatever the request says; an empty owner field becomes the creator too.
    expect(post.createdBy).toBe(ids.ann)
    expect(post.author).toBe(ids.ann)
    ids.annPost = post.id
    const imported = await cms.create(
      'posts',
      { title: 'Imported', createdBy: ids.ben },
      { depth: 0 },
    )
    expect(imported.createdBy).toBe(ids.ben)
    expect((await cms.create('posts', { title: 'Seed' })).createdBy ?? null).toBeNull()
  })
})

describe('own documents only', () => {
  it('lets writers change, publish and delete only their own posts', async () => {
    const ben = await json<{ id: number }>(call('/posts', 'POST', 'ben', { title: 'Ben’s' }))
    ids.benPost = ben.id
    // Everyone's are readable.
    expect((await call(`/posts/${ids.annPost}?draft=true`, 'GET', 'ben')).status).toBe(200)
    expect((await call(`/posts/${ids.annPost}`, 'PATCH', 'ben', { title: 'x' })).status).toBe(403)
    expect((await call(`/posts/${ids.annPost}`, 'DELETE', 'ben')).status).toBe(403)
    expect(
      (await call(`/posts/${ids.annPost}`, 'PATCH', 'ben', { status: 'published' })).status,
    ).toBe(403)
    expect(
      (await call(`/posts/${ben.id}`, 'PATCH', 'ben', { title: 'Mine', status: 'published' }))
        .status,
    ).toBe(200)
    // Writers can't give a post away (or take one): the owner field is read-only for them.
    const kept = await json<{ author: number }>(
      call(`/posts/${ben.id}?depth=0`, 'PATCH', 'ben', { author: ids.ann }),
    )
    expect(kept.author).toBe(ids.ben)
    // Ann, as owner, can.
    expect((await call(`/posts/${ids.annPost}`, 'PATCH', 'ann', { title: 'Edited' })).status).toBe(
      200,
    )
  })

  it('lists only their own notes, and the admin is told who owns what', async () => {
    await call('/notes', 'POST', 'ann', { title: 'Ann note' })
    await call('/notes', 'POST', 'ben', { title: 'Ben note' })
    const list = await json<{ docs: { title: string }[] }>(call('/notes', 'GET', 'ann'))
    expect(list.docs.map((d) => d.title)).toEqual(['Ann note'])
    const schema = await json<AdminSchema>(call('/admin/schema', 'GET', 'ann'))
    expect(schema.rbac).toBe(true)
    expect(schema.collections.find((c) => c.slug === 'posts')?.owner).toBe('author')
    expect(schema.collections.find((c) => c.slug === 'notes')?.owner).toBe('createdBy')
  })
})

describe('field rules', () => {
  it('hides fields and makes others read-only, on the server and in the admin', async () => {
    const note = await json<{ id: number; summary?: string; secret?: string }>(
      call('/notes', 'POST', 'ann', { title: 'With fields', summary: 'S', secret: 'X' }),
    )
    // Read-only and hidden fields are not taken from the request, and hidden ones not returned.
    expect(note.summary ?? null).toBeNull()
    expect(note).not.toHaveProperty('secret')
    await cms.update('notes', note.id, { summary: 'From code', secret: 'Shh' })
    const read = await json<Record<string, unknown>>(call(`/notes/${note.id}`, 'GET', 'ann'))
    expect(read.summary).toBe('From code')
    expect(read).not.toHaveProperty('secret')
    await call(`/notes/${note.id}`, 'PATCH', 'ann', { summary: 'Changed' })
    expect((await cms.findById('notes', note.id))?.summary).toBe('From code')

    const fields = (await json<AdminSchema>(call('/admin/schema', 'GET', 'ann'))).collections
      .find((c) => c.slug === 'notes')
      ?.fields.map((f) => [f.name, f.readOnly === true])
    expect(fields).toEqual([
      ['title', false],
      ['summary', true],
      ['createdBy', true],
    ])
  })

  it('refuses filtering or sorting by fields the user can’t read', async () => {
    expect((await call('/notes?where[secret][equals]=Shh', 'GET', 'ann')).status).toBe(403)
    expect((await call('/notes?sort=-secret', 'GET', 'ann')).status).toBe(403)
    expect((await call('/notes?where[or][0][secret][like]=S', 'GET', 'ann')).status).toBe(403)
    expect((await call('/notes?where[summary][exists]=true', 'GET', 'ann')).status).toBe(200)
    // Access rules in the code too: `internal` is for admins.
    expect((await call('/notes?where[internal][equals]=x', 'GET', 'eve')).status).toBe(403)
    expect((await call('/notes?where[internal][equals]=x', 'GET', 'admin')).status).toBe(200)
  })

  it('keeps required fields fillable for roles that create documents', async () => {
    const { roles } = await json<AdminRoles>(call('/admin/roles', 'GET', 'admin'))
    const writer = roles.find((r) => r.key === 'writer')
    const response = await call(`/admin/roles/${writer?.id}`, 'PATCH', 'admin', {
      permissions: {
        ...writer?.permissions,
        fields: { collections: { notes: { title: 'read' } } },
      },
    })
    expect(response.status).toBe(400)
    const list = await json<AdminRoles>(call('/admin/roles', 'GET', 'admin'))
    const notes = list.collections.find((c) => c.slug === 'notes')
    expect(notes?.owner).toBe('createdBy')
    expect(notes?.fields.map((f) => [f.name, f.required])).toEqual([
      ['title', true],
      ['summary', false],
      ['secret', false],
      ['internal', false],
    ])
    expect(list.collections.find((c) => c.slug === 'posts')?.fields[1]).toMatchObject({
      name: 'author',
      owner: true,
    })
  })
})

describe('deleting a user who owns documents', () => {
  const owners = async (slug: 'posts' | 'notes', id: number) => {
    const doc = await cms.findById(slug, id, { depth: 0, draft: true })
    return [doc?.createdBy ?? null, (doc as { author?: unknown })?.author ?? null]
  }

  it('says what they own, and gives it to another user', async () => {
    const owned = await json<{ collection: string; count: number }[]>(
      call(`/admin/owned/${ids.ben}`, 'GET', 'admin'),
    )
    expect(owned).toEqual([
      { collection: 'posts', count: 2 },
      { collection: 'notes', count: 1 },
    ])
    expect((await call(`/admin/owned/${ids.ben}`, 'GET', 'ann')).status).toBe(403)
    expect((await call(`/users/${ids.ben}?transferTo=${ids.ben}`, 'DELETE', 'admin')).status).toBe(
      400,
    )
    expect((await call(`/users/${ids.ben}?transferTo=${ids.ann}`, 'DELETE', 'admin')).status).toBe(
      200,
    )
    expect(await owners('posts', ids.benPost as number)).toEqual([ids.ann, ids.ann])
  })

  it('or to nobody, also without a choice', async () => {
    const tom = await cms.create('users', {
      email: 'tom@x.co',
      password: 'password123',
      role: 'writer',
    })
    const sue = await cms.create('users', {
      email: 'sue@x.co',
      password: 'password123',
      role: 'writer',
    })
    const tomPost = await cms.create('posts', { title: 'Tom', createdBy: tom.id, author: tom.id })
    const suePost = await cms.create('posts', { title: 'Sue', createdBy: sue.id, author: sue.id })
    await call(`/users/${tom.id}?transferTo=none`, 'DELETE', 'admin')
    expect(await owners('posts', tomPost.id as number)).toEqual([null, null])
    await call(`/users/${sue.id}`, 'DELETE', 'admin')
    expect(await owners('posts', suePost.id as number)).toEqual([null, null])
  })
})

describe('documents from before roles', () => {
  it('get who created them from their history', async () => {
    const cwd = tempProject()
    const before = await open(
      defineConfig({ secret: SECRET, db: db(), collections: collections(true) }),
      cwd,
    )
    const user = await before.create('users', {
      email: 'old@x.co',
      password: 'password123',
      role: 'editor',
    })
    const post = await before.create(
      'posts',
      { title: 'Old' },
      { user: { ...user, role: 'editor' } as never },
    )
    const seed = await before.create('posts', { title: 'Seeded' })
    await before.destroy()

    const after = await open(config(), cwd)
    try {
      // `sync` is internal: what a server does when it starts.
      await (after.roles as unknown as { sync(): Promise<void> }).sync()
      const read = (id: unknown) => after.findById('posts', id as number, { depth: 0, draft: true })
      expect((await read(post.id))?.createdBy).toBe(user.id)
      expect((await read(seed.id))?.createdBy ?? null).toBeNull()
    } finally {
      await after.destroy()
    }
  })
})
