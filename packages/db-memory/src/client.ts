/**
 * A libSQL-shaped client over one sql.js database, so the SQLite code db-sqlite uses (drizzle's
 * libSQL driver, `libsqlConnection`) runs on it unchanged.
 *
 * One database, one connection: a transaction holds it until it ends, and statements from outside
 * wait for it (Studio sends one request at a time anyway).
 */
import type { LibsqlClient, LibsqlStatement, LibsqlTransaction } from '@easy-cms/drizzle/sqlite'

type SqlValue = string | number | Uint8Array | null

export interface SqlJsStatement {
  bind(values: SqlValue[] | Record<string, SqlValue>): boolean
  step(): boolean
  get(): SqlValue[]
  getColumnNames(): string[]
  free(): boolean
}

export interface SqlJsDatabase {
  prepare(sql: string): SqlJsStatement
  getRowsModified(): number
  close(): void
}

/** What `initSqlJs()` resolves to. */
export interface SqlJs {
  Database: new () => SqlJsDatabase
}

export interface ResultSet {
  columns: string[]
  columnTypes: string[]
  rows: Record<string, unknown>[]
  rowsAffected: number
  lastInsertRowid: bigint | undefined
  toJSON(): unknown
}

const toSql = (value: unknown): SqlValue => {
  if (value === undefined || value === null) return null
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'bigint') return Number(value)
  if (value instanceof Date) return value.toISOString()
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  return value as SqlValue
}

/** A row as libSQL returns one: columns by name (enumerable) and by position (not). */
function row(columns: string[], values: SqlValue[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  columns.forEach((column, i) => {
    Object.defineProperty(result, i, { value: values[i], enumerable: false })
    if (!Object.hasOwn(result, column))
      Object.defineProperty(result, column, { value: values[i], enumerable: true })
  })
  Object.defineProperty(result, 'length', { value: values.length, enumerable: false })
  return result
}

function run(db: SqlJsDatabase, statement: LibsqlStatement | string): ResultSet {
  const { sql, args } = typeof statement === 'string' ? { sql: statement, args: [] } : statement
  const prepared = db.prepare(sql)
  try {
    const values = Array.isArray(args)
      ? args.map(toSql)
      : Object.fromEntries(Object.entries(args ?? {}).map(([k, v]) => [k, toSql(v)]))
    prepared.bind(values)
    const columns = prepared.getColumnNames()
    const rows: Record<string, unknown>[] = []
    while (prepared.step()) rows.push(row(columns, prepared.get()))
    const rowsAffected = db.getRowsModified()
    const last = /^\s*(insert|replace)\b/i.test(sql) ? lastRowid(db) : undefined
    return {
      columns,
      columnTypes: columns.map(() => ''),
      rows,
      rowsAffected,
      lastInsertRowid: last,
      toJSON: () => ({ columns, rows, rowsAffected }),
    }
  } finally {
    prepared.free()
  }
}

function lastRowid(db: SqlJsDatabase): bigint | undefined {
  const prepared = db.prepare('SELECT last_insert_rowid()')
  try {
    return prepared.step() ? BigInt(prepared.get()[0] as number) : undefined
  } finally {
    prepared.free()
  }
}

const BEGIN = { write: 'BEGIN IMMEDIATE', read: 'BEGIN', deferred: 'BEGIN DEFERRED' } as const

export function sqlJsClient(db: SqlJsDatabase): LibsqlClient {
  /** The open transaction's end, which statements from outside it wait for. */
  let held: Promise<void> = Promise.resolve()
  let closed = false
  const check = () => {
    if (closed) throw new Error('@easy-cms/db-memory: the database is closed')
  }
  /** Runs `fn` once no transaction holds the connection. */
  const outside = async <T>(fn: () => T): Promise<T> => {
    for (let current = held; ; current = held) {
      await current
      if (current === held) break
    }
    check()
    return fn()
  }

  const batch = (statements: (LibsqlStatement | string)[], mode: keyof typeof BEGIN) => {
    run(db, BEGIN[mode])
    try {
      const results = statements.map((s) => run(db, s))
      run(db, 'COMMIT')
      return results
    } catch (error) {
      run(db, 'ROLLBACK')
      throw error
    }
  }

  return {
    execute: (statement) => outside(() => run(db, statement)),
    batch: (statements, mode = 'deferred') => outside(() => batch(statements, mode)),
    async transaction(mode = 'write') {
      let release!: () => void
      // Held in the same step as BEGIN, before anything else waiting gets to run.
      await outside(() => {
        run(db, BEGIN[mode])
        held = new Promise((resolve) => {
          release = resolve
        })
      })
      let open = true
      const end = (sql: string) => {
        if (!open) return
        open = false
        try {
          run(db, sql)
        } finally {
          release()
        }
      }
      const tx: LibsqlTransaction = {
        async execute(statement) {
          if (!open) throw new Error('@easy-cms/db-memory: the transaction is closed')
          return run(db, statement)
        },
        async commit() {
          end('COMMIT')
        },
        async rollback() {
          end('ROLLBACK')
        },
        close() {
          end('ROLLBACK')
        },
      }
      return tx
    },
    close() {
      if (closed) return
      closed = true
      db.close()
    },
  }
}
