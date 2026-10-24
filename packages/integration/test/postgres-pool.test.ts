import { defineConfig } from '@easy-cms/core'
import { describe, expect, it } from 'vitest'
import { DIALECT, db, open, rawQuery, SECRET, tempProject } from './helpers.js'

// Through PgBouncer, pg_stat_activity shows the pooler's server connections instead.
describe.runIf(DIALECT === 'postgres' && process.env.POSTGRES_PREPARE !== 'false')(
  'Postgres connections',
  () => {
    it('are named after applicationName', async () => {
      const name = `easy-cms-test-${process.pid}`
      const config = defineConfig({
        secret: SECRET,
        db: db({ applicationName: name }),
        collections: [{ slug: 'notes', fields: [{ name: 'text', type: 'text' }] }],
      })
      const cwd = tempProject()
      const cms = await open(config, cwd)
      await cms.find('notes')
      const rows = await rawQuery(
        cwd,
        `select count(*)::int as n from pg_stat_activity where application_name = '${name}'`,
      )
      expect(rows[0]?.n).toBeGreaterThan(0)
      await cms.destroy()
    })
  },
)
