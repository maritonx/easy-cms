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
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
})

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
    expect(config.endpoints.map((e) => `${e.method} ${e.path}`)).toEqual(['post /seo/generate'])
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
          fields: (defaults) => [...defaults, { name: 'noindex', type: 'boolean' }],
        }),
      ]),
    )
    const meta = config.collections.find((c) => c.slug === 'posts')?.fields.at(-1)
    expect(meta).toMatchObject({ position: 'sidebar', label: { en: 'Search', th: 'ค้นหา' } })
    if (meta?.type !== 'group') throw new Error('expected a group')
    expect(meta.fields.map((f) => f.name)).toEqual(['title', 'description', 'image', 'noindex'])
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
