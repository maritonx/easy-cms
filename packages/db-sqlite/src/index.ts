import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DatabaseAdapter } from '@easy-cms/core'
import {
  type Connection,
  connectDatabase,
  type Dialect,
  type DrizzleAdapterOptions,
  type Statement,
} from '@easy-cms/drizzle'
import { createClient, type InArgs } from '@libsql/client'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export { DEFAULT_MIGRATION_DIR, DEFAULT_TABLE_PREFIX } from '@easy-cms/drizzle'

export interface SQLiteAdapterOptions extends DrizzleAdapterOptions {
  /** `file:./cms.db` (relative to the project root) or a `libsql://` URL. */
  readonly url: string
  /** Auth token for Turso / remote libSQL. */
  readonly authToken?: string
  /**
   * Local files: how long (ms) a write waits while another process (a second server, the CLI)
   * is writing to the same file. Default 10000.
   */
  readonly busyTimeout?: number
}

const kit = () => import('drizzle-kit/api')

// JSON helpers for queries inside blocks. Paths are field names and locales checked against the
// config; each subquery gets its own alias so nested ones can refer to the outer row.
let aliases = 0
const alias = () => sql.raw(`_el${++aliases % 1_000_000}`)
const jsonPath = (path: readonly string[]) => `$${path.map((p) => `."${p}"`).join('')}`
const onlyArray = (array: unknown) => sql`case when json_type(${array}) = 'array' then ${array} end`

export const sqliteDialect: Dialect = {
  name: 'sqlite',
  singleWriter: true,
  table: (name, columns, indexes) => sqliteTable(name, columns, indexes),
  index: (name) => index(name),
  uniqueIndex: (name) => uniqueIndex(name),
  serial: (name) => integer(name).primaryKey({ autoIncrement: true }),
  text: (name) => text(name),
  integer: (name) => integer(name),
  number: (name) => real(name),
  boolean: (name) => integer(name, { mode: 'boolean' }),
  json: (name) => text(name, { mode: 'json' }),
  // LIKE is case-insensitive for ASCII in SQLite.
  like: (column, pattern) => sql`${column} LIKE ${pattern} ESCAPE '\\'`,
  someElement: (array, condition) => {
    const el = alias()
    const where = condition({
      get: (path) =>
        path.length === 0 ? sql`${el}.value` : sql`json_extract(${el}.value, ${jsonPath(path)})`,
      list: (path) => sql`json_extract(${el}.value, ${jsonPath(path)})`,
    })
    return sql`exists (select 1 from json_each(${onlyArray(array)}) as ${el}${where ? sql` where ${where}` : sql``})`
  },
  firstElementValue: (array, lists, path) => {
    // Nested lists join to the element before them; rows are ordered by position at each level.
    const els = [alias()]
    const from = [sql`json_each(${onlyArray(array)}) as ${els[0]}`]
    for (const list of lists) {
      const outer = els.at(-1)
      const el = alias()
      els.push(el)
      from.push(
        sql`json_each(${onlyArray(sql`json_extract(${outer}.value, ${jsonPath(list)})`)}) as ${el}`,
      )
    }
    const last = els.at(-1)
    const value =
      path.length === 0 ? sql`${last}.value` : sql`json_extract(${last}.value, ${jsonPath(path)})`
    const order = sql.join(
      els.map((el) => sql`${el}.key`),
      sql`, `,
    )
    return sql`(select ${value} from ${sql.join(from, sql`, `)} where ${value} is not null order by ${order} limit 1)`
  },
  backupSQL: (file) => `VACUUM INTO '${file.replaceAll("'", "''")}'`,
  param: () => '?',
  migrationsTableSQL: (name) =>
    `CREATE TABLE IF NOT EXISTS \`${name}\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`name\` text NOT NULL UNIQUE,
      \`hash\` text,
      \`snapshot\` text,
      \`applied_at\` text NOT NULL
    )`,
  snapshot: async (tables) => (await kit()).generateSQLiteDrizzleJson({ ...tables }),
  migration: async (prev, cur) =>
    (await kit()).generateSQLiteMigration(prev as never, cur as never),
}

/** SQLite / libSQL database adapter. */
export function sqlite(options: SQLiteAdapterOptions): DatabaseAdapter {
  let traceInclude: string[] | undefined
  return {
    name: 'sqlite',
    init: async (args) => {
      const url = resolveUrl(options.url, args.cwd)
      const client = createClient({
        url,
        ...(options.authToken ? { authToken: options.authToken } : {}),
        // SQLite has one writer. Writes in this process share a queue (`writeQueue`); this waits
        // for other processes. Its wait blocks the process, but only for another's short write.
        timeout: options.busyTimeout ?? 10_000,
      })
      if (options.url.startsWith('file:')) await client.execute('PRAGMA journal_mode = WAL')
      const toStatement = (s: Statement) => ({ sql: s.sql, args: [...(s.params ?? [])] as InArgs })
      const connection: Connection = {
        db: drizzle(client),
        writeQueue: url,
        runner: {
          async query(text, params = []) {
            const result = await client.execute({ sql: text, args: [...params] as InArgs })
            return result.rows as unknown as Record<string, unknown>[]
          },
          async transaction(statements) {
            // A libSQL batch runs in one transaction.
            await client.batch(statements.map(toStatement), 'write')
          },
        },
        close: async () => client.close(),
      }
      return connectDatabase(sqliteDialect, connection, args, options)
    },
    bundle: {
      get traceInclude() {
        traceInclude ??= nativeBinaries()
        return traceInclude
      },
    },
  }
}

function resolveUrl(url: string, cwd: string): string {
  if (url === ':memory:' || url === 'file::memory:') {
    throw new Error(
      '@easy-cms/db-sqlite: in-memory databases are not supported; use a file URL such as file:./cms.db',
    )
  }
  if (!url.startsWith('file:')) return url
  const path = url.slice('file:'.length)
  return isAbsolute(path) ? url : `file:${resolve(cwd, path)}`
}

/**
 * libsql loads its prebuilt binary with a computed `require()`, which output
 * tracing cannot follow. Returns the binaries installed for this machine.
 */
export function nativeBinaries(): string[] {
  try {
    const client = fileURLToPath(import.meta.resolve('@libsql/client'))
    const libsqlMain = createRequire(client).resolve('libsql')
    const libsqlPkg = JSON.parse(
      readFileSync(join(dirname(libsqlMain), 'package.json'), 'utf8'),
    ) as {
      optionalDependencies?: Record<string, string>
    }
    const requireFromLibsql = createRequire(libsqlMain)
    const found: string[] = []
    for (const name of Object.keys(libsqlPkg.optionalDependencies ?? {})) {
      try {
        found.push(requireFromLibsql.resolve(name))
      } catch {
        // not installed for this platform
      }
    }
    return found
  } catch {
    return []
  }
}
