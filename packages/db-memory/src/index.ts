/**
 * An in-memory SQLite database (sql.js, WebAssembly) for Studio and tests (ADR-0074). The same
 * dialect and SQL as `@easy-cms/db-sqlite`; runs in Node and in browsers.
 */
import type { DatabaseAdapter } from '@easy-cms/core'
import { connectDatabase, type DrizzleAdapterOptions } from '@easy-cms/drizzle'
import {
  type LibsqlClient,
  libsqlConnection,
  type SqliteKit,
  sqliteDialect,
} from '@easy-cms/drizzle/sqlite'
import { type SqlJs, sqlJsClient } from './client.js'

export type { SqlJs, SqlJsDatabase, SqlJsStatement } from './client.js'

export interface MemoryAdapterOptions extends DrizzleAdapterOptions {
  /**
   * Keeps the database under this name until `dropMemoryDatabase(name)`: a CMS started again with
   * the name (say, after its config changed) finds the documents there, with the schema pushed
   * from the new config. Without a name, every start gets a new database, gone when it stops.
   */
  readonly name?: string
  /**
   * Loads sql.js. Default: its build with the WebAssembly inside (about 1 MB of JavaScript, no
   * `.wasm` file to serve). Pass `() => initSqlJs({ locateFile })` to load the `.wasm` yourself.
   */
  readonly sqlJs?: () => Promise<SqlJs>
}

const defaultSqlJs = async () => (await import('sql.js/dist/sql-wasm-inline.js')).default()
// The built kit: `./kit.js` beside this file in dist/ (see tsup.config.ts).
const kit = (): Promise<SqliteKit> => import('./kit.js')

/**
 * A named database: one client, so CMS instances on it share its queue. Closed once dropped and
 * no CMS uses it (sql.js memory isn't garbage-collected).
 */
interface Named {
  readonly client: Promise<LibsqlClient>
  users: number
  dropped: boolean
}
const named = new Map<string, Named>()
let unnamed = 0

async function release(entry: Named) {
  if (entry.dropped && entry.users === 0) (await entry.client).close()
}

/** In-memory SQLite. */
export function memory(options: MemoryAdapterOptions = {}): DatabaseAdapter {
  const open = async () => sqlJsClient(new (await (options.sqlJs ?? defaultSqlJs)()).Database())
  return {
    // "sqlite" in the name: telemetry reports it as SQLite (`db.system.name`).
    name: 'sqlite-memory',
    apiVersion: 1,
    init: async (args) => {
      const { name } = options
      let connection: ReturnType<typeof libsqlConnection>
      if (name === undefined) {
        connection = libsqlConnection(await open(), `memory:${++unnamed}`)
      } else {
        let entry = named.get(name)
        if (!entry) {
          entry = { client: open(), users: 0, dropped: false }
          named.set(name, entry)
        }
        const kept = entry
        kept.users++
        let closed = false
        // Stopping a CMS leaves a named database for the next one.
        connection = {
          ...libsqlConnection(await kept.client, `memory:${name}`),
          close: async () => {
            if (closed) return
            closed = true
            kept.users--
            await release(kept)
          },
        }
      }
      // No disk to back up to (`VACUUM INTO` a file).
      const { backupSQL: _none, ...dialect } = sqliteDialect(kit)
      return connectDatabase(dialect, connection, args, options)
    },
  }
}

/**
 * Forgets a named database (`memory({ name })`): the next CMS with the name starts empty. CMS
 * instances still using it keep working; it is freed when the last one stops.
 */
export async function dropMemoryDatabase(name: string): Promise<void> {
  const entry = named.get(name)
  if (!entry) return
  named.delete(name)
  entry.dropped = true
  await release(entry)
}
