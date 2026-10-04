# @easy-cms/db-postgres

## 0.25.0

### Patch Changes

- Updated dependencies [434599a]
  - @easy-cms/core@0.25.0
  - @easy-cms/drizzle@0.25.0

## 0.24.0

### Patch Changes

- Updated dependencies [230a347]
  - @easy-cms/core@0.24.0
  - @easy-cms/drizzle@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [0107902]
  - @easy-cms/core@0.23.0
  - @easy-cms/drizzle@0.23.0

## 0.22.2

### Patch Changes

- @easy-cms/core@0.22.2
  - @easy-cms/drizzle@0.22.2

## 0.22.1

### Patch Changes

- d742afc: Package READMEs: what each package does, how to install it with npm, pnpm, Yarn or Bun, a short example and links to its guide.
- Updated dependencies [d742afc]
  - @easy-cms/core@0.22.1
  - @easy-cms/drizzle@0.22.1

## 0.22.0

### Patch Changes

- Updated dependencies [63995c6]
  - @easy-cms/core@0.22.0
  - @easy-cms/drizzle@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies [0e69436]
  - @easy-cms/core@0.21.0
  - @easy-cms/drizzle@0.21.0

## 0.20.1

### Patch Changes

- @easy-cms/core@0.20.1
  - @easy-cms/drizzle@0.20.1

## 0.20.0

### Patch Changes

- Updated dependencies [b7564cb]
  - @easy-cms/core@0.20.0
  - @easy-cms/drizzle@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [34d5e66]
  - @easy-cms/core@0.19.0
  - @easy-cms/drizzle@0.19.0

## 0.18.0

### Patch Changes

- @easy-cms/core@0.18.0
  - @easy-cms/drizzle@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [0507a14]
  - @easy-cms/core@0.17.0
  - @easy-cms/drizzle@0.17.0

## 0.16.1

### Patch Changes

- Updated dependencies [8b14b83]
  - @easy-cms/core@0.16.1
  - @easy-cms/drizzle@0.16.1

## 0.16.0

### Patch Changes

- @easy-cms/core@0.16.0
  - @easy-cms/drizzle@0.16.0

## 0.15.0

### Patch Changes

- Updated dependencies [fdb3985]
  - @easy-cms/core@0.15.0
  - @easy-cms/drizzle@0.15.0

## 0.14.0

### Minor Changes

- 6c7eb74: `easy-cms copy --from <config>` copies every document, version, user and global from one database into another, for example from SQLite to Postgres (or back). Ids stay the same, so relationships, history and logins keep working. Both configs must have the same collections and fields, and the target must be empty. Also available as `copyDatabase(source.db, target.db)` from `@easy-cms/core`.

### Patch Changes

- Updated dependencies [6c7eb74]
  - @easy-cms/core@0.14.0
  - @easy-cms/drizzle@0.14.0

## 0.13.1

### Patch Changes

- @easy-cms/core@0.13.1
  - @easy-cms/drizzle@0.13.1

## 0.13.0

### Patch Changes

- Updated dependencies [bf9fa90]
  - @easy-cms/core@0.13.0
  - @easy-cms/drizzle@0.13.0

## 0.12.0

### Patch Changes

- Updated dependencies [070d710]
- Updated dependencies [070d710]
  - @easy-cms/core@0.12.0
  - @easy-cms/drizzle@0.12.0

## 0.11.0

### Patch Changes

- Updated dependencies [a035bce]
- Updated dependencies [2a5a18d]
  - @easy-cms/core@0.11.0
  - @easy-cms/drizzle@0.11.0

## 0.10.0

### Minor Changes

- cab02f9: Faster reads on large collections: collections with drafts get an index on `status` (list counts were scanning the whole table; 8× faster at 100,000 documents), and on Postgres, `equals`/`in` inside blocks use JSON containment (about 6× faster). The index changes the schema: run `easy-cms migrate:create` after upgrading.

### Patch Changes

- Updated dependencies [cab02f9]
- Updated dependencies [cab02f9]
  - @easy-cms/core@0.10.0
  - @easy-cms/drizzle@0.10.0

## 0.9.1

### Patch Changes

- Updated dependencies [93202ca]
  - @easy-cms/drizzle@0.9.1
  - @easy-cms/core@0.9.1

## 0.9.0

### Minor Changes

- ce7f66d: `sort` works on fields in lists inside blocks (`layout.items.title`), using the first value found in block and row order.

### Patch Changes

- Updated dependencies [ce7f66d]
- Updated dependencies [ce7f66d]
  - @easy-cms/drizzle@0.9.0
  - @easy-cms/core@0.9.0

## 0.8.0

### Minor Changes

- e032e1c: `where` reaches into lists inside blocks (`layout.items.title`, `layout.tags`, `layout.content.blockType`), and `sort` works on block fields (`-layout.columns`, using the first block that has the field).

### Patch Changes

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
