/**
 * What SQLite adapters share (`@easy-cms/drizzle/sqlite`): the dialect, and a `Connection` over a
 * libSQL-shaped client. No Node module: db-memory runs it in browsers (ADR-0074).
 */
import { sql } from 'drizzle-orm'
import * as libsqlDriver from 'drizzle-orm/libsql/driver-core'
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { Connection } from './database.js'
import type { Dialect, DrizzleDb, Snapshot, Statement } from './dialect.js'

/** The two functions of `drizzle-kit/api` the dialect uses. */
export interface SqliteKit {
  generateSQLiteDrizzleJson(tables: Record<string, unknown>): Promise<unknown>
  generateSQLiteMigration(prev: never, cur: never): Promise<string[]>
}

/**
 * drizzle's libSQL database over any client. `drizzle-orm/libsql` would also import
 * `@libsql/client` (to make a client from a URL); `driver-core` exports this without types.
 * drizzle-orm is pinned, and both adapters' tests run through it.
 */
const construct = (libsqlDriver as unknown as { construct(client: unknown): DrizzleDb }).construct

type Value = string | number | bigint | boolean | null | Uint8Array | ArrayBuffer | Date
type Rows = Record<string, unknown>[]

export interface LibsqlStatement {
  sql: string
  args?: Value[] | Record<string, Value>
}

/** The part of `@libsql/client`'s `Client` that drizzle and the runner use. */
export interface LibsqlClient {
  execute(statement: LibsqlStatement | string): Promise<{ rows: unknown[] }>
  batch(statements: LibsqlStatement[], mode?: 'write' | 'read' | 'deferred'): Promise<unknown[]>
  transaction(mode?: 'write' | 'read' | 'deferred'): Promise<LibsqlTransaction>
  close(): void
}

export interface LibsqlTransaction {
  execute(statement: LibsqlStatement): Promise<{ rows: unknown[] }>
  commit(): Promise<void>
  rollback(): Promise<void>
  close(): void
}

// JSON helpers for queries inside blocks. Paths are field names and locales checked against the
// config; each subquery gets its own alias so nested ones can refer to the outer row.
let aliases = 0
const alias = () => sql.raw(`_el${++aliases % 1_000_000}`)
const jsonPath = (path: readonly string[]) => `$${path.map((p) => `."${p}"`).join('')}`
const onlyArray = (array: unknown) => sql`case when json_type(${array}) = 'array' then ${array} end`

/**
 * SQLite's dialect. `kit` loads drizzle-kit's API for snapshots and migrations: db-sqlite loads
 * `drizzle-kit/api`; db-memory a copy built for browsers (ADR-0074).
 */
export function sqliteDialect(kit: () => Promise<SqliteKit>): Dialect {
  return {
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
    snapshot: async (tables) =>
      (await (await kit()).generateSQLiteDrizzleJson({ ...tables })) as Snapshot,
    migration: async (prev, cur) =>
      (await kit()).generateSQLiteMigration(prev as never, cur as never),
  }
}

/**
 * A `Connection` over a libSQL client: drizzle's libSQL driver, a batch for each transaction of
 * statements, an interactive transaction when there is code among the steps.
 */
export function libsqlConnection(client: LibsqlClient, writeQueue: string): Connection {
  const toStatement = (s: Statement): LibsqlStatement => ({
    sql: s.sql,
    args: [...(s.params ?? [])] as Value[],
  })
  return {
    db: construct(client),
    writeQueue,
    runner: {
      async query(text, params = []) {
        const result = await client.execute({ sql: text, args: [...params] as Value[] })
        return result.rows as Rows
      },
      async transaction(steps) {
        const statements = steps.filter((s): s is Statement => typeof s !== 'function')
        // A libSQL batch runs in one transaction.
        if (statements.length === steps.length) {
          await client.batch(statements.map(toStatement), 'write')
          return
        }
        // Code among the steps (a data migration): an interactive transaction.
        const tx = await client.transaction('write')
        try {
          const run = async (text: string, params: readonly unknown[] = []) =>
            (await tx.execute(toStatement({ sql: text, params }))).rows as Rows
          for (const step of steps) {
            if (typeof step === 'function') await step(run)
            else await run(step.sql, step.params)
          }
          await tx.commit()
        } catch (error) {
          await tx.rollback().catch(() => {})
          throw error
        } finally {
          tx.close()
        }
      },
    },
    close: async () => client.close(),
  }
}
