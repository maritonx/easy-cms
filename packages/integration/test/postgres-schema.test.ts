import { createEasyCMS, defineConfig, silentLogger } from '@easy-cms/core'
import { describe, expect, it } from 'vitest'
import { DIALECT, db, open, rawQuery, SECRET, table, tempProject } from './helpers.js'

// Database isolation L1: the role's search_path is its own schema (CI's pgbouncer job).
const schema = process.env.POSTGRES_SCHEMA

const config = defineConfig({
  secret: SECRET,
  db: db(),
  collections: [
    {
      slug: 'posts',
      fields: [
        { name: 'title', type: 'text', localized: true },
        { name: 'tags', type: 'select', options: ['a', 'b'], hasMany: true },
      ],
    },
  ],
  localization: { locales: ['en', 'th'], defaultLocale: 'en' },
})

async function schemasOf(cwd: string) {
  const rows = await rawQuery(
    cwd,
    `select distinct schemaname from pg_tables where tablename like '${table(cwd, '')}%'`,
  )
  return rows.map((row) => row.schemaname)
}

describe.runIf(DIALECT === 'postgres' && schema)('a schema of its own (search_path)', () => {
  it('creates every table there, none in public', async () => {
    const cwd = tempProject()
    const cms = await open(config, cwd)
    await cms.create('posts', { title: 'Hello', tags: ['a'] })
    expect(await schemasOf(cwd)).toEqual([schema])
    await cms.destroy()
  })

  it('applies and verifies migration files there', async () => {
    const cwd = tempProject()
    const tool = await createEasyCMS(config, { cwd, schema: 'skip', logger: silentLogger })
    await tool.db.createMigration({ name: 'init' })
    await tool.db.migrate()
    await tool.destroy()
    const cms = await open(config, cwd, 'verify')
    const post = await cms.create('posts', { title: 'Hello', tags: ['b'] })
    expect((await cms.findById('posts', post.id))?.tags).toEqual(['b'])
    expect(await schemasOf(cwd)).toEqual([schema])
    await cms.destroy()
  })
})
