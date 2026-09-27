# @easy-cms/drizzle

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
