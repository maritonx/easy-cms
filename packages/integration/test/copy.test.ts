import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type CollectionConfig,
  type Config,
  createEasyCMS,
  type DatabaseAdapter,
  silentLogger,
} from '@easy-cms/core'
import { copyDatabase } from '@easy-cms/core/internal'
import { postgres } from '@easy-cms/db-postgres'
import { sqlite } from '@easy-cms/db-sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { SECRET } from './helpers.js'

// Runs once per project like every file, but always copies between SQLite and PGlite itself.

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
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), 'easy-cms-copy-'))
  dirs.push(dir)
  return dir
}

const collections: CollectionConfig[] = [
  { slug: 'categories', useAsTitle: 'name', fields: [{ name: 'name', type: 'text' }] },
  {
    slug: 'posts',
    drafts: true,
    versions: true,
    fields: [
      { name: 'title', type: 'text', required: true, localized: true },
      { name: 'slug', type: 'slug', from: 'title' },
      { name: 'views', type: 'number' },
      { name: 'featured', type: 'boolean' },
      { name: 'tags', type: 'select', options: ['a', 'b', 'c'], hasMany: true },
      { name: 'category', type: 'relationship', to: 'categories' },
      { name: 'related', type: 'relationship', to: 'posts', hasMany: true },
      { name: 'meta', type: 'group', fields: [{ name: 'description', type: 'textarea' }] },
      { name: 'links', type: 'array', fields: [{ name: 'url', type: 'text' }] },
      {
        name: 'layout',
        type: 'blocks',
        blocks: [{ slug: 'quote', fields: [{ name: 'text', type: 'text' }] }],
      },
      { name: 'data', type: 'json' },
    ],
  },
]

const config = (db: DatabaseAdapter, extra: Partial<Config> = {}): Config => ({
  secret: SECRET,
  db,
  localization: { locales: ['th', 'en'] },
  collections,
  globals: [{ slug: 'site', fields: [{ name: 'name', type: 'text', localized: true }] }],
  ...extra,
})

const open = (db: DatabaseAdapter, cwd: string, extra: Partial<Config> = {}) =>
  createEasyCMS(config(db, extra), { cwd, schema: 'push', logger: silentLogger, scheduler: false })

type CMS = Awaited<ReturnType<typeof open>>

/** Content with every kind of storage: child tables, localized columns, versions, users. */
async function fill(cms: CMS) {
  await cms.create('users', { email: 'ann@example.com', password: 'password-ann', role: 'admin' })
  const news = await cms.create('categories', { name: 'News' })
  const first = await cms.create('posts', {
    title: 'สวัสดี',
    views: 3,
    featured: true,
    tags: ['a', 'c'],
    category: news.id,
    meta: { description: 'Hi' },
    links: [{ url: 'https://a.test' }, { url: 'https://b.test' }],
    layout: [{ blockType: 'quote', text: 'Quote' }],
    data: { nested: [1, 2] },
    status: 'published',
  })
  await cms.update('posts', first.id, { title: 'Hello' }, { locale: 'en' })
  const second = await cms.create('posts', { title: 'Second', related: [first.id] })
  await cms.update('posts', second.id, { title: 'Second, edited' })
  await cms.updateGlobal('site', { name: 'เว็บ' })
  return { first, second }
}

const everything = async (cms: CMS) => ({
  posts: (await cms.find('posts', { limit: 0, draft: true, locale: 'all', depth: 0 })).docs,
  categories: (await cms.find('categories', { limit: 0 })).docs,
  users: (await cms.find('users', { limit: 0 })).docs,
  site: await cms.findGlobal('site', { locale: 'all' }),
})

describe('copyDatabase', () => {
  it('copies SQLite into Postgres with ids, versions, users and globals', async () => {
    const source = await open(sqlite({ url: 'file:./cms.db' }), temp())
    const target = await open(postgres({ pglite: 'memory://' }), temp())
    try {
      const { first, second } = await fill(source)
      const tables: string[] = []
      const result = await copyDatabase(source.db, target.db, {
        onTable: ({ table }) => tables.push(table),
      })
      expect(result.rows).toBeGreaterThan(10)
      expect(tables).toContain('ecms_posts')
      expect(tables).toContain('ecms_globals')

      expect(await everything(target)).toEqual(await everything(source))
      const versions = async (cms: CMS) =>
        (await cms.findVersions('posts', second.id, { limit: 10 })).docs.map((v) => v.id)
      expect(await versions(target)).toEqual(await versions(source))

      // Password hashes and sessions came along: the same login works.
      const session = await target.auth.login({
        email: 'ann@example.com',
        password: 'password-ann',
      })
      expect(session.user.email).toBe('ann@example.com')

      // New documents get ids after the copied ones (sequences were moved).
      const third = await target.create('posts', { title: 'Third' })
      expect(Number(third.id)).toBeGreaterThan(Math.max(Number(first.id), Number(second.id)))
      const category = await target.create('categories', { name: 'More' })
      expect(Number(category.id)).toBe(2)
    } finally {
      await source.destroy()
      await target.destroy()
    }
  })

  it('copies Postgres back into SQLite', async () => {
    const source = await open(postgres({ pglite: 'memory://' }), temp())
    const target = await open(sqlite({ url: 'file:./cms.db' }), temp())
    try {
      await fill(source)
      await copyDatabase(source.db, target.db)
      expect(await everything(target)).toEqual(await everything(source))
      const next = await target.create('categories', { name: 'More' })
      expect(Number(next.id)).toBe(2)
    } finally {
      await source.destroy()
      await target.destroy()
    }
  })

  it('refuses a target that has content, or a config with other fields', async () => {
    const source = await open(sqlite({ url: 'file:./cms.db' }), temp())
    const used = await open(sqlite({ url: 'file:./cms.db' }), temp())
    const other = await open(sqlite({ url: 'file:./cms.db' }), temp(), {
      collections: [...collections, { slug: 'extra', fields: [{ name: 'x', type: 'text' }] }],
    })
    try {
      await fill(source)
      await used.create('categories', { name: 'Already here' })
      await expect(copyDatabase(source.db, used.db)).rejects.toThrow('is not empty')
      await expect(copyDatabase(source.db, other.db)).rejects.toThrow('different collections')
      // Nothing was written.
      expect(await other.count('categories')).toBe(0)
    } finally {
      await source.destroy()
      await used.destroy()
      await other.destroy()
    }
  })
})
