import { readFileSync, writeFileSync } from 'node:fs'
import { type Config, createEasyCMS, defineConfig, SchemaError, silentLogger } from '@easy-cms/core'
import { describe, expect, it } from 'vitest'
import { db, rawQuery, SECRET, table, tempProject } from './helpers.js'

// `migrate:create --empty` and `--data` (#441, ADR-0072).

const v1 = defineConfig({
  secret: SECRET,
  db: db(),
  collections: [{ slug: 'posts', fields: [{ name: 'title', type: 'text' }] }],
})
const v2 = defineConfig({
  ...v1,
  collections: [
    {
      slug: 'posts',
      fields: [
        { name: 'title', type: 'text' },
        { name: 'summary', type: 'text' },
      ],
    },
  ],
})

/** A project migrated to v1, with two posts. */
async function project() {
  const cwd = tempProject()
  const tool = (c: Config) =>
    createEasyCMS(c, { cwd, schema: 'skip', scheduler: false, logger: silentLogger })
  const first = await tool(v1)
  await first.db.createMigration({ name: 'init' })
  await first.db.migrate()
  await first.create('posts', { title: 'Hello' })
  await first.create('posts', { title: 'World' })
  await first.destroy()
  // Names are timestamped to the second.
  await new Promise((r) => setTimeout(r, 1100))
  return { cwd, tool }
}

/** A data step that copies each title into the new `summary` column, then maybe fails. */
const copyTitles = (posts: string, fail = false) => `
export default async (tx) => {
  const rows = await tx.sql\`SELECT id, title FROM ${posts}\`
  for (const row of rows)
    await tx.sql\`UPDATE ${posts} SET summary = \${'About ' + row.title} WHERE id = \${row.id}\`
  ${fail ? "throw new Error('mapping failed')" : ''}
}
`

describe('data migrations (#441)', () => {
  it('run after their SQL, in its transaction, and are listed', async () => {
    const { cwd, tool } = await project()
    const cms = await tool(v2)
    const created = await cms.db.createMigration({ name: 'summary', kind: 'data' })
    expect(created?.statements.join()).toMatch(/summary/)
    expect(readFileSync(created?.dataFile as string, 'utf8')).toContain('DataMigration')
    writeFileSync(created?.dataFile as string, copyTitles(table(cwd, 'posts')))

    expect(await cms.db.migrate()).toEqual([created?.name])
    const { docs } = await cms.find('posts', { sort: 'title' })
    expect(docs.map((d) => d.summary)).toEqual(['About Hello', 'About World'])
    expect(
      (await cms.db.migrationStatus()).map(({ applied, data }) => ({ applied, data })),
    ).toEqual([
      { applied: true, data: false },
      { applied: true, data: true },
    ])
    await cms.destroy()
    // The schema is at the config: production starts.
    await (
      await createEasyCMS(v2, { cwd, schema: 'verify', scheduler: false, logger: silentLogger })
    ).destroy()
  })

  it('roll back with their SQL when they throw', async () => {
    const { cwd, tool } = await project()
    const cms = await tool(v2)
    const created = await cms.db.createMigration({ name: 'summary', kind: 'data' })
    const dataFile = created?.dataFile as string
    writeFileSync(dataFile, copyTitles(table(cwd, 'posts'), true))

    await expect(cms.db.migrate()).rejects.toThrow(SchemaError)
    await expect(cms.db.migrate()).rejects.toThrow(/rolled back: mapping failed/)
    expect((await cms.db.migrationStatus()).at(-1)).toMatchObject({ applied: false, data: true })

    // The column was not added either: fixed, the whole migration runs again.
    writeFileSync(dataFile, copyTitles(table(cwd, 'posts')))
    expect(await cms.db.migrate()).toEqual([created?.name])
    expect((await cms.find('posts', { sort: 'title' })).docs[0]?.summary).toBe('About Hello')
    await cms.destroy()
  })

  it('with no config changes: only the data step', async () => {
    const { cwd, tool } = await project()
    const cms = await tool(v1)
    const created = await cms.db.createMigration({ name: 'titles', kind: 'data' })
    expect(created?.statements).toEqual([])
    writeFileSync(
      created?.dataFile as string,
      `export default async (tx) => { await tx.sql\`UPDATE ${table(cwd, 'posts')} SET title = \${'Hi'} WHERE title = \${'Hello'}\` }`,
    )
    await cms.db.migrate()
    expect((await cms.find('posts', { sort: 'title' })).docs.map((d) => d.title)).toEqual([
      'Hi',
      'World',
    ])
    await cms.destroy()
  })
})

describe('empty migrations (#441)', () => {
  it('run the SQL written in them, and leave the schema at the last migration', async () => {
    const { cwd, tool } = await project()
    const cms = await tool(v1)
    const created = await cms.db.createMigration({ name: 'app log', kind: 'empty' })
    expect(created?.name).toMatch(/_app_log$/)
    expect(created?.statements).toEqual([])
    const log = table(cwd, 'app_log')
    writeFileSync(
      created?.file as string,
      `${readFileSync(created?.file as string, 'utf8')}CREATE TABLE ${log} (id integer PRIMARY KEY, note text NOT NULL)
--> statement-breakpoint
INSERT INTO ${log} (id, note) VALUES (1, 'made by hand')
`,
    )
    expect(await cms.db.migrate()).toEqual([created?.name])
    expect(await rawQuery(cwd, `SELECT note FROM ${log}`)).toEqual([{ note: 'made by hand' }])
    // Nothing of the config changed since.
    expect(await cms.db.createMigration({ name: 'again' })).toBeNull()
    await cms.destroy()
    await (
      await createEasyCMS(v1, { cwd, schema: 'verify', scheduler: false, logger: silentLogger })
    ).destroy()
  })

  it('keep the config changes for a migration of their own', async () => {
    const { tool } = await project()
    const cms = await tool(v2)
    expect((await cms.db.createMigration({ name: 'by hand', kind: 'empty' }))?.statements).toEqual(
      [],
    )
    await cms.db.migrate()
    await new Promise((r) => setTimeout(r, 1100))
    const changes = await cms.db.createMigration({ name: 'summary' })
    expect(changes?.statements.join()).toMatch(/summary/)
    await cms.db.migrate()
    await cms.destroy()
  })
})
