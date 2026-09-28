# @easy-cms/core

## 0.19.0

### Minor Changes

- 34d5e66: New package `@easy-cms/plugin-redirects`: redirects editors manage under **Settings → Redirects** (from a path to an address or a document, as 301, 302, 307 or 308), and automatic redirects when a published page's address changes, in every locale, without chains or loops. `resolveRedirect(cms, url)` serves them from memory in a Nuxt server middleware or a Next.js 16 `proxy.ts`; other frontends call `GET /api/cms/resolve-redirect?path=`. Needs a migration for the new `redirects` collection.
  
  Collections can be listed under Settings in the admin menu with `admin: { group: 'settings' }`, next to Users and API keys.

## 0.18.0

No changes in this release.

## 0.17.0

### Minor Changes

- 0507a14: SEO for the whole site, not just each page.
  
  - **Sitemap:** `sitemap(cms)` (the shape of Next.js `app/sitemap.ts`) and `sitemapXml(cms)` list the pages visitors can see: published documents with an address from `generateURL`, with `lastmod` and hreflang links to every locale. Over 50,000 addresses become a sitemap index.
  - **robots.txt:** `robotsTxt({ config })` keeps crawlers out of the admin and the API (not uploaded files) and points them to the sitemap; `disallowAll` for staging.
  - **Hide from search engines:** a new `meta.noindex` checkbox adds `robots: noindex` and leaves the page out of the sitemap. It is a new column: run `easy-cms migrate:create` after updating.
  - **seoMeta:** `url: (doc, locale) => …` adds hreflang links and `x-default`; `locale` adds `og:locale`; `type: 'article'` adds the published and modified times and author. It also returns `jsonLd` (BlogPosting or WebPage) and `head` for Nuxt's `useHead()`. `siteJsonLd()` makes Organization and WebSite data, and `jsonLdScript()` renders JSON-LD safely in a `<script>`.
  - **Root endpoints:** `endpoints` accept `root: true` to serve a path from the site's root, e.g. `/robots.txt`. The standalone server (`easy-cms serve`) serves them, so it has `/sitemap.xml` and `/robots.txt` with the SEO plugin; Nuxt and Next.js apps add the routes themselves. `createRootEndpointHandler(cms)` is exported for other servers.

## 0.16.1

### Patch Changes

- 8b14b83: Next.js: one CMS instance per server again. Next.js loads the config into each server layer (route handlers, Server Components), so `getEasyCMS()` saw a "new" config whenever a request switched layers, closed the database and opened it again. Requests still running then failed or hung, most visibly with PGlite. Instances are now matched by the config's structure (`configSignature()` in core). In `next dev`, editing only a hook's code needs a restart.

## 0.16.0

No changes in this release.

## 0.15.0

### Minor Changes

- fdb3985: API keys for scripts, other apps and AI assistants. With `apiKeys: true`, **Settings → API keys** in the admin creates keys that are shown once and stored as a hash. A key acts as its owner, limited to the collections, globals and actions it lists (read, create or upload, update, delete, publish); it never reaches users or other keys. Send it as `Authorization: Bearer ecms_…`. Bad, expired or revoked keys get `401 Invalid or expired API key`. Also `cms.createApiKey()` in the Local API and `user.apiKey` in access rules and hooks.

## 0.14.0

### Minor Changes

- 6c7eb74: `easy-cms copy --from <config>` copies every document, version, user and global from one database into another, for example from SQLite to Postgres (or back). Ids stay the same, so relationships, history and logins keep working. Both configs must have the same collections and fields, and the target must be empty. Also available as `copyDatabase(source.db, target.db)` from `@easy-cms/core`.

## 0.13.1

No changes in this release.

## 0.13.0

### Minor Changes

- bf9fa90: Plugins can now add REST endpoints and admin UI, and the first official plugin is here.
  
  - `endpoints: [{ path, method, handler }]` adds routes under the REST API, with the same auth, CSRF and error format.
  - Admin components: Web Components from `admin.modules` can replace a field's input (`admin.component`), sit below a field (`admin.after`) or add panels to the edit page's side column (`admin.sidebar`). The admin passes the form's state as properties and listens for `change` and `set-field` events.
  - `@easy-cms/plugin-seo`: meta title, description and share image with length meters, a search result preview and Generate buttons in the admin, and `seoMeta()` for Nuxt's `useSeoMeta` and Next.js `generateMetadata`.

## 0.12.0

### Minor Changes

- 070d710: Small collections can open in a drawer: `editIn: 'drawer'` creates and edits documents in a panel over the list (`?edit=<id>` / `?new` in the URL, so back and reload work). Relationship fields get a "Create …" button that opens the same panel and selects the new document, for targets without drafts, versions or preview.
- 070d710: The admin now follows its design more closely: counts in the menu, a greeting and "View site" on the dashboard (`admin.siteUrl`), breadcrumbs and row menus in lists, and an edit page with a page-wide header, a large title input with the slug beneath it, a split Publish button, a save bar pinned to the bottom, and a side panel for fields with `position: 'sidebar'`. Icons replace the text buttons in the rich-text and blocks editors. The menu lists user accounts under Settings and the media library last; `admin.menu` sets the order of collections.

## 0.11.0

### Minor Changes

- a035bce: A refreshed admin look: new color tokens, the Anuphan typeface (Thai and Latin), Lucide icons, a menu that works on phones, and a light / dark / system theme switch. Brand the admin for a client with `admin.brand` (`name`, `logo`, `color`; shades are derived and text stays readable), and give collections and globals a menu `icon`.
- 2a5a18d: Admin layouts from the redesign: lists get status and select-field filters, a column picker, a floating bar for bulk publish / unpublish / delete, and cards on phones; the edit page moves publishing, scheduling, delete and history into a side panel; the dashboard shows recent edits, drafts to review and upcoming scheduled publishes (`cms.upcomingJobs()`); messages appear as toasts.

## 0.10.0

### Minor Changes

- cab02f9: `easy-cms backup <file>` copies a SQLite database to a new file while the CMS keeps running (a consistent snapshot through `VACUUM INTO`). Databases expose it as the optional `db.backup(file)`; for Postgres, use `pg_dump`.

## 0.9.1

No changes in this release.

## 0.9.0

No changes in this release.

## 0.8.0

### Minor Changes

- e032e1c: Webhook deliveries are saved before the first attempt, so a process that stops while sending no longer loses the event; it is retried by the next `runJobs()` after 5 minutes.

## 0.7.0

### Minor Changes

- da85424: `where` can look inside blocks: `layout.blockType`, `layout.heading`, `layout.heading.en`, fields in groups inside blocks, and `layout: { exists }`.
- da85424: Webhook deliveries that fail are saved in the database (`webhook-deliveries`) and retried for about a day, so a restart or a stopped serverless function no longer loses them. Retries run with scheduled jobs: `cms.runJobs()`, `cms.retryWebhooks()`, `GET <api>/jobs/run` (now also returns `webhooks: { sent, failed }`) and `easy-cms run-scheduled`. Projects with `webhooks` need a new migration.

## 0.6.0

### Minor Changes

- a76cf49: Blocks field: `{ type: 'blocks', blocks: [{ slug, fields }] }` holds rows of different kinds (`{ id, blockType, ...fields }`), validated, populated and typed as a union, with an admin editor to add, reorder and remove blocks. Inferred types now treat arrays, blocks, groups and hasMany fields as always present.
- a76cf49: Localized arrays and hasMany fields: one list per locale (child tables get a `_locale` column; existing rows become the default locale's), queryable as `tags.en`. Reads with `locale: 'all'` no longer turn localized relationships into `null`.
- a76cf49: Scheduled publishing: `schedule: true` on collections or globals with drafts. `cms.schedule(collection, id, { action, at })`, a Schedule button in the admin, a per-minute runner in long-running servers, `GET <api>/jobs/run` for cron (Bearer `CRON_SECRET`) and `easy-cms run-scheduled`.
- a76cf49: Webhooks: `webhooks: [{ url, events?, collections?, globals?, secret? }]` POSTs signed JSON (`x-easy-cms-signature`) on create, update, delete, publish, unpublish and draft saves, with retries, without slowing saves; `cms.flushWebhooks()` for serverless.

## 0.5.0

### Minor Changes

- df8b783: Localization: `localization: { locales, defaultLocale }` in the config and `localized: true` on fields store one value per locale (one column per locale; the default locale keeps the existing column, so turning it on keeps data). Reads and writes take `locale` (or `'all'`) and `fallbackLocale`, REST takes `?locale=` and `?fallback-locale=`; queries, sorting, slugs and unique values work per locale. The admin gets a content language switcher.
- df8b783: Preview tokens: the admin adds `easy-cms-preview=<token>` to live preview URLs. The token opens one document's current draft (or one global) for an hour without a login, via `GET /:collection/:id?preview=<token>`, so frontends on another origin can preview drafts that were never published. `cms.createPreviewToken` / `cms.verifyPreviewToken` on the server, `getPreviewToken()` in `@easy-cms/core/live-preview`.

## 0.4.0

### Minor Changes

- b6f8aa3: Live preview: `preview: ({ doc }) => url` on a collection or global adds a Preview pane to the admin that shows the real page and updates it as you type, without saving. The server builds the preview document like a normal read (`cms.preview`, `POST /:collection/:id/preview`); pages receive it through `useLivePreview` (auto-imported in Nuxt, `@easy-cms/next/live-preview` in Next.js) or `subscribeLivePreview` from `@easy-cms/core/live-preview`.

## 0.3.0

### Minor Changes

- 8dd12a8: Version history: `versions: true` (or `{ max }`) on a collection or global keeps a version of every save, with history and restore in the Local API (`findVersions`, `findVersion`, `restoreVersion`), REST and a History panel in the admin. With `drafts`, a draft of a published document is kept as a version and the published document stays live until it is published again; `unpublish` and `discardDraft` are new actions. Projects without versions are unchanged and need no migration.

## 0.2.0

### Minor Changes

- d626995: Standalone mode: `easy-cms serve` runs the admin and REST API as their own server (with `--watch` for development and `/healthz`), so Vite, React, Vue or static frontends can use Easy CMS as a backend. `create-easy-cms` sets one up in a new or empty directory, or with `--standalone`. The REST API supports CORS through the new `cors` config option; `createStandaloneHandler` is exported for Bun, Deno or Hono servers.

## 0.1.1

### Patch Changes

- 01f3816: - Next.js builds no longer trace the whole project into the server output: the config lookup and local upload storage mark their runtime paths with `turbopackIgnore`.
  - `create-easy-cms` and the "secret is required" error now say that the secret must be set in the production environment (Nuxt's production server does not read `.env`).

## 0.1.0

### Minor Changes

- 312df64: First release of Easy CMS: an embedded, code-first headless CMS for Nuxt and Next.js with an admin UI,
  typed Local API, REST API, SQLite and Postgres adapters, uploads, drafts, hooks and access control.
