import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type Config,
  createEasyCMS,
  createRestHandler,
  defineConfig,
  resolveConfig,
  silentLogger,
} from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { seoPlugin } from '../src/index.js'

const SECRET = 'x'.repeat(32)
const PASSWORD = 'password123'
const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) removeTemp(dir)
})

/** Windows may still hold the SQLite file for a moment after close; retry, then leave it. */
function removeTemp(path: string) {
  try {
    rmSync(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  } catch {
    // The OS cleans its temp directory.
  }
}

const base = (plugins: NonNullable<Config['plugins']>, extra: Partial<Config> = {}): Config =>
  defineConfig({
    secret: SECRET,
    db: sqlite({ url: 'file:./cms.db' }),
    admin: { siteUrl: 'https://blog.test' },
    collections: [
      {
        slug: 'posts',
        useAsTitle: 'title',
        fields: [
          { name: 'title', type: 'text' },
          { name: 'slug', type: 'slug', from: 'title' },
          { name: 'excerpt', type: 'textarea' },
          { name: 'cover', type: 'upload' },
        ],
      },
    ],
    globals: [{ slug: 'site', fields: [{ name: 'name', type: 'text' }] }],
    plugins,
    ...extra,
  })

const generators = seoPlugin({
  collections: ['posts'],
  globals: ['site'],
  generateTitle: ({ doc }) => (doc.title ? `${doc.title} | Blog` : null),
  generateDescription: ({ doc }) => doc.excerpt as string,
  generateImage: ({ doc }) => doc.cover as number,
  generateURL: ({ doc, collection }) =>
    collection ? `https://blog.test/posts/${doc.slug}` : 'https://blog.test/',
})

async function open(config: Config) {
  const cwd = mkdtempSync(join(tmpdir(), 'easy-cms-seo-'))
  dirs.push(cwd)
  return createEasyCMS(config, { cwd, schema: 'push', logger: silentLogger })
}

describe('seoPlugin config', () => {
  it('adds a meta group with components, the admin module and the endpoint', async () => {
    const config = await resolveConfig(
      base([generators], { localization: { locales: ['th', 'en'] } }),
    )
    const posts = config.collections.find((c) => c.slug === 'posts')
    const meta = posts?.fields.at(-1)
    expect(meta).toMatchObject({ name: 'meta', type: 'group', label: 'SEO' })
    expect(meta?.type === 'group' && meta.fields.map((f) => [f.name, f.type, f.localized])).toEqual(
      [
        ['title', 'text', true],
        ['description', 'textarea', true],
        ['image', 'upload', undefined],
        ['noindex', 'boolean', undefined],
      ],
    )
    expect(meta?.type === 'group' && meta.fields[0]?.admin?.after).toEqual([
      { tag: 'ecms-seo-meter', props: { kind: 'title', min: 50, max: 60, generate: true } },
    ])
    expect(meta?.admin?.after).toEqual([
      {
        tag: 'ecms-seo-preview',
        props: { titleField: 'title', url: true, siteUrl: 'https://blog.test' },
      },
    ])
    expect(config.globals[0]?.fields.at(-1)?.name).toBe('meta')
    expect(config.admin.modules).toEqual(['@easy-cms/plugin-seo/admin'])
    expect(config.endpoints.map((e) => `${e.method} ${e.path}${e.root ? ' (root)' : ''}`)).toEqual([
      'post /seo/generate',
      'get /seo/sitemap.xml',
      'get /sitemap.xml (root)',
      'get /robots.txt (root)',
      'get /llms.txt (root)',
      'get /llms-full.txt (root)',
    ])
  })

  it('takes options for position, lengths, fields and localization', async () => {
    const config = await resolveConfig(
      base([
        seoPlugin({
          collections: ['posts'],
          position: 'sidebar',
          titleLength: { min: 30, max: 70 },
          localized: false,
          label: { en: 'Search', th: 'ค้นหา' },
          fields: (defaults) => [...defaults, { name: 'keywords', type: 'text' }],
          robots: false,
        }),
      ]),
    )
    const meta = config.collections.find((c) => c.slug === 'posts')?.fields.at(-1)
    expect(meta).toMatchObject({ position: 'sidebar', label: { en: 'Search', th: 'ค้นหา' } })
    if (meta?.type !== 'group') throw new Error('expected a group')
    expect(meta.fields.map((f) => f.name)).toEqual([
      'title',
      'description',
      'image',
      'noindex',
      'keywords',
    ])
    expect(config.endpoints.some((e) => e.path === '/robots.txt')).toBe(false)
    expect(meta.fields[0]?.localized).toBeUndefined()
    expect(meta.fields[0]?.admin?.after?.[0]).toMatchObject({
      props: { min: 30, max: 70, generate: false },
    })
    // No image generator: no image button.
    expect(meta.fields[2]?.admin).toBeUndefined()
  })

  it('rejects unknown slugs and an existing meta field', async () => {
    await expect(resolveConfig(base([seoPlugin({ collections: ['nope'] })]))).rejects.toThrow(
      'unknown collection "nope"',
    )
    const taken = base([seoPlugin({ globals: ['site'] })])
    const withMeta = {
      ...taken,
      globals: [{ slug: 'site', fields: [{ name: 'meta', type: 'text' as const }] }],
    }
    await expect(resolveConfig(withMeta)).rejects.toThrow('already has a field named "meta"')
  })
})

describe('generate endpoint', () => {
  it('runs generators with the unsaved form, for logged-in users only', async () => {
    const cms = await open(base([generators]))
    try {
      const handle = createRestHandler(cms)
      await cms.create('users', { email: 'a@x.co', password: PASSWORD, role: 'editor' })
      const login = await handle(
        new Request('http://cms.test/api/cms/users/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'a@x.co', password: PASSWORD }),
        }),
      )
      const session = login.headers.getSetCookie().find((c) => c.startsWith('ecms-session='))
      const token = decodeURIComponent(session?.split(';')[0]?.split('=')[1] ?? '')
      const generate = (body: unknown, auth = true) =>
        handle(
          new Request('http://cms.test/api/cms/seo/generate', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              ...(auth ? { authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(body),
          }),
        )

      const title = await generate({ kind: 'title', collection: 'posts', doc: { title: 'Hello' } })
      expect(await title.json()).toEqual({ value: 'Hello | Blog' })
      const url = await generate({ kind: 'url', global: 'site', doc: {} })
      expect(await url.json()).toEqual({ value: 'https://blog.test/' })
      const empty = await generate({ kind: 'title', collection: 'posts', doc: {} })
      expect(await empty.json()).toEqual({ value: null })

      expect((await generate({ kind: 'title', collection: 'posts', doc: {} }, false)).status).toBe(
        401,
      )
      expect((await generate({ kind: 'nope', collection: 'posts' })).status).toBe(400)
      expect((await generate({ kind: 'title', collection: 'users' })).status).toBe(404)
    } finally {
      await cms.destroy()
    }
  })
})

describe('autoGenerate', () => {
  it('fills empty meta fields on save and keeps what editors wrote', async () => {
    const cms = await open(
      base([
        seoPlugin({
          collections: ['posts'],
          autoGenerate: true,
          generateTitle: ({ doc }) => `${doc.title} | Blog`,
          generateDescription: ({ doc }) => (doc.excerpt as string) ?? null,
        }),
      ]),
    )
    try {
      const created = await cms.create('posts', { title: 'Hello', excerpt: 'About hello' })
      expect(created.meta).toMatchObject({ title: 'Hello | Blog', description: 'About hello' })

      const custom = await cms.create('posts', { title: 'Two', meta: { title: 'Custom' } })
      expect(custom.meta).toMatchObject({ title: 'Custom', description: null })

      // Emptied fields are filled again; an update without meta leaves them alone.
      const cleared = await cms.update('posts', created.id, {
        meta: { title: '', description: 'Kept' },
      })
      expect(cleared.meta).toMatchObject({ title: 'Hello | Blog', description: 'Kept' })
      const renamed = await cms.update('posts', created.id, { title: 'Renamed' })
      expect(renamed.meta).toMatchObject({ title: 'Hello | Blog' })
    } finally {
      await cms.destroy()
    }
  })
})

describe('sitemap', () => {
  const site = (extra: Partial<Config> = {}) =>
    base(
      [
        seoPlugin({
          collections: ['posts'],
          globals: ['site'],
          generateURL: ({ doc, collection, locale }) =>
            collection
              ? doc.slug
                ? `/${locale ?? 'th'}/posts/${doc.slug}`
                : null
              : `/${locale ?? 'th'}`,
        }),
      ],
      {
        collections: [
          {
            slug: 'posts',
            drafts: true,
            access: { read: ({ user }) => (user ? true : { status: { equals: 'published' } }) },
            fields: [
              { name: 'title', type: 'text' },
              { name: 'slug', type: 'slug', from: 'title' },
            ],
          },
          { slug: 'private', fields: [{ name: 'title', type: 'text' }] },
        ],
        globals: [
          { slug: 'site', access: { read: () => true }, fields: [{ name: 'name', type: 'text' }] },
        ],
        ...extra,
      },
    )

  it('lists published pages visitors can see, with every locale', async () => {
    const { sitemap, sitemapXml } = await import('../src/index.js')
    const cms = await open(site({ localization: { locales: ['th', 'en'], defaultLocale: 'th' } }))
    try {
      await cms.create('posts', { title: 'Hello', status: 'published' })
      await cms.create('posts', { title: 'Draft', status: 'draft' })
      await cms.create('posts', { title: 'Hidden', status: 'published', meta: { noindex: true } })
      const entries = await sitemap(cms)
      expect(entries.map((e) => e.url)).toEqual([
        'https://blog.test/th/posts/hello',
        'https://blog.test/en/posts/hello',
        'https://blog.test/th',
        'https://blog.test/en',
      ])
      expect(entries[0]?.alternates?.languages).toEqual({
        th: 'https://blog.test/th/posts/hello',
        en: 'https://blog.test/en/posts/hello',
        'x-default': 'https://blog.test/th/posts/hello',
      })
      expect(entries[0]?.lastModified).toMatch(/^\d{4}-/)

      const xml = await sitemapXml(cms)
      expect(xml).toContain('<loc>https://blog.test/th/posts/hello</loc>')
      expect(xml).toContain(
        '<xhtml:link rel="alternate" hreflang="en" href="https://blog.test/en/posts/hello"/>',
      )
      expect(xml).not.toContain('draft')
      expect(xml).not.toContain('hidden')

      // The same through the API, and from the root for the standalone server.
      const { createRootEndpointHandler } = await import('@easy-cms/core')
      const api = await createRestHandler(cms)(
        new Request('http://cms.test/api/cms/seo/sitemap.xml'),
      )
      expect(api.headers.get('content-type')).toContain('application/xml')
      expect(await api.text()).toBe(xml)
      const root = createRootEndpointHandler(cms)
      expect(await (await root(new Request('http://cms.test/sitemap.xml')))?.text()).toBe(xml)
      expect(await (await root(new Request('http://cms.test/robots.txt')))?.text()).toContain(
        'Sitemap: http://cms.test/sitemap.xml',
      )
    } finally {
      await cms.destroy()
    }
  })

  it('needs absolute URLs, and the plugin', async () => {
    const { sitemap } = await import('../src/index.js')
    const cms = await open(site({ admin: {} }))
    try {
      await cms.create('posts', { title: 'Hello', status: 'published' })
      await expect(sitemap(cms)).rejects.toThrow('not an absolute URL')
      expect((await sitemap(cms, { siteUrl: 'https://x.test' })).map((e) => e.url)).toEqual([
        'https://x.test/th/posts/hello',
        'https://x.test/th',
      ])
    } finally {
      await cms.destroy()
    }
    const plain = await open(base([]))
    try {
      await expect(sitemap(plain)).rejects.toThrow('add seoPlugin()')
    } finally {
      await plain.destroy()
    }
  })

  it('splits more than 50,000 URLs into an index', async () => {
    const { sitemapXml } = await import('../src/index.js')
    const entries = Array.from({ length: 50_001 }, (_, i) => ({ id: i, updatedAt: '2026-01-01' }))
    const cms = {
      config: {
        admin: { siteUrl: 'https://big.test' },
        localization: null,
        endpoints: (
          await resolveConfig(
            base([seoPlugin({ collections: ['posts'], generateURL: ({ id }) => `/p/${id}` })]),
          )
        ).endpoints,
      },
      find: async (_: string, options: Record<string, unknown>) => {
        const page = options.page as number
        const docs = entries.slice((page - 1) * 500, page * 500)
        return { docs, hasNextPage: page * 500 < entries.length }
      },
      findGlobal: async () => ({}),
    }
    const index = await sitemapXml(cms)
    expect(index).toContain('<sitemapindex')
    expect(index).toContain('<loc>https://big.test/sitemap.xml?page=2</loc>')
    const second = await sitemapXml(cms, { page: '2' })
    expect(second.match(/<url>/g)).toHaveLength(1)
    expect(second).toContain('https://big.test/p/50000')
  })
})

describe('robotsTxt', () => {
  it('keeps crawlers out of the admin and API, but not uploads', async () => {
    const { robotsTxt } = await import('../src/index.js')
    expect(robotsTxt({ config: { admin: { siteUrl: 'https://blog.test/' } } })).toBe(
      `User-agent: *
Allow: /api/cms/media/file/
Disallow: /admin/
Disallow: /api/cms/
Sitemap: https://blog.test/sitemap.xml
`.replace('Disallow: /api/cms/\n', 'Disallow: /api/cms/\n\n'),
    )
    expect(
      robotsTxt({
        config: { admin: { path: 'cms' }, routes: { api: '/api/' } },
        disallow: ['/search'],
        sitemap: false,
      }),
    ).toBe(
      'User-agent: *\nAllow: /api/media/file/\nDisallow: /cms/\nDisallow: /api/\nDisallow: /search\n',
    )
    expect(robotsTxt({ disallowAll: true })).toBe('User-agent: *\nDisallow: /\n')
  })
})

describe('AI crawlers in robots.txt', () => {
  it('blocks groups of AI crawlers and adds custom rules', async () => {
    const { robotsTxt, AI_CRAWLERS } = await import('../src/index.js')
    const text = robotsTxt({
      ai: { training: false },
      rules: [{ userAgent: 'SomeBot', disallow: ['/private/'] }],
      sitemap: false,
    })
    expect(text).toContain(
      `${AI_CRAWLERS.training.map((a) => `User-agent: ${a}`).join('\n')}\nDisallow: /\n`,
    )
    expect(text).not.toContain('User-agent: OAI-SearchBot')
    // A crawler follows only its own group, so it gets the admin and API rules too.
    expect(text).toContain(
      'User-agent: SomeBot\nDisallow: /private/\nAllow: /api/cms/media/file/\nDisallow: /admin/\nDisallow: /api/cms/\n',
    )
    // Default: no AI groups at all.
    expect(robotsTxt({ sitemap: false })).not.toContain('GPTBot')
  })
})

describe('llms.txt and Markdown', () => {
  const blog = (extra: Partial<Parameters<typeof seoPlugin>[0]> = {}) =>
    base(
      [
        seoPlugin({
          collections: ['posts'],
          globals: ['site'],
          generateURL: ({ doc, collection }) =>
            collection ? (doc.slug ? `/posts/${doc.slug}` : null) : '/',
          llms: {
            description: 'A blog about Easy CMS.',
            markdownURL: ({ doc, collection }) => (collection ? `/posts/${doc.slug}.md` : null),
          },
          ...extra,
        }),
      ],
      {
        collections: [
          {
            slug: 'posts',
            labels: { plural: { en: 'Posts', th: 'บทความ' } },
            useAsTitle: 'title',
            drafts: true,
            access: { read: ({ user }) => (user ? true : { status: { equals: 'published' } }) },
            fields: [
              { name: 'title', type: 'text' },
              { name: 'slug', type: 'slug', from: 'title' },
              { name: 'excerpt', type: 'textarea' },
              { name: 'body', type: 'richText' },
              {
                name: 'sections',
                type: 'blocks',
                blocks: [{ slug: 'quote', fields: [{ name: 'text', type: 'text' }] }],
              },
            ],
          },
        ],
        globals: [
          {
            slug: 'site',
            access: { read: () => true },
            fields: [{ name: 'siteName', type: 'text' }],
          },
        ],
      },
    )
  const body = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Why' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Because *it* works.' }] },
    ],
  }

  it('indexes visible pages and renders them as Markdown', async () => {
    const { llmsTxt, llmsFullTxt, docMarkdown } = await import('../src/index.js')
    const cms = await open(blog())
    try {
      await cms.updateGlobal('site', { siteName: 'Easy Blog' })
      await cms.create('posts', {
        title: 'Hello',
        excerpt: 'First post.',
        body,
        sections: [{ blockType: 'quote', text: 'A quote' }],
        status: 'published',
        meta: { description: 'All about hello.' },
      })
      await cms.create('posts', { title: 'Draft', status: 'draft' })
      await cms.create('posts', { title: 'Hidden', status: 'published', meta: { noindex: true } })

      expect(await llmsTxt(cms)).toBe(`# Easy Blog

> A blog about Easy CMS.

## Posts

- [Hello](https://blog.test/posts/hello.md): All about hello.

## Pages

- [Easy Blog](https://blog.test/)
`)
      const post = (await cms.find('posts', { where: { slug: { equals: 'hello' } } })).docs[0]
      const markdown = docMarkdown(cms, {
        collection: 'posts',
        doc: post as never,
        url: 'https://blog.test/posts/hello',
      })
      expect(markdown).toContain(
        '# Hello\n\n> All about hello.\n\nURL: https://blog.test/posts/hello  \nPublished: ',
      )
      expect(markdown).toContain('## Why\n\nBecause \\*it\\* works.\n\nA quote\n')

      const full = await llmsFullTxt(cms)
      expect(full.startsWith('# Easy Blog\n\n> A blog about Easy CMS.\n\n---\n\n# Hello')).toBe(
        true,
      )
      expect(full).not.toContain('Draft')
      expect(full).not.toContain('Hidden')
      const cut = await llmsFullTxt(cms, { maxBytes: 80 })
      expect(cut).toContain('More pages are listed in /llms.txt')

      // The standalone server serves them from the root.
      const { createRootEndpointHandler } = await import('@easy-cms/core')
      const root = createRootEndpointHandler(cms)
      const served = await root(new Request('http://cms.test/llms.txt'))
      expect(served?.headers.get('content-type')).toContain('text/markdown')
      expect(await served?.text()).toContain('# Easy Blog')
    } finally {
      await cms.destroy()
    }
  })

  it('takes a Markdown function per collection', async () => {
    const { docMarkdown } = await import('../src/index.js')
    const cms = await open(blog({ markdown: { posts: (doc) => `# ${doc.title}!` } }))
    try {
      expect(docMarkdown(cms, { collection: 'posts', doc: { title: 'Custom' } })).toBe(
        '# Custom!\n',
      )
    } finally {
      await cms.destroy()
    }
  })
})

describe('IndexNow', () => {
  it('sends published, unpublished and deleted pages in batches, only for public sites', async () => {
    const sent: { url: string; body: Record<string, unknown> }[] = []
    const fake = (async (url: string, init: RequestInit) => {
      sent.push({ url, body: JSON.parse(String(init.body)) })
      return new Response(null, { status: 202 })
    }) as typeof fetch
    const key = 'a1b2c3d4-key'
    const config = base(
      [
        seoPlugin({
          collections: ['posts'],
          generateURL: ({ doc }) => (doc.slug ? `/posts/${doc.slug}` : null),
          indexNow: { key, delay: 10, fetch: fake },
        }),
      ],
      {
        admin: { siteUrl: 'https://blog.example.org' },
        collections: [
          {
            slug: 'posts',
            drafts: true,
            versions: true,
            fields: [
              { name: 'title', type: 'text' },
              { name: 'slug', type: 'slug', from: 'title' },
            ],
          },
        ],
      },
    )
    const cms = await open(config)
    const wait = () => new Promise((r) => setTimeout(r, 60))
    try {
      const draft = await cms.create('posts', { title: 'Hello', status: 'draft' })
      await wait()
      expect(sent).toEqual([])

      await cms.update('posts', draft.id, { status: 'published' })
      const second = await cms.create('posts', { title: 'Second', status: 'published' })
      await wait()
      expect(sent).toEqual([
        {
          url: 'https://api.indexnow.org/indexnow',
          body: {
            host: 'blog.example.org',
            key,
            keyLocation: `https://blog.example.org/${key}.txt`,
            urlList: [
              'https://blog.example.org/posts/hello',
              'https://blog.example.org/posts/second',
            ],
          },
        },
      ])

      // A draft over the published post leaves the page as it is.
      sent.length = 0
      await cms.update('posts', draft.id, { title: 'Hello again', status: 'draft' })
      await wait()
      expect(sent).toEqual([])
      await cms.unpublish('posts', draft.id)
      await wait()
      expect(sent.map((s) => s.body.urlList)).toEqual([['https://blog.example.org/posts/hello']])
      sent.length = 0
      await cms.delete('posts', second.id)
      await wait()
      expect(sent.map((s) => s.body.urlList)).toEqual([['https://blog.example.org/posts/second']])

      // The key file, for the standalone server and for apps.
      const { indexNowKeyFile } = await import('../src/index.js')
      expect(indexNowKeyFile(cms, `/${key}.txt`)).toBe(key)
      expect(indexNowKeyFile(cms, '/other.txt')).toBeUndefined()
    } finally {
      await cms.destroy()
    }

    // Local sites send nothing.
    sent.length = 0
    const local = await open({ ...config, admin: { siteUrl: 'http://localhost:3000' } })
    try {
      await local.create('posts', { title: 'Local', status: 'published' })
      await wait()
      expect(sent).toEqual([])
    } finally {
      await local.destroy()
    }
    await expect(
      resolveConfig(base([seoPlugin({ collections: ['posts'], indexNow: { key: 'short' } })])),
    ).rejects.toThrow('indexNow.key')
  })
})
