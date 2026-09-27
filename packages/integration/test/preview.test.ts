import { createRestHandler, defineConfig, isLoggedIn } from '@easy-cms/core'
import { describe, expect, it } from 'vitest'
import { db, open, SECRET } from './helpers.js'

const config = defineConfig({
  secret: SECRET,
  db: db(),
  collections: [
    {
      slug: 'categories',
      access: { read: () => true },
      fields: [{ name: 'name', type: 'text' }],
    },
    {
      slug: 'posts',
      drafts: true,
      versions: true,
      preview: ({ doc }) => `/posts/${doc.slug}`,
      access: { read: () => true, create: isLoggedIn, update: isLoggedIn },
      hooks: { afterRead: [({ doc }) => ({ ...doc, readHook: true })] },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'slug', type: 'slug', from: 'title' },
        { name: 'views', type: 'number' },
        { name: 'category', type: 'relationship', to: 'categories' },
      ],
    },
    { slug: 'notes', fields: [{ name: 'text', type: 'text' }] },
  ],
  globals: [
    {
      slug: 'site',
      preview: () => '/',
      access: { read: () => true, update: isLoggedIn },
      fields: [{ name: 'name', type: 'text' }],
    },
  ],
})

type CMS = Awaited<ReturnType<typeof open<typeof config>>>

async function setup(cms: CMS) {
  const category = await cms.create('categories', { name: 'Guides' })
  const post = await cms.create('posts', { title: 'Live', status: 'published' })
  return { category, post }
}

describe('live preview (FR-PRV)', () => {
  it('shows unsaved changes on top of the document, populated, without saving (FR-PRV-01)', async () => {
    const cms = await open(config)
    const { category, post } = await setup(cms)
    const { doc, url } = await cms.preview('posts', post.id, {
      title: 'Edited title',
      category: category.id,
    })
    expect(doc).toMatchObject({
      id: post.id,
      title: 'Edited title',
      category: { id: category.id, name: 'Guides' },
      readHook: true,
    })
    expect(url).toBe('/posts/live')
    // Nothing was saved, and no version was recorded.
    expect((await cms.findById('posts', post.id, { draft: true }))?.title).toBe('Live')
    expect((await cms.findVersions('posts', post.id)).totalDocs).toBe(1)
    await cms.destroy()
  })

  it('previews new documents and keeps incomplete or invalid input (FR-PRV-02)', async () => {
    const cms = await open(config)
    const { doc, url } = await cms.preview('posts', null, { title: 'Brand new', views: 'many' })
    expect(doc).toMatchObject({ title: 'Brand new', slug: 'brand-new', status: 'draft' })
    expect(url).toBe('/posts/brand-new')
    expect(await cms.count('posts', { draft: true })).toBe(0)
    await cms.destroy()
  })

  it('builds on the pending draft of a published document', async () => {
    const cms = await open(config)
    const { post } = await setup(cms)
    await cms.update('posts', post.id, { title: 'Pending draft', status: 'draft' })
    const { doc } = await cms.preview('posts', post.id, { views: 3 })
    expect(doc).toMatchObject({ title: 'Pending draft', views: 3 })
    await cms.destroy()
  })

  it('checks access and previews globals', async () => {
    const cms = await open(config)
    const { post } = await setup(cms)
    await expect(
      cms.preview('posts', post.id, {}, { overrideAccess: false, user: null }),
    ).rejects.toMatchObject({ status: 401 })
    const note = await cms.create('notes', { text: 'x' })
    expect((await cms.preview('notes', note.id, { text: 'y' })).url).toBeNull()

    await cms.updateGlobal('site', { name: 'Saved' })
    const { doc, url } = await cms.previewGlobal('site', { name: 'Unsaved' })
    expect(doc.name).toBe('Unsaved')
    expect(url).toBe('/')
    expect((await cms.findGlobal('site')).name).toBe('Saved')
    await cms.destroy()
  })

  it('is available over REST', async () => {
    const cms = await open(config)
    const { post } = await setup(cms)
    const handle = createRestHandler(cms)
    const admin = await cms.create('users', {
      email: 'admin@x.test',
      password: 'password123',
      role: 'admin',
    } as never)
    const { token } = await cms.auth.createSession(admin.id)
    const call = async (path: string, body: unknown) => {
      const response = await handle(
        new Request(`http://cms.test/api/cms${path}`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
      )
      return { status: response.status, json: JSON.parse(await response.text()) }
    }
    expect(
      (await call(`/posts/${post.id}/preview?depth=0`, { title: 'Over REST' })).json,
    ).toMatchObject({ doc: { title: 'Over REST' }, url: '/posts/live' })
    expect((await call('/posts/preview', { title: 'New over REST' })).json.url).toBe(
      '/posts/new-over-rest',
    )
    expect((await call('/globals/site/preview', { name: 'G' })).json.doc.name).toBe('G')
    expect((await call('/posts/999/preview', {})).status).toBe(404)
    await cms.destroy()
  })
})
