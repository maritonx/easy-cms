# easy-cms

## 0.16.1

### Patch Changes

- Updated dependencies [8b14b83]
  - @easy-cms/core@0.16.1
  - @easy-cms/admin@0.16.1

## 0.16.0

### Patch Changes

- @easy-cms/admin@0.16.0
  - @easy-cms/core@0.16.0

## 0.15.0

### Patch Changes

- Updated dependencies [fdb3985]
  - @easy-cms/core@0.15.0
  - @easy-cms/admin@0.15.0

## 0.14.0

### Minor Changes

- 6c7eb74: `easy-cms copy --from <config>` copies every document, version, user and global from one database into another, for example from SQLite to Postgres (or back). Ids stay the same, so relationships, history and logins keep working. Both configs must have the same collections and fields, and the target must be empty. Also available as `copyDatabase(source.db, target.db)` from `@easy-cms/core`.

### Patch Changes

- Updated dependencies [6c7eb74]
  - @easy-cms/core@0.14.0
  - @easy-cms/admin@0.14.0

## 0.13.1

### Patch Changes

- @easy-cms/admin@0.13.1
  - @easy-cms/core@0.13.1

## 0.13.0

### Patch Changes

- Updated dependencies [bf9fa90]
  - @easy-cms/core@0.13.0
  - @easy-cms/admin@0.13.0

## 0.12.0

### Minor Changes

- 070d710: The admin now follows its design more closely: counts in the menu, a greeting and "View site" on the dashboard (`admin.siteUrl`), breadcrumbs and row menus in lists, and an edit page with a page-wide header, a large title input with the slug beneath it, a split Publish button, a save bar pinned to the bottom, and a side panel for fields with `position: 'sidebar'`. Icons replace the text buttons in the rich-text and blocks editors. The menu lists user accounts under Settings and the media library last; `admin.menu` sets the order of collections.

### Patch Changes

- Updated dependencies [070d710]
- Updated dependencies [070d710]
- Updated dependencies [070d710]
- Updated dependencies [070d710]
  - @easy-cms/admin@0.12.0
  - @easy-cms/core@0.12.0

## 0.11.0

### Minor Changes

- a035bce: A refreshed admin look: new color tokens, the Anuphan typeface (Thai and Latin), Lucide icons, a menu that works on phones, and a light / dark / system theme switch. Brand the admin for a client with `admin.brand` (`name`, `logo`, `color`; shades are derived and text stays readable), and give collections and globals a menu `icon`.

### Patch Changes

- Updated dependencies [a035bce]
- Updated dependencies [2a5a18d]
  - @easy-cms/admin@0.11.0
  - @easy-cms/core@0.11.0

## 0.10.0

### Minor Changes

- cab02f9: `easy-cms backup <file>` copies a SQLite database to a new file while the CMS keeps running (a consistent snapshot through `VACUUM INTO`). Databases expose it as the optional `db.backup(file)`; for Postgres, use `pg_dump`.

### Patch Changes

- Updated dependencies [cab02f9]
  - @easy-cms/core@0.10.0
  - @easy-cms/admin@0.10.0

## 0.9.1

### Patch Changes

- @easy-cms/admin@0.9.1
  - @easy-cms/core@0.9.1

## 0.9.0

### Patch Changes

- @easy-cms/admin@0.9.0
  - @easy-cms/core@0.9.0

## 0.8.0

### Patch Changes

- Updated dependencies [e032e1c]
  - @easy-cms/core@0.8.0
  - @easy-cms/admin@0.8.0

## 0.7.0

### Minor Changes

- da85424: Webhook deliveries that fail are saved in the database (`webhook-deliveries`) and retried for about a day, so a restart or a stopped serverless function no longer loses them. Retries run with scheduled jobs: `cms.runJobs()`, `cms.retryWebhooks()`, `GET <api>/jobs/run` (now also returns `webhooks: { sent, failed }`) and `easy-cms run-scheduled`. Projects with `webhooks` need a new migration.

### Patch Changes

- Updated dependencies [da85424]
- Updated dependencies [da85424]
  - @easy-cms/core@0.7.0
  - @easy-cms/admin@0.7.0

## 0.6.0

### Minor Changes

- a76cf49: Scheduled publishing: `schedule: true` on collections or globals with drafts. `cms.schedule(collection, id, { action, at })`, a Schedule button in the admin, a per-minute runner in long-running servers, `GET <api>/jobs/run` for cron (Bearer `CRON_SECRET`) and `easy-cms run-scheduled`.

### Patch Changes

- Updated dependencies [a76cf49]
- Updated dependencies [a76cf49]
- Updated dependencies [a76cf49]
- Updated dependencies [a76cf49]
  - @easy-cms/core@0.6.0
  - @easy-cms/admin@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [df8b783]
- Updated dependencies [df8b783]
  - @easy-cms/core@0.5.0
  - @easy-cms/admin@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [b6f8aa3]
  - @easy-cms/core@0.4.0
  - @easy-cms/admin@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [8dd12a8]
  - @easy-cms/core@0.3.0
  - @easy-cms/admin@0.3.0

## 0.2.0

### Minor Changes

- d626995: Standalone mode: `easy-cms serve` runs the admin and REST API as their own server (with `--watch` for development and `/healthz`), so Vite, React, Vue or static frontends can use Easy CMS as a backend. `create-easy-cms` sets one up in a new or empty directory, or with `--standalone`. The REST API supports CORS through the new `cors` config option; `createStandaloneHandler` is exported for Bun, Deno or Hono servers.

### Patch Changes

- Updated dependencies [d626995]
  - @easy-cms/core@0.2.0
  - @easy-cms/admin@0.2.0

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
