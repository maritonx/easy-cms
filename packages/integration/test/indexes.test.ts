import { type Config, createEasyCMS, defineConfig, silentLogger } from '@easy-cms/core'
import { describe, expect, it } from 'vitest'
import { DIALECT, db, open, rawQuery, SECRET, table, tempProject } from './helpers.js'

const config = defineConfig({
  secret: SECRET,
  db: db(),
  collections: [
    { slug: 'authors', fields: [{ name: 'name', type: 'text' }] },
    {
      slug: 'posts',
      drafts: true,
      fields: [
        { name: 'title', type: 'text' },
        { name: 'publishedAt', type: 'date', index: true },
        { name: 'author', type: 'relationship', to: 'authors' },
      ],
    },
    {
      slug: 'notes',
      fields: [{ name: 'author', type: 'relationship', to: 'authors' }],
    },
  ],
})

/** Each index of a table: its name and columns, in order. */
async function indexes(cwd: string, slug: string): Promise<Record<string, string[]>> {
  const name = table(cwd, slug)
  const rows =
    DIALECT === 'sqlite'
      ? await rawQuery(
          cwd,
          `select il.name as index_name, ii.name as column_name from pragma_index_list('${name}') il, pragma_index_info(il.name) ii order by il.name, ii.seqno`,
        )
      : await rawQuery(
          cwd,
          `select i.relname as index_name, a.attname as column_name from pg_index x join pg_class i on i.oid = x.indexrelid join pg_class t on t.oid = x.indrelid cross join lateral unnest(x.indkey) with ordinality k(attnum, n) join pg_attribute a on a.attrelid = t.oid and a.attnum = k.attnum where t.relname = '${name}' order by i.relname, k.n`,
        )
  const out: Record<string, string[]> = {}
  for (const row of rows) {
    const index = String(row.index_name).replace(`${name}_`, '')
    out[index] = [...(out[index] ?? []), String(row.column_name)]
  }
  return out
}

describe('indexes in collections with drafts (#257)', () => {
  it('index fields together with status, so public counts read only the index', async () => {
    const cms = await open(config)
    const posts = await indexes(cms.cwd, 'posts')
    expect(posts.author_status_idx).toEqual(['author', 'status'])
    expect(posts.published_at_status_idx).toEqual(['published_at', 'status'])
    expect(posts.author_idx).toBeUndefined()
    expect(posts.status_idx).toEqual(['status'])
    // Without drafts there is no status to add.
    expect((await indexes(cms.cwd, 'notes')).author_idx).toEqual(['author'])
    await cms.destroy()
  })

  it.runIf(DIALECT !== 'sqlite')(
    'adds statistics on each field and status, in migrations and push',
    async () => {
      const statistics = async (cwd: string) =>
        (
          await rawQuery(
            cwd,
            `select s.stxname as name from pg_statistic_ext s join pg_class t on t.oid = s.stxrelid where t.relname = '${table(cwd, 'posts')}' order by 1`,
          )
        ).map((r) => String(r.name).replace(`${table(cwd, 'posts')}_`, ''))
      const expected = ['author_status_stats', 'published_at_status_stats']

      const pushed = await open(config)
      expect(await statistics(pushed.cwd)).toEqual(expected)
      await pushed.destroy()

      const cwd = tempProject()
      const migrate = async (cfg: Config, name: string) => {
        const tool = await createEasyCMS(cfg, {
          cwd,
          schema: 'skip',
          scheduler: false,
          logger: silentLogger,
        })
        const created = await tool.db.createMigration({ name })
        await tool.db.migrate()
        await tool.destroy()
        return created
      }
      const first = await migrate(config, 'init')
      expect(first?.statements.filter((s) => s.startsWith('CREATE STATISTICS'))).toHaveLength(2)
      expect(await statistics(cwd)).toEqual(expected)
      expect(await migrate(config, 'again')).toBeNull()
      // Without the field, its statistics go too.
      const fewer = defineConfig({
        ...config,
        collections: config.collections.map((c) =>
          c.slug === 'posts' ? { ...c, fields: c.fields.filter((f) => f.name !== 'author') } : c,
        ),
      })
      const second = await migrate(fewer, 'no author')
      expect(second?.statements[0]).toMatch(/^DROP STATISTICS IF EXISTS .*author_status_stats/)
      expect(await statistics(cwd)).toEqual(['published_at_status_stats'])
    },
  )
})
