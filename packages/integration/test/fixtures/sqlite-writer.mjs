// A separate process writing to a SQLite file: node sqlite-writer.mjs <cwd> <name> <startAt>
import { createEasyCMS, silentLogger } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'

const [cwd, name, startAt] = process.argv.slice(2)
const cms = await createEasyCMS(
  {
    secret: 'x'.repeat(32),
    db: sqlite({ url: 'file:./cms.db', tablePrefix: 'ecms_' }),
    collections: [
      {
        slug: 'notes',
        fields: [
          { name: 'text', type: 'text' },
          { name: 'tags', type: 'select', options: ['a', 'b'], hasMany: true },
        ],
      },
    ],
  },
  { cwd, logger: silentLogger, scheduler: false },
)
// Every process starts writing at the same moment.
await new Promise((resolve) => setTimeout(resolve, Number(startAt) - Date.now()))
await Promise.all(
  Array.from({ length: 40 }, (_, i) =>
    cms.create('notes', { text: `${name}${i}`, tags: ['a', 'b'] }),
  ),
)
await cms.destroy()
