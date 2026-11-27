/** The part of sql.js this package uses (sql.js ships no types). */
declare module 'sql.js/dist/sql-wasm-inline.js' {
  import type { SqlJs } from './client.js'

  const initSqlJs: () => Promise<SqlJs>
  export default initSqlJs
}
