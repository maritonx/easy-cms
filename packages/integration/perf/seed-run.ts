// Prepares the perf database: `node perf/seed-run.ts`, with POSTGRES_URL, PERF_DOCS, PERF_CWD
// (the project folder `easy-cms serve` runs in) and PERF_PASSWORD (the editors' password).
// Migrates as in production (a migration for any change of the schema), then seeds; resumes a
// partial seed.
import { createEasyCMS, silentLogger } from '@easy-cms/core'
import config from './easy-cms.config.ts'
import { seed } from './seed.ts'

const docs = Number(process.env.PERF_DOCS ?? 1_000_000)
const cwd = process.env.PERF_CWD
const password = process.env.PERF_PASSWORD
if (!cwd || !password) throw new Error('Set PERF_CWD and PERF_PASSWORD')

const tool = await createEasyCMS(config, {
  cwd,
  schema: 'skip',
  logger: silentLogger,
  scheduler: false,
})
// A migration for what changed since the seeded data was saved (e.g. indexes), as in production.
await tool.db.createMigration({ name: 'schema' })
await tool.db.migrate()
await tool.destroy()

const cms = await createEasyCMS(config, {
  cwd,
  schema: 'verify',
  logger: silentLogger,
  scheduler: false,
})
await seed(cms, docs, Number(process.env.PERF_SEED_PARALLEL ?? 32))
// The editors: one account they all sign in with, each in a session of their own.
const existing = await cms.find('users', { where: { email: { equals: 'editor@perf.test' } } })
if (existing.docs.length === 0)
  await cms.create('users', { email: 'editor@perf.test', password, role: 'editor' } as never)
await cms.destroy()
