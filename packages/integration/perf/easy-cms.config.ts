// What `easy-cms serve` runs in the nightly perf job (.github/workflows/perf.yml): the load-test
// schema on the seeded tables.
import { defineConfig } from '@easy-cms/core'
import { postgres } from '@easy-cms/db-postgres'
import { schema } from './schema.ts'
import { slowdown } from './slowdown.ts'

const docs = Number(process.env.PERF_DOCS ?? 1_000_000)

export default defineConfig({
  secret: process.env.EASY_CMS_SECRET as string,
  db: postgres({
    url: process.env.POSTGRES_URL as string,
    max: Number(process.env.PERF_POOL ?? 10),
    // Saves on connections of their own, so the slow reads in the mix don't hold them up (#257).
    writeConnections: 4,
    tablePrefix: `load${docs}_`,
  }),
  ...schema,
  ...slowdown(),
})
