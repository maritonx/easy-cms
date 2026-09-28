import type { Database } from './database.js'
import { EasyCMSError } from './errors.js'

export interface CopyProgress {
  readonly table: string
  readonly rows: number
}

export interface CopyResult {
  readonly tables: number
  readonly rows: number
}

/** Rows per read and write; small enough for the parameter limits of every database. */
const BATCH = 200

/**
 * Copies every stored row from `source` into `target` (another kind of database is fine, e.g.
 * SQLite to Postgres), keeping ids, so relationships, versions and users stay as they are.
 * Both must come from the same collections and fields, and the target must be empty.
 * Uploaded files are not copied: they stay in the storage they are in.
 */
export async function copyDatabase(
  source: Database,
  target: Database,
  options: { onTable?: (progress: CopyProgress) => void } = {},
): Promise<CopyResult> {
  const from = source.transfer
  const to = target.transfer
  if (!from || !to) throw new EasyCMSError('This database adapter cannot copy databases', 400)
  if (from.schemaHash !== to.schemaHash) {
    throw new EasyCMSError(
      'The two configs describe different collections or fields. Copy between configs with the same collections (import one config into the other and change only `db`).',
      400,
    )
  }
  const tables = from.tables()
  for (const table of tables) {
    if ((await to.count(table)) > 0) {
      throw new EasyCMSError(
        `The target database is not empty ("${table}" has rows). Copy into a new, empty database.`,
        400,
      )
    }
  }
  let total = 0
  for (const table of tables) {
    let copied = 0
    for (;;) {
      const rows = await from.read(table, copied, BATCH)
      if (rows.length === 0) break
      await to.write(table, rows)
      copied += rows.length
      if (rows.length < BATCH) break
    }
    total += copied
    options.onTable?.({ table, rows: copied })
  }
  await to.finish()
  return { tables: tables.length, rows: total }
}
