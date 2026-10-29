import { isAbsolute, resolve } from 'node:path'
import type { DatabaseAdapter } from '@easy-cms/core'
import {
  type Connection,
  connectDatabase,
  type Dialect,
  type DrizzleAdapterOptions,
  type JsonValueType,
  type SqlRunner,
} from '@easy-cms/drizzle'
import type { PGlite } from '@electric-sql/pglite'
import { type SQL, sql } from 'drizzle-orm'
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { drizzle as drizzlePostgresJs } from 'drizzle-orm/postgres-js'
import postgresJs from 'postgres'

export { DEFAULT_MIGRATION_DIR, DEFAULT_TABLE_PREFIX } from '@easy-cms/drizzle'

export interface PostgresAdapterOptions extends DrizzleAdapterOptions {
  /** Connection string, e.g. `postgres://user:pass@host:5432/db`. Uses postgres.js. */
  readonly url?: string
  /** Maximum connections in the pool. Default 10. */
  readonly max?: number
  /**
   * Connections kept for creates, updates and deletes (with every read they make), on top of
   * `max`. Default 0: writes share the pool. With slow reads filling the pool, saves wait for
   * them; a few connections of their own keep saves quick. Not with PGlite, which has one.
   */
  readonly writeConnections?: number
  /**
   * Use prepared statements. Default true. Turn off behind a pooler in transaction mode that
   * can't keep them (PgBouncer before 1.24, or with `max_prepared_statements = 0`, and some
   * hosted poolers): it would run the next query on a server connection without the statement.
   */
  readonly prepare?: boolean
  /**
   * Plans each query for its own values (`plan_cache_mode = force_custom_plan`, sent when a
   * connection opens). Default true, unless `prepare` is false (or `?prepare=false`), which plans that way already.
   * Postgres otherwise switches a prepared statement to one plan for any value after a few
   * runs, and for a filter that plan may read every matching row to sort them (at 1M posts,
   * seconds instead of milliseconds). PgBouncer refuses the parameter: set it on the role there
   * (`ALTER ROLE … SET plan_cache_mode = force_custom_plan`) and this to false.
   */
  readonly customPlans?: boolean
  /**
   * Cancels a statement running longer than this (ms), sent as `statement_timeout` when a
   * connection opens. No default: migrations and backups may take a while. PgBouncer refuses
   * the parameter; set it on the role there (`ALTER ROLE … SET statement_timeout = …`).
   */
  readonly statementTimeoutMs?: number
  /** Closes a connection left idle this long (ms). Default: never. */
  readonly idleTimeoutMs?: number
  /** Gives up opening a connection after this long (ms). Default 30000. */
  readonly connectTimeoutMs?: number
  /**
   * `application_name` of the connections, shown in `pg_stat_activity`. Default `PGAPPNAME`,
   * then `'easy-cms'`.
   */
  readonly applicationName?: string
  /**
   * Use PGlite (Postgres in WebAssembly) instead of a server: a data directory
   * (relative to the project root), `memory://`, or a PGlite instance you manage (load
   * `pg_trgm` in it for `index: 'trigram'`).
   * Handy for local development and tests. Requires `@electric-sql/pglite`.
   */
  readonly pglite?: string | PGlite
}

const kit = () => import('drizzle-kit/api')

// JSON helpers for queries inside blocks. Paths are field names and locales checked against the
// config; each subquery gets its own alias so nested ones can refer to the outer row.
const PG_TYPES = { number: 'double precision', integer: 'integer', boolean: 'boolean' } as const
let aliases = 0
const alias = () => sql.raw(`_el${++aliases % 1_000_000}`)
const jsonPath = (path: readonly string[]) => sql.raw(`'{${path.join(',')}}'`)
const cast = (text: SQL, type: JsonValueType) =>
  type === 'text' ? text : sql`${text}::${sql.raw(PG_TYPES[type])}`
const onlyArray = (array: unknown) =>
  sql`case when jsonb_typeof(${array}) = 'array' then ${array} end`

export const postgresDialect: Dialect = {
  name: 'postgres',
  table: (name, columns, indexes) => pgTable(name, columns, indexes),
  index: (name) => index(name),
  uniqueIndex: (name) => uniqueIndex(name),
  // GIN with pg_trgm: `ILIKE '%…%'` (the `like` operator) uses it, in Thai as in English.
  trigramIndex: (name) => ({
    on: (column) => index(name).using('gin', sql`${column} gin_trgm_ops`),
  }),
  serial: (name) => serial(name).primaryKey(),
  text: (name) => text(name),
  integer: (name) => integer(name),
  number: (name) => doublePrecision(name),
  boolean: (name) => boolean(name),
  json: (name) => jsonb(name),
  like: (column, pattern) => sql`${column} ILIKE ${pattern} ESCAPE '\\'`,
  someElement: (array, condition) => {
    const el = alias()
    const where = condition({
      get: (path, type) => cast(sql`(${el}.value #>> ${jsonPath(path)})`, type),
      list: (path) => sql`(${el}.value #> ${jsonPath(path)})`,
    })
    return sql`exists (select 1 from jsonb_array_elements(${onlyArray(array)}) as ${el}(value)${where ? sql` where ${where}` : sql``})`
  },
  jsonContains: (column, pattern) => sql`${column} @> ${JSON.stringify(pattern)}::jsonb`,
  // The next id is one past the largest copied one (1 for an empty table).
  resetSequenceSQL: (table, column) =>
    `SELECT setval(pg_get_serial_sequence('"${table}"', '${column}'), COALESCE((SELECT MAX("${column}") FROM "${table}"), 0) + 1, false)`,
  firstElementValue: (array, lists, path, type) => {
    // Nested lists join to the element before them (functions in FROM are lateral); rows are
    // ordered by position at each level.
    const els = [alias()]
    const from = [
      sql`jsonb_array_elements(${onlyArray(array)}) with ordinality as ${els[0]}(value, idx)`,
    ]
    for (const list of lists) {
      const outer = els.at(-1)
      const el = alias()
      els.push(el)
      from.push(
        sql`jsonb_array_elements(${onlyArray(sql`(${outer}.value #> ${jsonPath(list)})`)}) with ordinality as ${el}(value, idx)`,
      )
    }
    const text = sql`(${els.at(-1)}.value #>> ${jsonPath(path)})`
    const order = sql.join(
      els.map((el) => sql`${el}.idx`),
      sql`, `,
    )
    return sql`(select ${cast(text, type)} from ${sql.join(from, sql`, `)} where ${text} is not null order by ${order} limit 1)`
  },
  param: (n) => `$${n}`,
  migrationsTableSQL: (name) =>
    `CREATE TABLE IF NOT EXISTS "${name}" (
      "id" serial PRIMARY KEY NOT NULL,
      "name" text NOT NULL UNIQUE,
      "hash" text,
      "snapshot" text,
      "applied_at" text NOT NULL
    )`,
  snapshot: async (tables) => (await kit()).generateDrizzleJson({ ...tables }),
  migration: async (prev, cur) => (await kit()).generateMigration(prev as never, cur as never),
}

/** PostgreSQL database adapter (postgres.js, or PGlite for local use). */
export function postgres(options: PostgresAdapterOptions): DatabaseAdapter {
  if (!options.url && !options.pglite) {
    throw new Error('@easy-cms/db-postgres: pass `url` (a connection string) or `pglite`')
  }
  return {
    name: 'postgres',
    apiVersion: 1,
    init: async (args) => {
      const connection = options.pglite
        ? await pgliteConnection(options.pglite, args.cwd)
        : postgresJsConnection(options.url as string, options)
      return connectDatabase(postgresDialect, connection, args, options)
    },
  }
}

/** Whether postgres.js uses prepared statements: the option, else `?prepare=` in the URL. */
function prepares(url: string, options: PostgresAdapterOptions): boolean {
  if (options.prepare !== undefined) return options.prepare
  try {
    return new URL(url).searchParams.get('prepare') !== 'false'
  } catch {
    return true
  }
}

function postgresJsConnection(url: string, options: PostgresAdapterOptions): Connection {
  // Only what is set: postgres.js lets an option passed here win over the URL (`?prepare=false`)
  // and the PG* environment variables.
  const set = <T>(key: string, value: T | undefined) =>
    value === undefined ? {} : { [key]: value }
  const seconds = (ms: number | undefined) => (ms === undefined ? undefined : ms / 1000)
  const open = (max: number) =>
    postgresJs(url, {
      max,
      ...set('prepare', options.prepare),
      ...set('idle_timeout', seconds(options.idleTimeoutMs)),
      ...set('connect_timeout', seconds(options.connectTimeoutMs)),
      connection: {
        application_name: options.applicationName ?? (process.env.PGAPPNAME || 'easy-cms'),
        ...set('statement_timeout', options.statementTimeoutMs),
        ...((options.customPlans ?? prepares(url, options))
          ? { plan_cache_mode: 'force_custom_plan' }
          : {}),
      },
      // Keep Easy CMS quiet: Postgres NOTICEs (e.g. "relation already exists, skipping") are expected.
      onnotice: () => {},
    })
  const client = open(options.max ?? 10)
  const writer = options.writeConnections ? open(options.writeConnections) : undefined
  const runner: SqlRunner = {
    async query(text, params = []) {
      return [...(await client.unsafe(text, [...params] as never[]))] as Record<string, unknown>[]
    },
    async transaction(statements) {
      await client.begin(async (tx) => {
        for (const s of statements) await tx.unsafe(s.sql, [...(s.params ?? [])] as never[])
      })
    },
  }
  return {
    db: drizzlePostgresJs(client),
    writeDb: writer && drizzlePostgresJs(writer),
    runner,
    close: async () => {
      await Promise.all([client.end({ timeout: 5 }), writer?.end({ timeout: 5 })])
    },
  }
}

async function pgliteConnection(source: string | PGlite, cwd: string): Promise<Connection> {
  const owned = typeof source === 'string'
  let pg: PGlite
  if (typeof source === 'string') {
    const { PGlite } = await import('@electric-sql/pglite')
    // pg_trgm for `index: 'trigram'`, as on a Postgres server.
    const { pg_trgm } = await import('@electric-sql/pglite/contrib/pg_trgm')
    const dataDir = source.includes('://') || isAbsolute(source) ? source : resolve(cwd, source)
    pg = new PGlite(dataDir, { extensions: { pg_trgm } })
  } else {
    pg = source
  }
  await pg.waitReady
  const { drizzle } = await import('drizzle-orm/pglite')
  const runner: SqlRunner = {
    async query(text, params = []) {
      return (await pg.query(text, [...params])).rows as Record<string, unknown>[]
    },
    async transaction(statements) {
      await pg.transaction(async (tx) => {
        for (const s of statements) await tx.query(s.sql, [...(s.params ?? [])])
      })
    },
  }
  // An instance passed in belongs to the caller; only close what we opened.
  return {
    db: drizzle({ client: pg }),
    runner,
    close: async () => (owned ? pg.close() : undefined),
  }
}
