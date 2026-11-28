# @easy-cms/db-memory

## 1.57.1

### Patch Changes

- @easy-cms/core@1.57.1
  - @easy-cms/drizzle@1.57.1

## 1.57.0

### Minor Changes

- 3835f2f: New `@easy-cms/db-memory`: SQLite in memory (sql.js, WebAssembly), for Studio (ADR-0074) and tests. The same tables and SQL as `@easy-cms/db-sqlite`, in Node and in browsers (with the `easy-cms-browser` condition). `memory({ name })` keeps a database while the process runs: a CMS started again with the name, after its config changed, finds its documents and pushes the new schema onto them.
  
  `@easy-cms/drizzle/sqlite` holds what the two SQLite adapters share: the dialect and a connection over a libSQL-shaped client. `@easy-cms/db-sqlite` uses it; nothing changes for its users.

### Patch Changes

- Updated dependencies [0d6260d]
- Updated dependencies [3835f2f]
  - @easy-cms/core@1.57.0
  - @easy-cms/drizzle@1.57.0
