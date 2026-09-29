# @easy-cms/drizzle

## 0.20.0

### Patch Changes

- Updated dependencies [b7564cb]
  - @easy-cms/core@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [34d5e66]
  - @easy-cms/core@0.19.0

## 0.18.0

### Patch Changes

- @easy-cms/core@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [0507a14]
  - @easy-cms/core@0.17.0

## 0.16.1

### Patch Changes

- Updated dependencies [8b14b83]
  - @easy-cms/core@0.16.1

## 0.16.0

### Patch Changes

- @easy-cms/core@0.16.0

## 0.15.0

### Patch Changes

- Updated dependencies [fdb3985]
  - @easy-cms/core@0.15.0

## 0.14.0

### Minor Changes

- 6c7eb74: `easy-cms copy --from <config>` copies every document, version, user and global from one database into another, for example from SQLite to Postgres (or back). Ids stay the same, so relationships, history and logins keep working. Both configs must have the same collections and fields, and the target must be empty. Also available as `copyDatabase(source.db, target.db)` from `@easy-cms/core`.

### Patch Changes

- Updated dependencies [6c7eb74]
  - @easy-cms/core@0.14.0

## 0.13.1

### Patch Changes

- @easy-cms/core@0.13.1

## 0.13.0

### Patch Changes

- Updated dependencies [bf9fa90]
  - @easy-cms/core@0.13.0

## 0.12.0

### Patch Changes

- Updated dependencies [070d710]
- Updated dependencies [070d710]
  - @easy-cms/core@0.12.0

## 0.11.0

### Patch Changes

- Updated dependencies [a035bce]
- Updated dependencies [2a5a18d]
  - @easy-cms/core@0.11.0

## 0.10.0

### Minor Changes

- cab02f9: `easy-cms backup <file>` copies a SQLite database to a new file while the CMS keeps running (a consistent snapshot through `VACUUM INTO`). Databases expose it as the optional `db.backup(file)`; for Postgres, use `pg_dump`.
- cab02f9: Faster reads on large collections: collections with drafts get an index on `status` (list counts were scanning the whole table; 8× faster at 100,000 documents), and on Postgres, `equals`/`in` inside blocks use JSON containment (about 6× faster). The index changes the schema: run `easy-cms migrate:create` after upgrading.

### Patch Changes

- Updated dependencies [cab02f9]
  - @easy-cms/core@0.10.0

## 0.9.1

### Patch Changes

- 93202ca: SQLite: writes from separate processes to the same file now wait for each other reliably (libSQL busy timeout, `busyTimeout` option, default 10 s) instead of sometimes failing with "database is locked"; instances in one process share a write queue per file.
- @easy-cms/core@0.9.1

## 0.9.0

### Minor Changes

- ce7f66d: `sort` works on fields in lists inside blocks (`layout.items.title`), using the first value found in block and row order.
- ce7f66d: SQLite: a write waits (up to 10 s) for another process writing to the same file, instead of failing with "database is locked".

### Patch Changes

- @easy-cms/core@0.9.0

## 0.8.0

### Minor Changes

- e032e1c: `where` reaches into lists inside blocks (`layout.items.title`, `layout.tags`, `layout.content.blockType`), and `sort` works on block fields (`-layout.columns`, using the first block that has the field).

### Patch Changes

- e032e1c: SQLite: writes made at the same time wait for each other instead of failing with "database is locked".
- Updated dependencies [e032e1c]
  - @easy-cms/core@0.8.0

## 0.7.0

### Minor Changes

- da85424: `where` can look inside blocks: `layout.blockType`, `layout.heading`, `layout.heading.en`, fields in groups inside blocks, and `layout: { exists }`.
- da85424: Changing `localization.defaultLocale` keeps every locale's values: migrations (and development push) move them between columns. Snapshots now record the locales; migrations created before this release don't, so create one before the first change.

### Patch Changes

- Updated dependencies [da85424]
- Updated dependencies [da85424]
  - @easy-cms/core@0.7.0

## 0.6.0

### Minor Changes

- a76cf49: Blocks field: `{ type: 'blocks', blocks: [{ slug, fields }] }` holds rows of different kinds (`{ id, blockType, ...fields }`), validated, populated and typed as a union, with an admin editor to add, reorder and remove blocks. Inferred types now treat arrays, blocks, groups and hasMany fields as always present.
- a76cf49: Localized arrays and hasMany fields: one list per locale (child tables get a `_locale` column; existing rows become the default locale's), queryable as `tags.en`. Reads with `locale: 'all'` no longer turn localized relationships into `null`.

### Patch Changes

- Updated dependencies [a76cf49]
- Updated dependencies [a76cf49]
- Updated dependencies [a76cf49]
- Updated dependencies [a76cf49]
  - @easy-cms/core@0.6.0

## 0.5.0

### Minor Changes

- df8b783: Localization: `localization: { locales, defaultLocale }` in the config and `localized: true` on fields store one value per locale (one column per locale; the default locale keeps the existing column, so turning it on keeps data). Reads and writes take `locale` (or `'all'`) and `fallbackLocale`, REST takes `?locale=` and `?fallback-locale=`; queries, sorting, slugs and unique values work per locale. The admin gets a content language switcher.

### Patch Changes

- Updated dependencies [df8b783]
- Updated dependencies [df8b783]
  - @easy-cms/core@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [b6f8aa3]
  - @easy-cms/core@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [8dd12a8]
  - @easy-cms/core@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [d626995]
  - @easy-cms/core@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies [01f3816]
  - @easy-cms/core@0.1.1

## 0.1.0

### Minor Changes

- 312df64: First release of Easy CMS: an embedded, code-first headless CMS for Nuxt and Next.js with an admin UI,
  typed Local API, REST API, SQLite and Postgres adapters, uploads, drafts, hooks and access control.

### Patch Changes

- Updated dependencies [312df64]
  - @easy-cms/core@0.1.0
