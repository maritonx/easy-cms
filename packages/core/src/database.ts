import type { ID, Where } from './access.js'
import type { ResolvedConfig } from './config.js'
import type { Logger } from './logger.js'

/** A document as stored: relationships and uploads are ids, never populated. */
export type RawDocument = Record<string, unknown> & { id: ID }

export interface PaginatedDocs<T> {
  docs: T[]
  totalDocs: number
  limit: number
  page: number
  totalPages: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

/**
 * A page read with a `cursor`: the documents after the cursor, and `nextCursor` for the page after
 * them (`null` at the end). No page numbers or totals.
 */
export interface CursorDocs<T> {
  docs: T[]
  limit: number
  nextCursor: string | null
  hasNextPage: boolean
  /** Whether the cursor started after the first document. */
  hasPrevPage: boolean
  totalDocs: null
  totalPages: null
  page: null
}

/** A page read with `count: false`: no totals, which saves counting every matching document. */
export interface UncountedDocs<T> extends Omit<PaginatedDocs<T>, 'totalDocs' | 'totalPages'> {
  totalDocs: null
  totalPages: null
}

/**
 * How the adapter treats the database schema on startup.
 * - `push`: apply schema changes directly (development).
 * - `verify`: fail if migrations are pending or the config changed without a migration (production).
 * - `skip`: do nothing (used by the migration CLI).
 */
export type SchemaMode = 'push' | 'verify' | 'skip'

export interface DatabaseInitArgs {
  readonly config: ResolvedConfig
  /** Project root; relative paths (database file, migrations) resolve from here. */
  readonly cwd: string
  readonly schema: SchemaMode
  readonly logger: Logger
  /** Whether the process can prompt the user (the CLI in a terminal). */
  readonly interactive?: boolean
}

export interface FindArgs {
  readonly collection: string
  readonly where?: Where | undefined
  /** Field paths; prefix with `-` for descending. */
  readonly sort: readonly string[]
  /** `0` returns every matching document. */
  readonly limit: number
  readonly page: number
}

/** `Database.findAfter`: a find with no page, from after a row's keys. */
export interface FindAfterArgs extends Omit<FindArgs, 'page'> {
  /** The keys `findAfter` returned for the last row of the page before; `null` for the first page. */
  readonly after: readonly unknown[] | null
}

export interface KeysetPage {
  docs: RawDocument[]
  hasNextPage: boolean
  /** The keys of the last row (its sort values, then its id), to continue after; `null` when empty. */
  next: unknown[] | null
}

export interface MigrationInfo {
  readonly name: string
  readonly applied: boolean
}

export interface CreateMigrationResult {
  readonly name: string
  readonly file: string
  readonly statements: readonly string[]
}

/**
 * A row written with a document, in the same transaction (`outbox: true` in the config): a write
 * that commits leaves it, one that doesn't leaves nothing. Not written when an `update` with
 * `where` doesn't match.
 */
export interface OutboxRow {
  /** The collection the row goes to. */
  readonly collection: string
  /** The row's fields, given the written document's id (`null` for a global). */
  data(id: ID | null): Record<string, unknown>
}

/** A connected database bound to one config. Returned by `DatabaseAdapter.init`. */
export interface Database {
  find(args: FindArgs): Promise<PaginatedDocs<RawDocument>>
  /**
   * A page without counting the matching documents (`find` with `count: false`): `hasNextPage`
   * from one row more. Optional: without it, `find` runs and its totals are dropped.
   */
  findPage?(args: FindArgs): Promise<UncountedDocs<RawDocument>>
  /**
   * Keyset pagination, for `find` with a `cursor`: the rows after `after` in the sort's order (with
   * `id` last). Optional: without it, cursors are refused.
   */
  findAfter?(args: FindAfterArgs): Promise<KeysetPage>
  findById(args: { collection: string; id: ID }): Promise<RawDocument | null>
  /** Documents of one collection by id, in any order. Used to populate relationships. */
  findByIds(args: { collection: string; ids: readonly ID[] }): Promise<RawDocument[]>
  count(args: { collection: string; where?: Where | undefined }): Promise<number>
  /** `data` holds every field, `createdAt` and `updatedAt`. Runs in one transaction. */
  create(args: {
    collection: string
    data: Record<string, unknown>
    outbox?: OutboxRow | undefined
  }): Promise<RawDocument>
  /**
   * `data` holds the whole document after merging. Runs in one transaction. With `where`, only
   * when the stored document matches it at the moment of writing (compare and set): `null` when
   * it doesn't, and nothing is written.
   */
  update(args: {
    collection: string
    id: ID
    data: Record<string, unknown>
    outbox?: OutboxRow | undefined
  }): Promise<RawDocument>
  update(args: {
    collection: string
    id: ID
    data: Record<string, unknown>
    where: Where
    outbox?: OutboxRow | undefined
  }): Promise<RawDocument | null>
  /**
   * Adds `by` to a top-level number field in one statement, safe against concurrent calls; an
   * empty value counts as 0. With `min` / `max`, only when the result stays within them. Returns
   * the new value, or `null` when it would leave the bounds or the document is gone.
   */
  increment(args: {
    collection: string
    id: ID
    field: string
    by: number
    min?: number | undefined
    max?: number | undefined
  }): Promise<number | null>
  delete(args: { collection: string; id: ID; outbox?: OutboxRow | undefined }): Promise<void>
  findGlobal(args: { slug: string }): Promise<Record<string, unknown> | null>
  updateGlobal(args: {
    slug: string
    data: Record<string, unknown>
    outbox?: OutboxRow | undefined
  }): Promise<Record<string, unknown>>
  /**
   * True when `create`, `update`, `delete` and `updateGlobal` take `outbox`, a row written in
   * the same transaction. Required by `outbox: true` in the config.
   */
  readonly outbox?: boolean | undefined

  /** Writes a migration file for the difference between the config and the latest migration. `null` when nothing changed. */
  createMigration(args: { name: string }): Promise<CreateMigrationResult | null>
  /** Applies pending migrations in order. Returns the names applied. */
  migrate(): Promise<string[]>
  migrationStatus(): Promise<MigrationInfo[]>
  /**
   * Copies the database to `file` (an absolute path) while it is in use, when the database can
   * do that itself (SQLite). Others (Postgres) leave it out; use their own tools.
   */
  readonly backup?: ((file: string) => Promise<void>) | undefined
  /** Raw table access for copying a whole database to another (`easy-cms copy`). */
  readonly transfer?: DatabaseTransfer | undefined
  /** The prefix of its tables (`tablePrefix`), so a copy (a backup) can use the same. */
  readonly tablePrefix?: string | undefined

  destroy(): Promise<void>
}

/**
 * Reads and writes stored rows as they are, ids and hidden fields included, bypassing validation
 * and hooks. Only for moving a database: `copyDatabase()`.
 */
export interface DatabaseTransfer {
  /**
   * Identifies the tables and columns the config produces, the same for every database kind.
   * Two databases can be copied into each other when their hashes match.
   */
  readonly schemaHash: string
  /** Every table, in an order that is safe to write. */
  tables(): string[]
  count(table: string): Promise<number>
  /** Rows in a stable order (by primary key), `offset` and `limit` for batches. */
  read(table: string, offset: number, limit: number): Promise<Record<string, unknown>[]>
  write(table: string, rows: readonly Record<string, unknown>[]): Promise<void>
  /** After all writes, e.g. moves id sequences past the copied ids so new documents fit. */
  finish(): Promise<void>
}

/** What `sqlite()` / `postgres()` return and what `config.db` holds. */
/** The version of the adapter interfaces (database, storage, email, sign-in providers). */
export const ADAPTER_API_VERSION = 1

export interface DatabaseAdapter {
  readonly name: string
  /**
   * The adapter interface it is written for (`ADAPTER_API_VERSION`); Easy CMS refuses another.
   * Leave it out to skip the check.
   */
  readonly apiVersion?: number
  init(args: DatabaseInitArgs): Promise<Database>
  /** Hints for bundlers (Nitro, Next.js output tracing) about files static analysis cannot find. */
  readonly bundle?: BundleHints
}

export interface BundleHints {
  /** Absolute paths of files to ship with the server build, e.g. native binaries loaded dynamically. */
  readonly traceInclude: readonly string[]
}
