import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DatabaseAdapter } from '@easy-cms/core'
import { checkRenamedOptions } from '@easy-cms/core/internal'
import { connectDatabase, type Dialect, type DrizzleAdapterOptions } from '@easy-cms/drizzle'
import { libsqlConnection, sqliteDialect as sqliteDialectWith } from '@easy-cms/drizzle/sqlite'
import { createClient } from '@libsql/client'

export { DEFAULT_MIGRATION_DIR, DEFAULT_TABLE_PREFIX } from '@easy-cms/drizzle'

export interface SQLiteAdapterOptions extends DrizzleAdapterOptions {
  /** `file:./cms.db` (relative to the project root) or a `libsql://` URL. */
  readonly url: string
  /** Auth token for Turso / remote libSQL. */
  readonly authToken?: string
  /**
   * Local files: how long (in ms) a write waits while another process (a second server, the CLI)
   * is writing to the same file. Default 10000.
   */
  readonly busyTimeoutMs?: number
}

/** SQLite's dialect, with drizzle-kit for snapshots and migrations. */
export const sqliteDialect: Dialect = sqliteDialectWith(() => import('drizzle-kit/api'))

/** SQLite / libSQL database adapter. */
export function sqlite(options: SQLiteAdapterOptions): DatabaseAdapter {
  checkRenamedOptions('sqlite', options, { busyTimeout: 'busyTimeoutMs' })
  let traceInclude: string[] | undefined
  return {
    name: 'sqlite',
    apiVersion: 1,
    init: async (args) => {
      const url = resolveUrl(options.url, args.cwd)
      const client = createClient({
        url,
        ...(options.authToken ? { authToken: options.authToken } : {}),
        // SQLite has one writer. Writes in this process share a queue (`writeQueue`); this waits
        // for other processes. Its wait blocks the process, but only for another's short write.
        timeout: options.busyTimeoutMs ?? 10_000,
      })
      if (options.url.startsWith('file:')) await client.execute('PRAGMA journal_mode = WAL')
      const connection = libsqlConnection(client, url)
      // A remote database (Turso) can't write a file here: backups copy it instead (`backupAdapter`).
      const { backupSQL: _local, ...remote } = sqliteDialect
      const dialect: Dialect = options.url.startsWith('file:') ? sqliteDialect : remote
      return connectDatabase(dialect, connection, args, options)
    },
    // Remote databases are backed up into a local SQLite file, table by table.
    ...(options.url.startsWith('file:') ? {} : { backupAdapter: sqlite }),
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
