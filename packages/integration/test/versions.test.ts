import { createRestHandler, defineConfig, isStaff } from '@easy-cms/core'
import { describe, expect, it } from 'vitest'
import { db, open, rawQuery, SECRET, table } from './helpers.js'

const config = defineConfig({
  secret: SECRET,
  db: db(),
  collections: [
    {
      slug: 'posts',
      drafts: true,
      versions: { keep: 5 },
      access: {
        read: ({ user }) => (user ? true : { status: { equals: 'published' } }),
        update: isStaff,
      },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'summary', type: 'text', required: true },
        { name: 'tags', type: 'array', fields: [{ name: 'tag', type: 'text' }] },
        { name: 'related', type: 'relationship', to: 'pages' },
      ],
    },
    // Versions without drafts: history and restore only.
    { slug: 'pages', versions: true, fields: [{ name: 'title', type: 'text' }] },
    { slug: 'notes', fields: [{ name: 'text', type: 'text' }] },
  ],
  globals: [
    {
      slug: 'site',
      drafts: true,
      versions: true,
      access: { read: () => true },
      fields: [{ name: 'name', type: 'text' }],
    },
  ],
})

async function published(cms: Awaited<ReturnType<typeof open<typeof config>>>) {
  return cms.create('posts', {
    title: 'Live title',
    summary: 'Live summary',
    tags: [{ tag: 'a' }],
    status: 'published',
  })
}

describe('versions (FR-VER)', () => {
  it('records a version for every save, newest first (FR-VER-01)', async () => {
    const cms = await open(config)
    const page = await cms.create('pages', { title: 'v1' })
    await cms.update('pages', page.id, { title: 'v2' })
    await cms.update('pages', page.id, { title: 'v3' })
    const { docs, totalDocs } = await cms.findVersions('pages', page.id)
    expect(totalDocs).toBe(3)
    expect(docs.map((v) => v.latest)).toEqual([true, false, false])
    expect(docs.every((v) => v.status === null)).toBe(true)
    const oldest = await cms.findVersion('pages', page.id, docs[2]?.id as number)
    expect(oldest?.data.title).toBe('v1')
    await cms.destroy()
  })

  it('keeps at most `max` versions per document (FR-VER-02)', async () => {
    const cms = await open(config)
    const post = await published(cms)
    for (let i = 0; i < 7; i++) await cms.update('posts', post.id, { summary: `s${i}` })
    const { docs, totalDocs } = await cms.findVersions('posts', post.id, { limit: 50 })
    expect(totalDocs).toBe(5)
    expect((await cms.findVersion('posts', post.id, docs[0]?.id as number))?.data.summary).toBe(
      's6',
    )
    await cms.destroy()
  })

  it('restores an old version as a new one (FR-VER-03)', async () => {
    const cms = await open(config)
    const page = await cms.create('pages', { title: 'original' })
    await cms.update('pages', page.id, { title: 'changed' })
    const first = (await cms.findVersions('pages', page.id)).docs[1]
    const restored = await cms.restoreVersion('pages', page.id, first?.id as number)
    expect(restored.title).toBe('original')
    expect((await cms.findVersions('pages', page.id)).totalDocs).toBe(3)
    await cms.destroy()
  })

  it('keeps the published document live while a draft is edited (FR-VER-04)', async () => {
    const cms = await open(config)
    const post = await published(cms)

    // Partial draft updates build on the pending draft, not on the live document.
    await cms.update('posts', post.id, { title: 'Draft title', status: 'draft' })
    const draft = await cms.update('posts', post.id, { summary: 'Draft summary' })
    expect(draft).toMatchObject({ title: 'Draft title', summary: 'Draft summary', status: 'draft' })

    // The site still sees the published content.
    expect(await cms.findById('posts', post.id)).toMatchObject({
      title: 'Live title',
      status: 'published',
    })
    expect((await cms.find('posts')).docs.map((d) => d.title)).toEqual(['Live title'])
    // Editors (draft: true) see the draft.
    expect(await cms.findById('posts', post.id, { draft: true })).toMatchObject({
      title: 'Draft title',
      summary: 'Draft summary',
      tags: [{ tag: 'a' }],
    })
    const [row] = await rawQuery(cms.cwd, `select title, status from ${table(cms.cwd, 'posts')}`)
    expect(row).toMatchObject({ title: 'Live title', status: 'published' })

    // Publishing puts the draft live.
    await cms.update('posts', post.id, { status: 'published' })
    expect(await cms.findById('posts', post.id)).toMatchObject({
      title: 'Draft title',
      summary: 'Draft summary',
    })
    expect((await cms.findById('posts', post.id, { draft: true }))?.status).toBe('published')
    await cms.destroy()
  })

  it('discards a draft and unpublishes explicitly (FR-VER-05)', async () => {
    const cms = await open(config)
    const post = await published(cms)
    await cms.update('posts', post.id, { title: 'Scrapped', status: 'draft' })
    const discarded = await cms.discardDraft('posts', post.id)
    expect(discarded).toMatchObject({ title: 'Live title', status: 'published' })
    expect((await cms.findById('posts', post.id, { draft: true }))?.title).toBe('Live title')
    // The discarded draft stays in history.
    const history = await cms.findVersions('posts', post.id)
    expect(history.docs.map((v) => v.status)).toEqual(['published', 'draft', 'published'])

    const unpublished = await cms.unpublish('posts', post.id)
    expect(unpublished.status).toBe('draft')
    expect(await cms.findById('posts', post.id)).toBeNull()
    await cms.destroy()
  })

  it('restores into a draft when the collection has drafts', async () => {
    const cms = await open(config)
    const post = await published(cms)
    await cms.update('posts', post.id, { title: 'Second', status: 'published' })
    const first = (await cms.findVersions('posts', post.id)).docs[1]
    const restored = await cms.restoreVersion('posts', post.id, first?.id as number)
    expect(restored).toMatchObject({ title: 'Live title', status: 'draft' })
    expect((await cms.findById('posts', post.id))?.title).toBe('Second')
    await cms.destroy()
  })

  it('shows versions only to users who may update the document', async () => {
    const cms = await open(config)
    const post = await published(cms)
    await expect(
      cms.findVersions('posts', post.id, { overrideAccess: false, user: null }),
    ).rejects.toMatchObject({ status: 401 })
    const editor = { id: 1, email: 'e@x.test', role: 'editor' }
    expect(
      (await cms.findVersions('posts', post.id, { overrideAccess: false, user: editor })).totalDocs,
    ).toBe(1)
    // Versions record who saved.
    await cms.update(
      'posts',
      post.id,
      { title: 'By editor' },
      { overrideAccess: false, user: editor },
    )
    expect((await cms.findVersions('posts', post.id)).docs[0]?.author).toBe(1)
    await cms.destroy()
  })

  it('removes versions with their document and refuses collections without versions', async () => {
    const cms = await open(config)
    const page = await cms.create('pages', { title: 'x' })
    await cms.delete('pages', page.id)
    const rows = await rawQuery(
      cms.cwd,
      `select count(*) as n from ${table(cms.cwd, 'document_versions')}`,
    )
    expect(Number(rows[0]?.n)).toBe(0)
    const note = await cms.create('notes', { text: 'x' })
    await expect(cms.findVersions('notes', note.id)).rejects.toThrow(/no versions/)
    await cms.destroy()
  })

  it('versions globals and keeps their published content live', async () => {
    const cms = await open(config)
    await cms.updateGlobal('site', { name: 'Live', status: 'published' })
    await cms.updateGlobal('site', { name: 'Draft', status: 'draft' })
    expect((await cms.findGlobal('site')).name).toBe('Live')
    expect((await cms.findGlobal('site', { draft: true })).name).toBe('Draft')

    const history = await cms.findGlobalVersions('site')
    expect(history.docs.map((v) => v.status)).toEqual(['draft', 'published'])
    expect((await cms.findGlobalVersion('site', history.docs[1]?.id as number))?.data.name).toBe(
      'Live',
    )

    await cms.discardGlobalDraft('site')
    expect((await cms.findGlobal('site', { draft: true })).name).toBe('Live')
    await cms.restoreGlobalVersion('site', history.docs[0]?.id as number)
    expect((await cms.findGlobal('site', { draft: true })).name).toBe('Draft')
    expect((await cms.unpublishGlobal('site')).status).toBe('draft')
    await cms.destroy()
  })
})

describe('versions schema', () => {
  it('adds the versions table only when something uses versions', async () => {
    const plain = await open(
      defineConfig({ secret: SECRET, db: db(), collections: [{ slug: 'a', fields: [] }] }),
    )
    const tables = await rawQuery(
      plain.cwd,
      process.env.EASY_CMS_TEST_DIALECT === 'sqlite' || !process.env.EASY_CMS_TEST_DIALECT
        ? `select name from sqlite_master where type = 'table'`
        : `select tablename as name from pg_tables where schemaname = 'public'`,
    )
    expect(tables.map((t) => String(t.name))).not.toContain(table(plain.cwd, 'document_versions'))
    await plain.destroy()
  })
})

describe('versions over REST', () => {
  it('lists, reads and restores versions; unpublishes and discards drafts', async () => {
    const cms = await open(config)
    const handle = createRestHandler(cms)
    const admin = await cms.create('users', {
      email: 'admin@x.test',
      password: 'password123',
      role: 'admin',
    } as never)
    const { token } = await cms.auth.createSession(admin.id)
    const call = async (method: string, path: string, body?: unknown) => {
      const response = await handle(
        new Request(`http://cms.test/api/cms${path}`, {
          method,
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
      )
      return { status: response.status, json: JSON.parse(await response.text()) }
    }

    const post = await published(cms)
    await call('PATCH', `/posts/${post.id}`, { title: 'Draft', status: 'draft' })

    const list = await call('GET', `/posts/${post.id}/versions?limit=1`)
    expect(list.status).toBe(200)
    expect(list.json).toMatchObject({
      totalDocs: 2,
      limit: 1,
      docs: [{ status: 'draft', latest: true }],
    })
    const older = (await call('GET', `/posts/${post.id}/versions?page=2&limit=1`)).json.docs[0]
    const one = await call('GET', `/posts/${post.id}/versions/${older.id}`)
    expect(one.json.data).toMatchObject({ title: 'Live title', status: 'published' })
    expect((await call('GET', `/posts/${post.id}/versions/99999`)).status).toBe(404)

    expect((await call('POST', `/posts/${post.id}/discard-draft`)).json.title).toBe('Live title')
    expect(
      (await call('POST', `/posts/${post.id}/versions/${older.id}/restore`)).json,
    ).toMatchObject({ title: 'Live title', status: 'draft' })
    expect((await call('POST', `/posts/${post.id}/unpublish`)).json.status).toBe('draft')
    expect((await call('GET', `/posts/${post.id}/versions?limit=abc`)).status).toBe(400)
    expect((await call('GET', `/posts/${post.id}/nope`)).status).toBe(404)
    expect((await call('POST', `/notes/1/unpublish`)).status).toBe(400)

    // Anonymous visitors can't read history.
    const anonymous = await handle(new Request(`http://cms.test/api/cms/posts/${post.id}/versions`))
    expect(anonymous.status).toBe(401)

    // Globals
    await call('POST', '/globals/site', { name: 'Live', status: 'published' })
    await call('POST', '/globals/site', { name: 'Draft', status: 'draft' })
    const globalVersions = await call('GET', '/globals/site/versions')
    expect(globalVersions.json.totalDocs).toBe(2)
    expect((await call('POST', '/globals/site/discard-draft')).json.name).toBe('Live')
    expect((await call('POST', '/globals/site/unpublish')).json.status).toBe('draft')
    await cms.destroy()
  })
})
