import {
  type Config,
  createEasyCMS,
  createRestHandler,
  defineConfig,
  type ID,
  silentLogger,
} from '@easy-cms/core'
import { describe, expect, it } from 'vitest'
import { db, open, rawQuery, SECRET, table, tempProject } from './helpers.js'

const config = defineConfig({
  secret: SECRET,
  db: db(),
  localization: { locales: ['th', 'en'], defaultLocale: 'th' },
  collections: [
    {
      slug: 'posts',
      drafts: true,
      versions: true,
      access: { read: () => true },
      preview: ({ doc, locale }) => `/${locale}/posts/${doc.slug}`,
      fields: [
        { name: 'title', type: 'text', required: true, localized: true },
        { name: 'slug', type: 'slug', from: 'title', localized: true },
        { name: 'views', type: 'number', defaultValue: 0 },
        { name: 'code', type: 'text', unique: true, localized: true },
        {
          name: 'seo',
          type: 'group',
          fields: [{ name: 'description', type: 'text', localized: true }],
        },
        {
          name: 'links',
          type: 'array',
          fields: [
            { name: 'url', type: 'text' },
            { name: 'label', type: 'text', localized: true },
          ],
        },
      ],
    },
  ],
  globals: [
    {
      slug: 'site',
      access: { read: () => true },
      fields: [{ name: 'name', type: 'text', localized: true, defaultValue: 'เว็บของฉัน' }],
    },
  ],
})

type CMS = Awaited<ReturnType<typeof open<typeof config>>>

const thaiPostData = async () => ({
  title: 'สวัสดี',
  seo: { description: 'คำอธิบาย' },
  links: [{ url: 'https://example.com', label: 'ลิงก์' }],
  status: 'published' as const,
})

async function thaiPost(cms: CMS) {
  return cms.create('posts', await thaiPostData())
}

describe('localization (FR-L10N)', () => {
  it('writes the default locale and falls back to it when reading others (FR-L10N-01)', async () => {
    const cms = await open(config)
    const post = await thaiPost(cms)
    expect(post).toMatchObject({ title: 'สวัสดี', slug: 'สวัสดี', views: 0 })

    // No English yet: English reads fall back to Thai, unless fallback is off.
    expect(await cms.findById('posts', post.id, { locale: 'en' })).toMatchObject({
      title: 'สวัสดี',
      seo: { description: 'คำอธิบาย' },
    })
    expect(
      await cms.findById('posts', post.id, { locale: 'en', fallbackLocale: false }),
    ).toMatchObject({ title: null, seo: { description: null } })
    await cms.destroy()
  })

  it('keeps other locales when writing one; shares fields that are not localized (FR-L10N-02)', async () => {
    const cms = await open(config)
    const post = await thaiPost(cms)
    const linkId = post.links?.[0]?.id as string
    const en = await cms.update(
      'posts',
      post.id,
      {
        title: 'Hello',
        views: 5,
        seo: { description: 'Description' },
        links: [{ id: linkId, url: 'https://example.com', label: 'Link' }],
      },
      { locale: 'en' },
    )
    expect(en).toMatchObject({ title: 'Hello', slug: 'hello', views: 5 })
    expect(await cms.findById('posts', post.id)).toMatchObject({
      title: 'สวัสดี',
      slug: 'สวัสดี',
      views: 5,
      seo: { description: 'คำอธิบาย' },
      links: [{ label: 'ลิงก์' }],
    })
    expect(await cms.findById('posts', post.id, { locale: 'all' })).toMatchObject({
      title: { th: 'สวัสดี', en: 'Hello' },
      slug: { th: 'สวัสดี', en: 'hello' },
      links: [{ label: { th: 'ลิงก์', en: 'Link' } }],
    })
    const [row] = await rawQuery(cms.cwd, `select title, title__en from ${table(cms.cwd, 'posts')}`)
    expect(row).toMatchObject({ title: 'สวัสดี', title__en: 'Hello' })
    await cms.destroy()
  })

  it('queries and sorts by the locale being read (FR-L10N-03)', async () => {
    const cms = await open(config)
    const a = await cms.create('posts', { title: 'ข', status: 'published' })
    await cms.update('posts', a.id, { title: 'Apple' }, { locale: 'en' })
    const b = await cms.create('posts', { title: 'ก', status: 'published' })
    await cms.update('posts', b.id, { title: 'Banana' }, { locale: 'en' })

    const th = await cms.find('posts', { sort: 'title' })
    expect(th.docs.map((d) => d.title)).toEqual(['ก', 'ข'])
    const en = await cms.find('posts', { sort: 'title', locale: 'en' })
    expect(en.docs.map((d) => d.title)).toEqual(['Apple', 'Banana'])
    const found = await cms.find('posts', { where: { title: { equals: 'Banana' } }, locale: 'en' })
    expect(found.docs.map((d) => d.id)).toEqual([b.id])
    expect((await cms.find('posts', { where: { title: { equals: 'Banana' } } })).totalDocs).toBe(0)
    expect(await cms.count('posts', { where: { 'title.en': { like: 'an' } } })).toBe(1)
    await expect(cms.find('posts', { locale: 'fr' })).rejects.toThrow(/Unknown locale "fr"/)
    await cms.destroy()
  })

  it('keeps slugs and unique values unique per locale (FR-L10N-04)', async () => {
    const cms = await open(config)
    const one = await cms.create('posts', { title: 'หนึ่ง', code: 'X' })
    await cms.update('posts', one.id, { title: 'Same', code: 'X' }, { locale: 'en' })
    const two = await cms.create('posts', { title: 'สอง' })
    const updated = await cms.update('posts', two.id, { title: 'Same' }, { locale: 'en' })
    expect(updated.slug).toBe('same-2')
    // The same code in another locale is fine; in the same locale it is not.
    await expect(cms.update('posts', two.id, { code: 'X' })).rejects.toMatchObject({
      errors: [{ field: 'code', message: 'must be unique' }],
    })
    await expect(
      cms.update('posts', two.id, { code: 'X' }, { locale: 'en' }),
    ).rejects.toMatchObject({ errors: [{ field: 'code.en', message: 'must be unique' }] })
    await cms.destroy()
  })

  it('requires values in the locale being written', async () => {
    const cms = await open(config)
    await expect(
      cms.create('posts', { title: '', status: 'published' }, { locale: 'en' }),
    ).rejects.toMatchObject({ errors: [{ field: 'title', message: 'is required' }] })
    // Written in English only: allowed, Thai stays empty.
    const post = await cms.create(
      'posts',
      { title: 'Only English', status: 'published' },
      { locale: 'en' },
    )
    expect(await cms.findById('posts', post.id, { locale: 'all' })).toMatchObject({
      title: { th: null, en: 'Only English' },
    })
    await cms.destroy()
  })

  it('works with versions, preview and globals', async () => {
    const cms = await open(config)
    const post = await thaiPost(cms)
    await cms.update('posts', post.id, { title: 'Hello' }, { locale: 'en' })
    const first = (await cms.findVersions('posts', post.id)).docs[1]
    // Restoring brings back every locale as it was.
    await cms.restoreVersion('posts', post.id, first?.id as number)
    expect(await cms.findById('posts', post.id, { locale: 'all', draft: true })).toMatchObject({
      title: { th: 'สวัสดี', en: null },
    })

    const { doc, url } = await cms.preview(
      'posts',
      post.id,
      { title: 'Preview EN' },
      { locale: 'en' },
    )
    expect(doc.title).toBe('Preview EN')
    expect(url).toBe('/en/posts/preview-en')

    expect((await cms.findGlobal('site')).name).toBe('เว็บของฉัน')
    await cms.updateGlobal('site', { name: 'My site' }, { locale: 'en' })
    expect((await cms.findGlobal('site', { locale: 'en' })).name).toBe('My site')
    expect((await cms.findGlobal('site')).name).toBe('เว็บของฉัน')
    await cms.destroy()
  })

  it('is available over REST with ?locale=', async () => {
    const cms = await open(config)
    const post = await thaiPost(cms)
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
    await call('PATCH', `/posts/${post.id}?locale=en`, { title: 'Hello' })
    expect((await call('GET', `/posts/${post.id}?locale=en`)).json.title).toBe('Hello')
    expect((await call('GET', `/posts/${post.id}`)).json.title).toBe('สวัสดี')
    expect((await call('GET', `/posts/${post.id}?locale=all`)).json.title).toEqual({
      th: 'สวัสดี',
      en: 'Hello',
    })
    expect((await call('GET', `/posts?locale=en&where[title][equals]=Hello`)).json.totalDocs).toBe(
      1,
    )
    expect((await call('GET', `/posts/${post.id}?locale=xx`)).status).toBe(400)
    await cms.destroy()
  })
})

describe('turning localization on', () => {
  it('keeps existing values as the default locale (FR-L10N-05)', async () => {
    const cwd = tempProject()
    const plain: Config = {
      secret: SECRET,
      db: db(),
      collections: [{ slug: 'pages', fields: [{ name: 'title', type: 'text' }] }],
    }
    const before = await open(plain, cwd)
    const page = await before.create('pages', { title: 'เดิม' })
    await before.destroy()

    const after = await open(
      {
        ...plain,
        localization: { locales: ['th', 'en'] },
        collections: [
          { slug: 'pages', fields: [{ name: 'title', type: 'text', localized: true }] },
        ],
      },
      cwd,
    )
    expect(await after.findById('pages', page.id, { locale: 'all' })).toMatchObject({
      title: { th: 'เดิม', en: null },
    })
    await after.destroy()
  })

  describe('changing the default locale', () => {
    const withDefault = (defaultLocale: 'th' | 'en') => ({
      ...config,
      localization: { locales: ['th', 'en'], defaultLocale },
    })

    async function check(cms: CMS, id: ID) {
      const post = await cms.findById('posts', id, { locale: 'all' })
      expect(post).toMatchObject({
        title: { th: 'สวัสดี', en: 'Hello' },
        slug: { th: 'สวัสดี', en: 'hello' },
        code: { th: 'A', en: 'B' },
        seo: { description: { th: 'คำอธิบาย', en: 'Description' } },
      })
      expect(post?.links.map((l) => l.label)).toEqual([{ th: 'ลิงก์', en: 'Link' }])
      // The plain path now means the new default locale.
      const found = await cms.find('posts', { where: { title: { equals: 'Hello' } } })
      expect(found.docs.map((d) => d.id)).toEqual([id])
    }

    async function seed(cms: CMS) {
      const post = await cms.create('posts', { ...(await thaiPostData()), code: 'A' })
      await cms.update(
        'posts',
        post.id,
        {
          title: 'Hello',
          code: 'B',
          seo: { description: 'Description' },
          links: [{ id: post.links[0]?.id as string, url: 'https://example.com', label: 'Link' }],
        },
        { locale: 'en' },
      )
      // A second post whose values would clash while they move.
      await cms.create('posts', { title: 'Hello', code: 'B', status: 'published' })
      return post.id
    }

    it('keeps every locale when developing (schema push)', async () => {
      const cwd = tempProject()
      const before = await open(withDefault('th'), cwd)
      const id = await seed(before)
      await before.destroy()

      const after = await open(withDefault('en'), cwd)
      await check(after as never, id)
      await after.destroy()
    })

    it('moves the values in the generated migration', async () => {
      const cwd = tempProject()
      const tool = (c: Config) => createEasyCMS(c, { cwd, schema: 'skip', logger: silentLogger })
      const t1 = await tool(withDefault('th'))
      await t1.db.createMigration({ name: 'init' })
      await t1.db.migrate()
      await t1.destroy()
      const before = await open(withDefault('th'), cwd, 'verify')
      const id = await seed(before)
      await before.destroy()

      await new Promise((r) => setTimeout(r, 1100)) // names are timestamped to the second
      const t2 = await tool(withDefault('en'))
      const created = await t2.db.createMigration({ name: 'english first' })
      expect(created?.statements.some((s) => s.startsWith('UPDATE'))).toBe(true)
      await t2.db.migrate()
      await t2.destroy()

      const after = await open(withDefault('en'), cwd, 'verify')
      await check(after as never, id)
      await after.destroy()
    })
  })
})
