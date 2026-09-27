# @easy-cms/db-sqlite

## 0.9.1

### Patch Changes

- 93202ca: SQLite: writes from separate processes to the same file now wait for each other reliably (libSQL busy timeout, `busyTimeout` option, default 10 s) instead of sometimes failing with "database is locked"; instances in one process share a write queue per file.
- Updated dependencies [93202ca]
  - @easy-cms/drizzle@0.9.1
  - @easy-cms/core@0.9.1

## 0.9.0

### Minor Changes

- ce7f66d: `sort` works on fields in lists inside blocks (`layout.items.title`), using the first value found in block and row order.
- ce7f66d: SQLite: a write waits (up to 10 s) for another process writing to the same file, instead of failing with "database is locked".

### Patch Changes

- Updated dependencies [ce7f66d]
- Updated dependencies [ce7f66d]
  - @easy-cms/drizzle@0.9.0
  - @easy-cms/core@0.9.0

## 0.8.0

### Minor Changes

- e032e1c: `where` reaches into lists inside blocks (`layout.items.title`, `layout.tags`, `layout.content.blockType`), and `sort` works on block fields (`-layout.columns`, using the first block that has the field).

### Patch Changes

- e032e1c: SQLite: writes made at the same time wait for each other instead of failing with "database is locked".
- Updated dependencies [e032e1c]
- Updated dependencies [e032e1c]
- Updated dependencies [e032e1c]
  - @easy-cms/drizzle@0.8.0
  - @easy-cms/core@0.8.0

## 0.7.0

### Minor Changes

- da85424: `where` can look inside blocks: `layout.blockType`, `layout.heading`, `layout.heading.en`, fields in groups inside blocks, and `layout: { exists }`.

### Patch Changes

- Updated dependencies [da85424]
- Updated dependencies [da85424]
- Updated dependencies [da85424]
  - @easy-cms/core@0.7.0
  - @easy-cms/drizzle@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [a76cf49]
- Updated dependencies [a76cf49]
- Updated dependencies [a76cf49]
- Updated dependencies [a76cf49]
  - @easy-cms/core@0.6.0
  - @easy-cms/drizzle@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [df8b783]
- Updated dependencies [df8b783]
  - @easy-cms/core@0.5.0
  - @easy-cms/drizzle@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [b6f8aa3]
  - @easy-cms/core@0.4.0
  - @easy-cms/drizzle@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [8dd12a8]
  - @easy-cms/core@0.3.0
  - @easy-cms/drizzle@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [d626995]
  - @easy-cms/core@0.2.0
  - @easy-cms/drizzle@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies [01f3816]
  - @easy-cms/core@0.1.1
  - @easy-cms/drizzle@0.1.1

## 0.1.0

### Minor Changes

- 312df64: First release of Easy CMS: an embedded, code-first headless CMS for Nuxt and Next.js with an admin UI,
  typed Local API, REST API, SQLite and Postgres adapters, uploads, drafts, hooks and access control.

### Patch Changes

- Updated dependencies [312df64]
  - @easy-cms/core@0.1.0
  - @easy-cms/drizzle@0.1.0
