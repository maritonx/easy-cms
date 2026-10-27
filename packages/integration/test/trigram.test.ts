import { createEasyCMS, defineConfig, silentLogger, type Where } from '@easy-cms/core'
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
