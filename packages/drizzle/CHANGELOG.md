# @easy-cms/drizzle

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
