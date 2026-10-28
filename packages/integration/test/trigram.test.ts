import {
  type AdminSchema,
  createEasyCMS,
  createRestHandler,
  defineConfig,
  QueryError,
  silentLogger,
  type Where,
} from '@easy-cms/core'
import { describe, expect, it } from 'vitest'
import { DIALECT, db, open, rawQuery, SECRET, table, tempProject } from './helpers.js'

const config = defineConfig({
  secret: SECRET,
  db: db(),
  localization: { locales: ['th', 'en'], defaultLocale: 'th' },
  collections: [
    {
      slug: 'articles',
      access: { read: () => true },
      fields: [
        { name: 'title', type: 'text', localized: true, index: 'trigram' },
        { name: 'summary', type: 'textarea', index: 'trigram' },
      ],
    },
  ],
})

const TITLES = ['บทความที่หนึ่ง เรื่องกาแฟ', 'บทความที่สอง เรื่องชา', 'ข่าวกาแฟดริป']

describe("index: 'trigram' (#176)", () => {
  it('finds any part of Thai and English text with like', async () => {
    const cms = await open(config)
    for (const [i, title] of TITLES.entries()) {
      const doc = await cms.create('articles', { title, summary: `สรุปที่ ${i}` })
      await cms.update('articles', doc.id, { title: `Article ${i} about coffee` }, { locale: 'en' })
    }
    const find = async (where: Where, locale?: string) =>
      (await cms.find('articles', { where, ...(locale ? { locale } : {}), sort: 'createdAt' })).docs
        .length
    expect(await find({ title: { like: 'กาแฟ' } })).toBe(2)
    expect(await find({ title: { like: 'ที่สอง' } })).toBe(1)
    expect(await find({ title: { like: 'COFFEE' } }, 'en')).toBe(3)
    expect(await find({ summary: { like: 'ที่ 2' } })).toBe(1)
    await cms.destroy()
  })

  it.runIf(DIALECT !== 'sqlite')(
    'makes a GIN pg_trgm index for every locale, after creating the extension',
    async () => {
      const cwd = tempProject()
      const tool = await createEasyCMS(config, {
        cwd,
        schema: 'skip',
        scheduler: false,
        logger: silentLogger,
      })
      const created = await tool.db.createMigration({ name: 'init' })
      expect(created?.statements[0]).toBe('CREATE EXTENSION IF NOT EXISTS pg_trgm')
      await tool.db.migrate()
      await tool.destroy()
      const rows = await rawQuery(
        cwd,
        `select indexname, indexdef from pg_indexes where tablename = '${table(cwd, 'articles')}' and indexdef like '%gin_trgm_ops%' order by indexname`,
      )
      const columns = rows.map((r) => String(r.indexdef).match(/\(([^ ]+) gin_trgm_ops\)/)?.[1])
      expect(columns.sort()).toEqual(['summary', 'title', 'title__en'])
      expect(rows.every((r) => String(r.indexdef).includes('USING gin'))).toBe(true)
    },
  )

  it.runIf(DIALECT === 'sqlite')(
    'makes no index on SQLite, and the config still works',
    async () => {
      const cms = await open(config)
      const rows = await rawQuery(
        cms.cwd,
        "select name from sqlite_master where type = 'index' and name like '%trgm%'",
      )
      expect(rows).toEqual([])
      await cms.destroy()
    },
  )
})

describe('like on a field with a trigram index needs three characters (#257)', () => {
  it.runIf(DIALECT !== 'sqlite')('refuses fewer, which would read every row', async () => {
    const cms = await open(config)
    await cms.create('articles', { title: 'กาแฟดริป', summary: 'ab' })
    await expect(cms.find('articles', { where: { title: { like: 'กา' } } })).rejects.toThrow(
      QueryError,
    )
    await expect(
      cms.find('articles', { where: { title: { like: 'กาแ' } } }),
    ).resolves.toMatchObject({ totalDocs: 1 })
    const response = await createRestHandler(cms)(
      new Request('http://cms.test/api/cms/articles?where[title][like]=42'),
    )
    expect(response.status).toBe(400)
    expect(await response.text()).toContain('at least 3 characters')
    await cms.destroy()
  })

  it('works with fewer on SQLite, which has no trigram index', async () => {
    const cms = await open(config)
    await cms.create('articles', { title: 'กาแฟดริป' })
    const short = cms.find('articles', { where: { title: { like: 'กา' } } })
    if (DIALECT === 'sqlite') await expect(short).resolves.toMatchObject({ totalDocs: 1 })
    else await expect(short).rejects.toThrow(QueryError)
    await cms.destroy()
  })

  it('makes the admin wait for three characters, and still finds ids', async () => {
    const cms = await open(config)
    const email = 'admin@example.test'
    await cms.create('users', { email, password: 'password123', role: 'admin' } as never)
    const doc = await cms.create('articles', { title: 'กาแฟดริป' })
    const { token } = await cms.auth.login({ email, password: 'password123' })
    const handle = createRestHandler(cms)
    const get = async (path: string) => {
      const response = await handle(
        new Request(`http://cms.test/api/cms${path}`, {
          headers: { authorization: `Bearer ${token}` },
        }),
      )
      expect(response.status).toBe(200)
      return (await response.json()) as Record<string, unknown>
    }
    const schema = (await get('/admin/ui/schema')) as unknown as AdminSchema
    expect(schema.collections.find((c) => c.slug === 'articles')?.searchMin).toBe(3)
    const search = async (q: string) =>
      (
        (await get(`/admin/ui/search?q=${encodeURIComponent(q)}`)) as {
          docs: { collection: string; id: number }[]
        }
      ).docs.filter((d) => d.collection === 'articles')
    expect(await search('กาแ')).toHaveLength(1)
    expect(await search('กา')).toEqual([])
    expect((await search(String(doc.id))).map((d) => d.id)).toEqual([doc.id])
    await cms.destroy()
  })
})
