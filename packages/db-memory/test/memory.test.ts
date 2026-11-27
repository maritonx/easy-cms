import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type Config, createEasyCMS, silentLogger } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { createClient } from '@libsql/client'
import { afterAll, describe, expect, it } from 'vitest'

// The built package: dist/kit.js is drizzle-kit built for browsers, which is what this tests.
// A computed path, so type checking doesn't need dist/ (turbo builds it before tests only).
const built = 'index.js'
const { memory } = (await import(`../dist/${built}`)) as typeof import('../src/index.js')

const SECRET = 'x'.repeat(32)

const collections: Config['collections'] = [
  {
    slug: 'posts',
    drafts: true,
    fields: [
      { name: 'title', type: 'text', required: true },
      { name: 'slug', type: 'slug', from: 'title', unique: true },
      { name: 'views', type: 'number' },
      { name: 'featured', type: 'boolean' },
      { name: 'tags', type: 'select', options: ['a', 'b'], hasMany: true },
      { name: 'author', type: 'relationship', to: 'authors' },
      { name: 'rows', type: 'array', fields: [{ name: 'x', type: 'text' }] },
      { name: 'seo', type: 'group', fields: [{ name: 'metaTitle', type: 'text' }] },
      { name: 'body', type: 'richText' },
    ],
  },
  { slug: 'authors', fields: [{ name: 'name', type: 'text', required: true, unique: true }] },
]
const globals: Config['globals'] = [{ slug: 'site', fields: [{ name: 'name', type: 'text' }] }]

const open = (db: Config['db'], cwd = '/') =>
  createEasyCMS(
    { secret: SECRET, db, collections, globals },
    { cwd, schema: 'push', logger: silentLogger },
  )

const dirs: string[] = []
afterAll(() => {
  for (const dir of dirs) {
    // Windows may still hold the SQLite file for a moment after close: retry, then leave it.
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    } catch {
      // the OS cleans its temp directory
    }
  }
})

/** Every table and index, as SQLite stores them. */
const SCHEMA_SQL =
  "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type, name"

describe('memory()', () => {
  it('makes the same tables and indexes as db-sqlite (drizzle-kit built for browsers)', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'easy-cms-memory-'))
    dirs.push(cwd)
    const onDisk = await open(sqlite({ url: 'file:./cms.db' }), cwd)
    await onDisk.destroy()
    const client = createClient({ url: `file:${join(cwd, 'cms.db')}` })
    const expected = (await client.execute(SCHEMA_SQL)).rows.map((r) => ({ ...r }))
    client.close()

    const cms = await open(memory())
    const actual = await cms.db.query?.([SCHEMA_SQL], [])
    await cms.destroy()
    expect(actual?.map((r) => ({ ...r }))).toEqual(expected)
    expect(expected.length).toBeGreaterThan(10)
  })

  it('creates, finds, updates and deletes documents', async () => {
    const cms = await open(memory())
    const author = await cms.create('authors', { name: 'Ann' })
    const post = await cms.create('posts', {
      title: 'Hello World',
      status: 'published',
      views: 3,
      featured: true,
      tags: ['a', 'b'],
      author: author.id,
      rows: [{ x: 'one' }, { x: 'two' }],
      seo: { metaTitle: 'Hi' },
    })
    expect(post).toMatchObject({ slug: 'hello-world', featured: true, tags: ['a', 'b'] })

    const found = await cms.find('posts', { where: { tags: { equals: 'b' } }, depth: 1 })
    expect(found.totalDocs).toBe(1)
    expect(found.docs[0]).toMatchObject({
      author: { name: 'Ann' },
      rows: [{ x: 'one' }, { x: 'two' }],
      seo: { metaTitle: 'Hi' },
    })

    await cms.update('posts', post.id, { views: 4, rows: [{ x: 'three' }] })
    expect(await cms.findById('posts', post.id)).toMatchObject({ views: 4, rows: [{ x: 'three' }] })
    await cms.updateGlobal('site', { name: 'Studio' })
    expect(await cms.findGlobal('site')).toMatchObject({ name: 'Studio' })

    await cms.delete('posts', post.id)
    expect((await cms.find('posts', {})).totalDocs).toBe(0)
    await cms.destroy()
  })

  it('refuses a duplicate unique value', async () => {
    const cms = await open(memory())
    await cms.create('authors', { name: 'Same' })
    await expect(cms.create('authors', { name: 'Same' })).rejects.toThrow()
    expect((await cms.find('authors', {})).totalDocs).toBe(1)
    await cms.destroy()
  })

  it('rolls a transaction back, and commits one', async () => {
    const cms = await open(memory())
    await expect(
      cms.transaction(async (tx) => {
        await tx.create('authors', { name: 'Gone' })
        throw new Error('stop')
      }),
    ).rejects.toThrow('stop')
    await cms.transaction(async (tx) => {
      await tx.create('authors', { name: 'Kept' })
    })
    const names = (await cms.find('authors', {})).docs.map((d) => d.name)
    expect(names).toEqual(['Kept'])
    await cms.destroy()
  })

  it('gives every CMS a database of its own', async () => {
    const one = await open(memory())
    const two = await open(memory())
    await one.create('authors', { name: 'Only in one' })
    expect((await two.find('authors', {})).totalDocs).toBe(0)
    await one.destroy()
    await two.destroy()
  })
})
