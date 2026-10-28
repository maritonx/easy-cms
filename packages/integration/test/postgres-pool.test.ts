import { defineConfig } from '@easy-cms/core'
import postgresJs from 'postgres'
import { describe, expect, it } from 'vitest'
import { DIALECT, db, open, rawQuery, SECRET, table, tempProject } from './helpers.js'

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

    // A read waiting for a lock holds the only read connection, as a slow query would.
    const blockedRead = async (writeConnections: number | undefined) => {
      const config = defineConfig({
        secret: SECRET,
        db: db({ max: 1, ...(writeConnections ? { writeConnections } : {}) }),
        collections: [
          { slug: 'notes', fields: [{ name: 'text', type: 'text' }] },
          { slug: 'posts', fields: [{ name: 'title', type: 'text' }] },
        ],
      })
      const cwd = tempProject()
      const cms = await open(config, cwd)
      const locker = postgresJs(process.env.POSTGRES_URL as string, { max: 1, onnotice: () => {} })
      let release = () => {}
      const released = new Promise<void>((resolve) => {
        release = resolve
      })
      let locked = () => {}
      const lockTaken = new Promise<void>((resolve) => {
        locked = resolve
      })
      const lock = locker.begin(async (sql) => {
        await sql.unsafe(`lock table "${table(cwd, 'notes')}" in access exclusive mode`)
        locked()
        await released
      })
      await lockTaken
      const read = cms.find('notes')
      await new Promise((resolve) => setTimeout(resolve, 100))
      const save = cms.create('posts', { title: 'quick' })
      const first = await Promise.race([
        save.then(() => 'save'),
        new Promise((resolve) => setTimeout(() => resolve('timeout'), 1000)),
      ])
      release()
      await Promise.all([lock, read, save])
      await locker.end()
      await cms.destroy()
      return first
    }

    it('keep some for writes with writeConnections, so saves pass a blocked read (#257)', async () => {
      expect(await blockedRead(1)).toBe('save')
      // Without them, the save waits for the read's connection.
      expect(await blockedRead(undefined)).toBe('timeout')
    })
  },
)
