import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type Config,
  createEasyCMS,
  createRestHandler,
  defineConfig,
  type Plugin,
  resolveConfig,
  silentLogger,
} from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { normalizePath, redirectsPlugin, resolveRedirect } from '../src/index.js'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    } catch {
      // Windows may still hold the SQLite file; the OS cleans temp.
    }
  }
})

const postURL = ({ doc, locale }: { doc: Record<string, unknown>; locale: string | null }) =>
  doc.slug ? `${locale === 'en' ? '/en' : ''}/posts/${doc.slug}` : null

const base = (
  plugin: Plugin = redirectsPlugin({ collections: ['posts'], url: postURL }),
  extra: Partial<Config> = {},
) =>
  defineConfig({
    secret: 'x'.repeat(32),
    db: sqlite({ url: 'file:./cms.db' }),
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
    plugins: [plugin],
    ...extra,
  })

async function open(config: Config) {
  const cwd = mkdtempSync(join(tmpdir(), 'easy-cms-redirects-'))
  dirs.push(cwd)
  return createEasyCMS(config, { cwd, schema: 'push', logger: silentLogger, scheduler: false })
}

describe('normalizePath', () => {
  it('keeps the pathname without a trailing slash', () => {
    expect(normalizePath('/old/')).toBe('/old')
    expect(normalizePath('https://x.test/a/b?c=1#d')).toBe('/a/b')
    expect(normalizePath('/')).toBe('/')
    expect(normalizePath('/ข่าว')).toBe('/%E0%B8%82%E0%B9%88%E0%B8%B2%E0%B8%A7')
    expect(normalizePath('old')).toBeNull()
    expect(normalizePath('')).toBeNull()
  })
})

describe('redirectsPlugin config', () => {
  it('adds a redirects collection under Settings', async () => {
    const config = await resolveConfig(base())
    const redirects = config.collections.find((c) => c.slug === 'redirects')
    expect(redirects?.admin?.group).toBe('settings')
    expect(redirects?.fields.map((f) => f.name)).toEqual(['from', 'to', 'to_posts', 'type'])
    expect(config.endpoints.map((e) => e.path)).toEqual(['/resolve-redirect'])
  })

  it('checks its options', async () => {
    await expect(
      resolveConfig(base(redirectsPlugin({ collections: ['nope'], url: postURL }))),
    ).rejects.toThrow('unknown collection "nope"')
    await expect(resolveConfig(base(redirectsPlugin({ collections: ['posts'] })))).rejects.toThrow(
      'set `url`',
    )
  })
})

describe('redirects', () => {
  it('resolves fixed addresses and documents, keeping the query string', async () => {
    const cms = await open(base())
    try {
      const post = await cms.create('posts', { title: 'Hello', status: 'published' })
      await cms.create('redirects', { from: '/old/', to: 'https://other.test/new', type: '302' })
      await cms.create('redirects', { from: '/promo', to_posts: post.id })
      expect(await resolveRedirect(cms, '/old')).toEqual({
        location: 'https://other.test/new',
        status: 302,
      })
      expect(await resolveRedirect(cms, new URL('https://site.test/promo?utm=x'))).toEqual({
        location: '/posts/hello?utm=x',
        status: 301,
      })
      expect(await resolveRedirect(cms, '/nothing')).toBeNull()

      // Validation: one target, and a path to redirect from.
      await expect(cms.create('redirects', { from: '/x' })).rejects.toThrow('give an address')
      await expect(
        cms.create('redirects', { from: '/x', to: '/a', to_posts: post.id }),
      ).rejects.toThrow('not both')
      await expect(cms.create('redirects', { from: 'x', to: '/a' })).rejects.toThrow(
        'must be a path',
      )

      // The REST endpoint, for frontends on another server.
      const handle = createRestHandler(cms)
      const found = await handle(new Request('http://cms.test/api/cms/resolve-redirect?path=/old'))
      expect(await found.json()).toEqual({ location: 'https://other.test/new', status: 302 })
      const none = await handle(new Request('http://cms.test/api/cms/resolve-redirect?path=/none'))
      expect(none.status).toBe(404)
    } finally {
      await cms.destroy()
    }
  })

  it('follows changes at once, and skips unpublished targets', async () => {
    const cms = await open(base())
    try {
      const post = await cms.create('posts', { title: 'Hello', status: 'published' })
      const redirect = await cms.create('redirects', { from: '/a', to: '/b' })
      expect((await resolveRedirect(cms, '/a'))?.location).toBe('/b')
      await cms.update('redirects', redirect.id, { to: '/c' })
      expect((await resolveRedirect(cms, '/a'))?.location).toBe('/c')
      await cms.create('redirects', { from: '/p', to_posts: post.id })
      await cms.unpublish('posts', post.id)
      expect(await resolveRedirect(cms, '/p')).toBeNull()
      await cms.delete('redirects', redirect.id)
      expect(await resolveRedirect(cms, '/a')).toBeNull()
    } finally {
      await cms.destroy()
    }
  })

  it('adds a redirect when a published page gets a new address, in every locale', async () => {
    const cms = await open(base(undefined, { localization: { locales: ['th', 'en'] } }))
    try {
      const post = await cms.create('posts', { title: 'Hello', status: 'published' })
      // A draft over the published post: the live address stays, no redirect.
      await cms.update('posts', post.id, { slug: 'draft-slug', status: 'draft' })
      expect((await cms.find('redirects', {})).totalDocs).toBe(0)

      await cms.update('posts', post.id, { slug: 'hello-again', status: 'published' })
      const auto = await cms.find('redirects', { sort: 'locale' })
      expect(auto.docs.map((r) => [r.from, r.locale])).toEqual([
        ['/en/posts/hello', 'en'],
        ['/posts/hello', 'th'],
      ])
      expect(await resolveRedirect(cms, '/posts/hello')).toEqual({
        location: '/posts/hello-again',
        status: 301,
      })
      expect((await resolveRedirect(cms, '/en/posts/hello'))?.location).toBe(
        '/en/posts/hello-again',
      )

      // Renamed again: the first redirect follows the document, no chain; going back to the
      // first address removes the redirect that would loop.
      await cms.update('posts', post.id, { slug: 'third', status: 'published' })
      expect((await resolveRedirect(cms, '/posts/hello'))?.location).toBe('/posts/third')
      expect((await resolveRedirect(cms, '/posts/hello-again'))?.location).toBe('/posts/third')
      await cms.update('posts', post.id, { slug: 'hello', status: 'published' })
      expect(await resolveRedirect(cms, '/posts/hello')).toBeNull()
      expect((await resolveRedirect(cms, '/posts/third'))?.location).toBe('/posts/hello')
    } finally {
      await cms.destroy()
    }
  })

  it('can leave automatic redirects off', async () => {
    const cms = await open(
      base(redirectsPlugin({ collections: ['posts'], url: postURL, autoRedirect: false })),
    )
    try {
      const post = await cms.create('posts', { title: 'Hello', status: 'published' })
      await cms.update('posts', post.id, { slug: 'other', status: 'published' })
      expect((await cms.find('redirects', {})).totalDocs).toBe(0)
    } finally {
      await cms.destroy()
    }
  })
})
