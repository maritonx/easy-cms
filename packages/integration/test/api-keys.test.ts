import { createRestHandler, defineConfig, type RestHandler } from '@easy-cms/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, open, SECRET } from './helpers.js'

const config = defineConfig({
  secret: SECRET,
  db: db(),
  apiKeys: true,
  collections: [
    {
      slug: 'posts',
      drafts: true,
      access: {
        read: () => true,
        create: ({ user }) => !!user,
        update: ({ user }) => !!user,
        // Only admins delete, whatever a key says.
        delete: ({ user }) => user?.role === 'admin',
      },
      fields: [{ name: 'title', type: 'text', required: true }],
    },
    { slug: 'notes', fields: [{ name: 'text', type: 'text' }] },
  ],
  globals: [{ slug: 'site', fields: [{ name: 'name', type: 'text' }] }],
})

const BASE = 'http://cms.test/api/cms'
const PASSWORD = 'password123'
let cms: Awaited<ReturnType<typeof open<typeof config>>>
let handle: RestHandler

beforeAll(async () => {
  cms = await open(config)
  handle = createRestHandler(cms)
  await cms.create('users', { email: 'admin@x.co', password: PASSWORD, role: 'admin' })
  await cms.create('users', { email: 'ed@x.co', password: PASSWORD, role: 'editor' })
})
afterAll(() => cms.destroy())

async function call(
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
) {
  const headers: Record<string, string> = { ...init.headers }
  if (init.body !== undefined) headers['content-type'] = 'application/json'
  const response = await handle(
    new Request(`${BASE}${path}`, {
      method: init.method ?? 'GET',
      headers,
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    }),
  )
  const text = await response.text()
  return { status: response.status, json: text ? JSON.parse(text) : undefined }
}

/** Headers of a logged-in browser (cookie and CSRF token). */
async function browser(email: string) {
  const response = await handle(
    new Request(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }),
    }),
  )
  const { csrfToken } = (await response.json()) as { csrfToken: string }
  const cookie = response.headers
    .getSetCookie()
    .find((c) => c.startsWith('ecms-session='))
    ?.split(';')[0] as string
  return { cookie, 'x-csrf-token': csrfToken, origin: 'http://cms.test' }
}

const bearer = (key: string) => ({ authorization: `Bearer ${key}` })

describe('API keys', () => {
  let key = ''

  it('creates a key once, stores only a hash, and cleans the permissions', async () => {
    const admin = await browser('admin@x.co')
    const created = await call('/api-keys', {
      method: 'POST',
      headers: admin,
      body: {
        name: 'Importer',
        permissions: {
          collections: {
            posts: ['read', 'create', 'update', 'delete', 'fly'],
            users: ['read'],
            nope: ['read'],
          },
          globals: { site: ['read'] },
        },
      },
    })
    expect(created.status).toBe(201)
    key = created.json.key
    expect(key).toMatch(/^ecms_[0-9a-f]{8}_[A-Za-z0-9_-]{43}$/)
    expect(created.json.permissions).toEqual({
      collections: { posts: ['read', 'create', 'update', 'delete'] },
      globals: { site: ['read'] },
    })
    expect(created.json).not.toHaveProperty('keyHash')
    expect(created.json.prefix).toBe(key.slice(5, 13))

    const listed = await call('/api-keys', { headers: admin })
    expect(listed.json.docs).toHaveLength(1)
    expect(listed.json.docs[0]).not.toHaveProperty('key')
    expect(listed.json.docs[0]).not.toHaveProperty('keyHash')
  })

  it('acts as its owner, limited to what it lists, without CSRF', async () => {
    expect((await call('/posts?draft=true', { headers: bearer(key) })).status).toBe(200)
    const post = await call('/posts', {
      method: 'POST',
      headers: bearer(key),
      body: { title: 'From a key' },
    })
    expect(post.status).toBe(201)
    expect(post.json.status).toBe('draft')
    const id = post.json.id
    expect(
      (
        await call(`/posts/${id}`, {
          method: 'PATCH',
          headers: bearer(key),
          body: { title: 'Edited' },
        })
      ).status,
    ).toBe(200)

    // Not in the key: publishing, other collections, writing the global, uploads.
    expect(
      (
        await call(`/posts/${id}`, {
          method: 'PATCH',
          headers: bearer(key),
          body: { status: 'published' },
        })
      ).status,
    ).toBe(403)
    expect(
      (
        await call('/posts', {
          method: 'POST',
          headers: bearer(key),
          body: { title: 'x', status: 'published' },
        })
      ).status,
    ).toBe(403)
    expect((await call('/notes', { headers: bearer(key) })).json.errors[0].message).toContain(
      'API key may not read "notes"',
    )
    expect((await call('/globals/site', { headers: bearer(key) })).status).toBe(200)
    expect(
      (await call('/globals/site', { method: 'PATCH', headers: bearer(key), body: { name: 'x' } }))
        .status,
    ).toBe(403)
  })

  it('never reaches users or keys, and cannot make keys', async () => {
    expect((await call('/users', { headers: bearer(key) })).status).toBe(403)
    expect((await call('/api-keys', { headers: bearer(key) })).status).toBe(403)
    expect(
      (await call('/api-keys', { method: 'POST', headers: bearer(key), body: { name: 'Another' } }))
        .status,
    ).toBe(403)
  })

  it('also needs the owner to be allowed: key and user both decide', async () => {
    const editor = await browser('ed@x.co')
    const created = await call('/api-keys', {
      method: 'POST',
      headers: editor,
      body: {
        name: 'Editor key',
        permissions: { collections: { posts: ['read', 'create', 'delete'] } },
      },
    })
    const editorKey = created.json.key as string
    const post = await call('/posts', {
      method: 'POST',
      headers: bearer(editorKey),
      body: { title: 'Mine' },
    })
    // The key lists delete, but editors may not delete posts.
    expect(
      (await call(`/posts/${post.json.id}`, { method: 'DELETE', headers: bearer(editorKey) }))
        .status,
    ).toBe(403)
    // An admin's key with delete may.
    expect(
      (await call(`/posts/${post.json.id}`, { method: 'DELETE', headers: bearer(key) })).status,
    ).toBe(200)

    // Editors see only their own keys; admins see all.
    expect(
      (await call('/api-keys', { headers: editor })).json.docs.map((d: { name: string }) => d.name),
    ).toEqual(['Editor key'])
    expect((await call('/api-keys', { headers: await browser('admin@x.co') })).json.totalDocs).toBe(
      2,
    )
  })

  it('records when a key was used, and stops working when expired, deleted or its owner is off', async () => {
    const [stored] = (await cms.find('api-keys', { where: { name: { equals: 'Importer' } } })).docs
    expect(typeof stored?.lastUsedAt).toBe('string')

    const expired = await cms.createApiKey({
      name: 'Old',
      user: stored?.user as number,
      permissions: { collections: { posts: ['read'] } },
      expiresAt: new Date(Date.now() - 1000),
    })
    const refused = await call('/posts', { headers: bearer(expired.key) })
    expect(refused.status).toBe(401)
    expect(refused.json.errors[0].message).toBe('Invalid or expired API key')

    const editor = (await cms.find('users', { where: { email: { equals: 'ed@x.co' } } })).docs[0]
    const editorKey = await cms.createApiKey({ name: 'Off', user: editor?.id as number })
    expect((await call('/auth/me', { headers: bearer(editorKey.key) })).json.user.email).toBe(
      'ed@x.co',
    )
    await cms.update('users', editor?.id as number, { active: false })
    expect((await call('/auth/me', { headers: bearer(editorKey.key) })).status).toBe(401)

    await cms.delete('api-keys', stored?.id as number)
    expect((await call('/auth/me', { headers: bearer(key) })).status).toBe(401)
    // A wrong secret with a real prefix fails too.
    const forged = `${editorKey.key.slice(0, 14)}${'x'.repeat(43)}`
    expect((await call('/auth/me', { headers: bearer(forged) })).status).toBe(401)
  })
})
