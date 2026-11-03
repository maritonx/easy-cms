import { createRestHandler, defineConfig } from '@easy-cms/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, open, SECRET } from './helpers.js'

// Saved views of the admin's lists (#87).

const config = defineConfig({
  secret: SECRET,
  db: db(),
  collections: [
    {
      slug: 'posts',
      admin: {
        views: [{ id: 'drafts', label: 'Drafts', where: { status: { equals: 'draft' } } }],
      },
      fields: [{ name: 'title', type: 'text' }],
    },
    // Only admins may read it.
    {
      slug: 'secrets',
      access: { read: ({ user }) => user?.role === 'admin' },
      fields: [{ name: 'note', type: 'text' }],
    },
  ],
})

type CMS = Awaited<ReturnType<typeof open<typeof config>>>
let cms: CMS
const tokens: Record<string, string> = {}

beforeAll(async () => {
  cms = await open(config)
  for (const [email, role] of [
    ['admin@x.co', 'admin'],
    ['ann@x.co', 'editor'],
    ['bob@x.co', 'editor'],
  ] as const) {
    await cms.create('users', { email, password: 'password123', role })
    tokens[email] = (await cms.auth.login({ email, password: 'password123' })).token
  }
})
afterAll(() => cms.destroy())

async function call(path: string, who: string, method = 'GET', body?: unknown) {
  const res = await createRestHandler(cms)(
    new Request(`http://cms.test/api/cms/admin/ui/views/${path}`, {
      method,
      headers: {
        authorization: `Bearer ${tokens[who]}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  )
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

const state = {
  query: { 'where[and][0][title][like]': 'news', sort: '-title', page: '3', edit: '9' },
  columns: ['title', 7],
  pageSize: 50,
  density: 'compact',
}

describe('saved views (#87)', () => {
  it('saves a view with the list’s state, keeping only what a view restores', async () => {
    const created = await call('posts', 'ann@x.co', 'POST', { name: 'News', state })
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({
      name: 'News',
      shared: false,
      mine: true,
      editable: true,
      state: {
        query: { 'where[and][0][title][like]': 'news', sort: '-title' },
        columns: ['title'],
        pageSize: 50,
        density: 'compact',
      },
    })
  })

  it('shows own views to their owner and shared ones to everyone who may read the list', async () => {
    const shared = await call('posts', 'ann@x.co', 'POST', { name: 'Team', shared: true, state })
    expect((await call('posts', 'bob@x.co')).body.views).toEqual([
      expect.objectContaining({ id: shared.body.id, name: 'Team', mine: false, editable: false }),
    ])
    const names = ((await call('posts', 'ann@x.co')).body.views as { name: string }[]).map(
      (v) => v.name,
    )
    expect(names).toEqual(['Team', 'News'])
    // Someone else's view can't be changed, except a shared one by an admin.
    expect((await call(`posts/${shared.body.id}`, 'bob@x.co', 'PATCH', { name: 'X' })).status).toBe(
      403,
    )
    expect(
      (await call(`posts/${shared.body.id}`, 'admin@x.co', 'PATCH', { name: 'Everyone' })).body,
    ).toMatchObject({ name: 'Everyone', shared: true, editable: true, mine: false })
  })

  it('refuses names used twice, and lists the user may not read', async () => {
    const again = await call('posts', 'ann@x.co', 'POST', { name: 'News', state })
    expect(again.status).toBe(400)
    expect((await call('secrets', 'bob@x.co')).status).toBe(403)
    expect((await call('nope', 'bob@x.co')).status).toBe(404)
    expect((await call('sessions', 'admin@x.co')).status).toBe(404)
  })

  it('remembers the view a user opens the list with, a saved one or one from the config', async () => {
    expect((await call('posts', 'bob@x.co')).body.default).toBeNull()
    await call('posts/default', 'bob@x.co', 'PUT', { view: 'config:drafts' })
    expect((await call('posts', 'bob@x.co')).body.default).toBe('config:drafts')
    await call('posts/default', 'bob@x.co', 'PUT', { view: null })
    expect((await call('posts', 'bob@x.co')).body.default).toBeNull()
  })

  it('deletes a view', async () => {
    const view = await call('posts', 'bob@x.co', 'POST', { name: 'Mine', state })
    expect((await call(`posts/${view.body.id}`, 'ann@x.co', 'DELETE')).status).toBe(404)
    expect((await call(`posts/${view.body.id}`, 'bob@x.co', 'DELETE')).body).toEqual({ deleted: 1 })
  })

  it('sends the config’s views with the admin’s schema', async () => {
    const res = await createRestHandler(cms)(
      new Request('http://cms.test/api/cms/admin/ui/schema', {
        headers: { authorization: `Bearer ${tokens['bob@x.co']}` },
      }),
    )
    const schema = (await res.json()) as { collections: { slug: string; views?: unknown }[] }
    expect(schema.collections.find((c) => c.slug === 'posts')?.views).toEqual([
      { id: 'drafts', label: 'Drafts', where: { status: { equals: 'draft' } } },
    ])
  })
})
