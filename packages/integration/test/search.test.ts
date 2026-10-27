import {
  type Config,
  ConfigError,
  createRestHandler,
  defineConfig,
  memorySearch,
  type SearchAdapter,
} from '@easy-cms/core'
import { describe, expect, it } from 'vitest'
import { db, open, SECRET, tempProject } from './helpers.js'

// Search adapters (#177, ADR-0056): published documents are indexed as plain text as they change,
// and read back with the reader's access, best match first.

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })

const config = (extra: Partial<Config> = {}) =>
  defineConfig({
    secret: SECRET,
    db: db(),
    search: memorySearch(),
    collections: [
      {
        slug: 'posts',
        drafts: true,
        versions: true,
        // Readers who aren't signed in see public posts only.
        access: { read: ({ user }) => (user ? true : { public: { equals: true } }) },
        search: { fields: ['title', 'body', 'sections', 'seo.description'] },
        fields: [
          { name: 'title', type: 'text' },
          { name: 'body', type: 'richText' },
          { name: 'public', type: 'boolean', defaultValue: true },
          {
            name: 'sections',
            type: 'blocks',
            blocks: [{ slug: 'quote', fields: [{ name: 'text', type: 'textarea' }] }],
          },
          { name: 'seo', type: 'group', fields: [{ name: 'description', type: 'text' }] },
        ],
      },
      { slug: 'pages', fields: [{ name: 'title', type: 'text' }] },
    ],
    ...extra,
  } as Config)

const titles = (result: { hits: readonly { doc: Record<string, unknown> }[] }) =>
  result.hits.map((hit) => hit.doc.title)

describe('search (#177)', () => {
  it('finds Thai words in text without spaces, best match first', async () => {
    const cms = await open(config())
    await cms.create('posts', {
      title: 'ข่าวน้ำท่วมกรุงเทพมหานครวันนี้',
      body: { type: 'doc', content: [paragraph('ฝนตกหนักทั้งคืน')] },
      status: 'published',
    })
    await cms.create('posts', {
      title: 'ตลาดนัดสุดสัปดาห์',
      body: { type: 'doc', content: [paragraph('ปีนี้ไม่มีน้ำท่วมแล้ว')] },
      status: 'published',
    })
    await cms.create('posts', {
      title: 'Coffee guide',
      sections: [{ blockType: 'quote', text: 'กาแฟดริปหอมกรุ่น' }],
      seo: { description: 'Brewing at home' },
      status: 'published',
    })

    // In the title outranks in the body.
    expect(titles(await cms.search('น้ำท่วม'))).toEqual(['ข่าวน้ำท่วมกรุงเทพมหานครวันนี้', 'ตลาดนัดสุดสัปดาห์'])
    // The start of a word finds it: กรุงเทพ in กรุงเทพมหานคร.
    expect(titles(await cms.search('กรุงเทพ'))).toEqual(['ข่าวน้ำท่วมกรุงเทพมหานครวันนี้'])
    expect(titles(await cms.search('ฝนตก'))).toEqual(['ข่าวน้ำท่วมกรุงเทพมหานครวันนี้'])
    // Blocks and groups.
    expect(titles(await cms.search('กาแฟ'))).toEqual(['Coffee guide'])
    expect(titles(await cms.search('brewing'))).toEqual(['Coffee guide'])
    // Every word must match.
    expect(titles(await cms.search('น้ำท่วม ตลาด'))).toEqual(['ตลาดนัดสุดสัปดาห์'])
    expect((await cms.search('รถติด')).hits).toEqual([])
    expect((await cms.search('   ')).hits).toEqual([])
    await cms.destroy()
  })

  it('keeps the index to what is published as documents change', async () => {
    const cms = await open(config())
    const post = await cms.create('posts', { title: 'ร่างบทความ', status: 'draft' })
    expect((await cms.search('ร่าง')).hits).toEqual([])

    await cms.update('posts', post.id, { status: 'published' })
    expect(titles(await cms.search('ร่าง'))).toEqual(['ร่างบทความ'])

    // A draft saved on a published post: the published title stays searchable.
    await cms.update('posts', post.id, { title: 'ฉบับใหม่', status: 'draft' })
    expect(titles(await cms.search('ร่าง'))).toEqual(['ร่างบทความ'])
    expect((await cms.search('ฉบับใหม่')).hits).toEqual([])

    await cms.update('posts', post.id, { title: 'ฉบับใหม่', status: 'published' })
    expect((await cms.search('ร่าง')).hits).toEqual([])
    expect(titles(await cms.search('ฉบับใหม่'))).toEqual(['ฉบับใหม่'])

    await cms.unpublish('posts', post.id)
    expect((await cms.search('ฉบับใหม่')).hits).toEqual([])

    await cms.update('posts', post.id, { status: 'published' })
    await cms.delete('posts', post.id)
    expect((await cms.search('ฉบับใหม่')).hits).toEqual([])
    await cms.destroy()
  })

  it('reads hits with the access of the reader, a page at a time', async () => {
    const cms = await open(config())
    for (const i of [1, 2, 3])
      await cms.create('posts', { title: `ข่าว ${i}`, public: i !== 2, status: 'published' })
    const editor = await cms.create('users', {
      email: 'ed@x.co',
      password: 'password123',
      role: 'admin',
    })
    const anonymous = await cms.search('ข่าว', { overrideAccess: false, user: null })
    expect(titles(anonymous).sort()).toEqual(['ข่าว 1', 'ข่าว 3'])
    // Counted before access rules.
    expect(anonymous.total).toBe(3)
    const signedIn = await cms.search('ข่าว', { overrideAccess: false, user: editor as never })
    expect(signedIn.hits).toHaveLength(3)

    const first = await cms.search('ข่าว', { limit: 2 })
    const second = await cms.search('ข่าว', { limit: 2, page: 2 })
    expect(first).toMatchObject({ total: 3, page: 1, limit: 2, hasNextPage: true })
    expect(second).toMatchObject({ page: 2, hasNextPage: false })
    expect(new Set([...titles(first), ...titles(second)]).size).toBe(3)

    await expect(cms.search('ข่าว', { collections: ['pages'] })).rejects.toThrow(
      /"pages" is not searchable/,
    )
    await expect(cms.search('ข่าว', { limit: 500 })).rejects.toThrow(/limit/)
    await cms.destroy()
  })

  it('indexes each locale on its own', async () => {
    const cms = await open(
      defineConfig({
        secret: SECRET,
        db: db(),
        search: memorySearch(),
        localization: { locales: ['th', 'en'], defaultLocale: 'th' },
        collections: [
          {
            slug: 'posts',
            search: { fields: ['title'] },
            fields: [{ name: 'title', type: 'text', localized: true }],
          },
        ],
      }),
    )
    const post = await cms.create('posts', { title: 'แมวน้ำ' })
    await cms.update('posts', post.id, { title: 'Seal' }, { locale: 'en' })
    expect(titles(await cms.search('แมว'))).toEqual(['แมวน้ำ'])
    expect((await cms.search('seal')).hits).toEqual([])
    expect(titles(await cms.search('seal', { locale: 'en' }))).toEqual(['Seal'])
    expect((await cms.search('แมว', { locale: 'en' })).hits).toEqual([])
    await expect(cms.search('seal', { locale: 'fr' })).rejects.toThrow(/Unknown locale/)
    await cms.destroy()
  })

  it('builds an in-memory index again when the CMS starts', async () => {
    const cwd = tempProject()
    const first = await open(config(), cwd)
    await first.create('posts', { title: 'บันทึกการเดินทาง', status: 'published' })
    await first.destroy()

    const again = await open(config(), cwd)
    expect(titles(await again.search('เดินทาง'))).toEqual(['บันทึกการเดินทาง'])
    expect(await again.reindexSearch()).toEqual([{ collection: 'posts', documents: 1 }])
    await expect(again.reindexSearch('pages')).rejects.toThrow(/not searchable/)
    await again.destroy()
  })

  it('indexes from the outbox, retrying until the adapter takes it', async () => {
    const memory = memorySearch()
    let failing = 0
    const flaky: SearchAdapter = {
      ...memory,
      ephemeral: false,
      async index(entries) {
        if (failing > 0) {
          failing--
          throw new Error('search engine down')
        }
        await memory.index(entries)
      },
    }
    const cms = await open(config({ outbox: true, search: flaky }))
    failing = 1
    await cms.create('posts', { title: 'คิวงาน', status: 'published' })
    await cms.flushOutbox()
    expect((await cms.search('คิวงาน')).hits).toEqual([])
    const [row] = (await cms.db.find({ collection: 'outbox', sort: ['id'], limit: 0, page: 1 }))
      .docs
    expect(row).toMatchObject({ state: 'pending', error: 'search engine down' })

    await cms.runJobs(new Date(Date.now() + 2 * 60_000))
    expect(titles(await cms.search('คิวงาน'))).toEqual(['คิวงาน'])
    await cms.destroy()
  })

  it('serves GET <api>/search', async () => {
    const cms = await open(config())
    await cms.create('posts', { title: 'เปิดเผย', status: 'published' })
    await cms.create('posts', { title: 'เปิดเฉพาะสมาชิก', public: false, status: 'published' })
    const handle = createRestHandler(cms)
    const get = (path: string) => handle(new Request(`http://cms.test/api/cms${path}`))

    const res = await get(`/search?q=${encodeURIComponent('เปิด')}`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toMatchObject({ total: 2, page: 1, limit: 10, hasNextPage: false })
    expect(body.hits).toEqual([
      { collection: 'posts', doc: expect.objectContaining({ title: 'เปิดเผย' }) },
    ])
    expect((await get('/search?q=x&collections=pages')).status).toBe(400)
    expect((await get('/search?q=x&limit=1000')).status).toBe(400)
    const post = await handle(new Request('http://cms.test/api/cms/search', { method: 'POST' }))
    expect(post.status).toBe(405)
    await cms.destroy()
  })

  it("puts the index's matches first in the admin's command palette, with drafts by title", async () => {
    const cms = await open(config())
    await cms.create('posts', {
      title: 'Weekly notes',
      body: { type: 'doc', content: [paragraph('สภาพอากาศวันนี้')] },
      status: 'published',
    })
    await cms.create('posts', { title: 'อากาศหนาว ร่าง', status: 'draft' })
    await cms.create('users', { email: 'ad@x.co', password: 'password123', role: 'admin' })
    const { token } = await cms.auth.login({ email: 'ad@x.co', password: 'password123' })
    const handle = createRestHandler(cms)
    const get = async (path: string) =>
      (
        await handle(
          new Request(`http://cms.test/api/cms${path}`, {
            headers: { authorization: `Bearer ${token}` },
          }),
        )
      ).json() as Promise<{ docs: { title: string }[]; system: unknown }>

    const found = await get(`/admin/ui/search?q=${encodeURIComponent('อากาศ')}`)
    expect(found.docs.map((d) => d.title)).toEqual(['Weekly notes', 'อากาศหนาว ร่าง'])
    expect((await get('/admin/status')).system).toMatchObject({ search: 'memory' })
    await cms.destroy()
  })

  it('refuses search settings that cannot work', async () => {
    const posts = { slug: 'posts', fields: [{ name: 'title', type: 'text' }] } as const
    const issues = async (extra: Partial<Config>) => {
      const error = await open({ secret: SECRET, db: db(), ...extra } as Config).catch((e) => e)
      expect(error).toBeInstanceOf(ConfigError)
      return (error as ConfigError).issues.map((i) => `${i.path} ${i.message}`)
    }
    expect(await issues({ collections: [{ ...posts, search: { fields: ['title'] } }] })).toEqual([
      'collections.posts.search needs a search adapter in the config',
    ])
    expect(
      await issues({
        search: memorySearch(),
        collections: [
          {
            slug: 'posts',
            search: { fields: ['title', 'missing', 'views'] },
            fields: [
              { name: 'title', type: 'text' },
              { name: 'views', type: 'number' },
            ],
          },
        ],
      }),
    ).toEqual([
      'collections.posts.search.fields has no field "missing"',
      `collections.posts.search.fields can't index "views" (number)`,
    ])
    expect(
      await issues({ search: memorySearch(), collections: [{ ...posts, slug: 'search' }] }),
    ).toEqual(['collections.search.slug "search" is the search route when `search` is set'])
  })
})
