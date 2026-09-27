import type { SQL } from 'drizzle-orm'

// Drizzle's table, column and database types differ per dialect. The shared layer works with
// them structurally; each adapter supplies the dialect-specific pieces below.
// biome-ignore lint/suspicious/noExplicitAny: see above
export type AnyTable = any
// biome-ignore lint/suspicious/noExplicitAny: see above
export type AnyColumn = any
// biome-ignore lint/suspicious/noExplicitAny: see above
export type ColumnBuilder = any
// biome-ignore lint/suspicious/noExplicitAny: see above
export type IndexBuilder = any
/** A Drizzle database or transaction (libSQL, postgres.js, PGlite…). */
// biome-ignore lint/suspicious/noExplicitAny: see above
export type DrizzleDb = any

/** drizzle-kit's snapshot JSON for one dialect. */
// biome-ignore lint/suspicious/noExplicitAny: drizzle-kit does not export a stable snapshot type
export type Snapshot = Record<string, any>

export interface Statement {
  readonly sql: string
  readonly params?: readonly unknown[]
}

/** Raw SQL access for the migrations table and migration files. */
export interface SqlRunner {
  query(sql: string, params?: readonly unknown[]): Promise<Record<string, unknown>[]>
  /** Runs the statements in one transaction: all or nothing. */
  transaction(statements: readonly Statement[]): Promise<void>
}

/** How to read a value out of a JSON element for comparing. */
export type JsonValueType = 'text' | 'number' | 'integer' | 'boolean'

/** The JSON element being tested. Paths are field names, already checked against the config. */
export interface JsonElement {
  /** A value inside the element, e.g. `['heading', 'en']`; `[]` for the element itself. */
  get(path: readonly string[], type: JsonValueType): SQL
  /** A JSON array inside the element, to test with `someElement`. */
  list(path: readonly string[]): SQL
}

/** What differs between SQL dialects. */
export interface Dialect {
  readonly name: 'sqlite' | 'postgres'
  /**
   * One writer at a time (SQLite): writes from this process wait for each other instead of
   * failing with "database is locked".
   */
  readonly singleWriter?: boolean

  table(
    name: string,
    columns: Record<string, ColumnBuilder>,
    indexes: (t: Record<string, AnyColumn>) => IndexBuilder[],
  ): AnyTable
  index(name: string): { on(column: AnyColumn): IndexBuilder }
  uniqueIndex(name: string): { on(column: AnyColumn): IndexBuilder }

  /** Auto-incrementing integer primary key. */
  serial(name: string): ColumnBuilder
  text(name: string): ColumnBuilder
  integer(name: string): ColumnBuilder
  /** Floating point. */
  number(name: string): ColumnBuilder
  boolean(name: string): ColumnBuilder
  json(name: string): ColumnBuilder

  /** Case-insensitive substring match; `pattern` is already escaped and wrapped in `%`. */
  like(column: AnyColumn, pattern: string): SQL
  /**
   * True when some element of a JSON array (a column, or `JsonElement.list`) matches `condition`
   * (any element when it returns undefined). Anything but an array has no elements.
   */
  someElement(array: AnyColumn | SQL, condition: (el: JsonElement) => SQL | undefined): SQL
  /**
   * For sorting: the value at `path` in the first element that has one, stepping through the
   * nested `lists` in each element (in order) like `someElement`.
   */
  firstElementValue(
    array: AnyColumn | SQL,
    lists: readonly (readonly string[])[],
    path: readonly string[],
    type: JsonValueType,
  ): SQL
  /** Placeholder for the n-th parameter (1-based) in raw SQL. */
  param(n: number): string
  /** CREATE TABLE IF NOT EXISTS for the migrations table. */
  migrationsTableSQL(name: string): string

  /** drizzle-kit snapshot of the given tables. Loaded lazily (only dev and the CLI need it). */
  snapshot(tables: Readonly<Record<string, AnyTable>>): Promise<Snapshot>
  /** SQL statements turning one snapshot into another. May prompt about renames when interactive. */
  migration(prev: Snapshot, cur: Snapshot): Promise<string[]>
}
