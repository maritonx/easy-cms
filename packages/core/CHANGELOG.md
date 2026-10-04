# @easy-cms/core

## 0.30.0

### Minor Changes

- f9d5512: Failed webhooks and emails in the admin.
  
  - **Settings → Deliveries** (admins): webhook deliveries and emails that failed or wait for another attempt. Webhooks show what changed, the address, the last error and the body sent; emails show who to and the subject, not the content.
  - **Retry** sends once now (removed when it goes through, kept with the new error when not), one at a time or all failed at once; **Delete** one or all failed.
  - Failed deliveries are deleted after 30 days, when scheduled jobs run.
  - The dashboard's "Needs attention" links failed webhooks and emails to this page.
  - New admin-only endpoints: `GET <api>/admin/deliveries`, `POST …/:kind/:id/retry`, `POST …/:kind/retry`, `DELETE …/:kind/:id`, `DELETE …/:kind`.

## 0.29.0

### Minor Changes

- 5e92063: The dashboard tells admins what needs attention, and what the system is.
  
  - **Needs attention** (admins only, shown only when something is wrong): webhook deliveries that failed in the last 7 days, emails waiting over an hour or failed, scheduled publishing over 10 minutes late (nothing calls `jobs/run`), no `email`, and no `serverURL` in production. Each links to the new Health checks guide.
  - **System** (admins only): the Easy CMS version, database, file storage, email adapter, plugins with their versions, and field types.
  - Both come from the new `GET <api>/admin/status`, for admins only. Easy CMS doesn't check for new versions.
  - **`definePlugin(plugin, { name, version })`** names a plugin for the dashboard; the official plugins name themselves. `EmailAdapter` gets an optional `name` (`smtp`, `console`). Core exports `VERSION`.
  - In development, the admin's HTML is read on each request, so a rebuilt admin shows up without a restart.

## 0.28.0

### Minor Changes

- 479e17a: Uploads from links.
  
  - **`upload.fromURL: { allowedHosts, allowPrivate? }`** lets users upload a file by its link: the server downloads it, then checks it like any upload (type from the contents, `maxFileSize`, the right to create media). Off by default.
  - **`cms.uploadFromURL(url, fields?, options?)`** in code, and `POST <api>/media` with JSON `{ url, ...fields }` over REST.
  - **Admin:** a "From a link" field in the media library, the media picker and galleries. Links (or files) can also be pasted into the upload area, and images dragged from other pages dropped on it.
  - **Safe by default:** only `http(s)`; hosts must be in `allowedHosts` (also after redirects, three at most); private network addresses (`localhost`, `10.x`, `192.168.x`, `169.254.x`, IPv6 ones too) are refused after DNS resolution, unless `allowPrivate: true`; 15 seconds and `maxFileSize` at most.
  - **Fix:** a media document's page cut off large images; the whole image now shows, as big as fits (up to 70% of the screen's height), and a click opens the original.
  - **Dashboard, regrouped:** number tiles show content only, in menu order, each opening its list with a + to create; drafts to review come first, then recent edits; plugin panels (`width: 'half'`) sit in the side column beside them, `full` ones below.

## 0.27.0

### Minor Changes

- ffa2f84: Plugin pages and dashboard panels.
  
  - **`admin.pages`**: pages of their own at `<admin>/p/<path>`, with a Web Component as the body. The admin draws the header. `group` puts them under Content or Settings in the menu, or leaves them out (`false`).
  - **`admin.dashboard`**: panels on the dashboard after the built-in ones, `half` or `full` width.
  - **`access: ({ user }) => boolean`** on both is checked on the server; what a user may not see is left out of their admin.
  - Admin components now also get `user`, and on pages `route` (`subpath`, `query`). They can send a `navigate` event to open an admin path, e.g. to keep a tab or date range in the address.
  - New menu icons: `chart-column` and `chart-line`.
  - **Form builder:** a "Form overview" page with submissions per day and per form over 7 or 30 days, and a dashboard panel for the last 7 days. Both read the new `GET <api>/form/stats.json`, which counts days in the editor's time zone.

## 0.26.0

### Minor Changes

- bcf3c0c: Custom field types.
  
  - **`fieldTypes` and `defineFieldType()`** let packages add a field `type`: stored, queried and translated like a built-in base type (`text`, `number`, `json`…), with its own `validate`, `checkOptions`, input and list cell. Names that clash with built-in types or each other are config errors.
  - **Types:** packages extend `interface CustomFieldTypes` (module augmentation), so `type: 'color'` is accepted with its options and documents get the right value type. `generate:types` uses the type's `typescript`.
  - **`admin.cell`** on any field shows its value in the list's column with a Web Component; columns with a cell are shown by default.
  - **New package `@easy-cms/fields`** with `color`: `#rrggbb` (or `#rrggbbaa` with `alpha: true`), a picker with `presets`, and swatches in lists.

## 0.25.0

### Minor Changes

- 434599a: Typed plugin fields.
  
  - **`definePlugin<T>(plugin)`** tells the inferred document types what a plugin adds: fields on collections and globals, and whole collections. `CollectionDocument`, `cms.find()` and the rest then know them, with no command to run.
  - **The official plugins declare theirs:** `post.meta` (SEO), `page.parent`, `page.path` and `page.breadcrumbs` (nested pages, with the names you give), the `redirects` collection with its `to_<collection>` fields, and the `forms` and `form-submissions` collections.
  - `findByPath()` returns the page typed from your config; `getTree()` and `rebuildNestedDocs()` take your typed `cms`.
  - New types in core: `PluginTypes`, `TypedPlugin`, `DocumentOf` and `SlugOf` for helpers that take an `EasyCMS<C>`.

## 0.24.0

### Minor Changes

- 230a347: Forgotten passwords and invitations by email.
  
  - **Forgot your password?** on the login page emails a link that sets a new password: it works once, within an hour (`auth.resetPasswordExpiration`). The answer is the same whether or not the email has an account, and requests per email and IP are limited. Setting the password signs the account out everywhere, logs in on this browser and emails a "your password was changed" notice.
  - **Invitations:** admins create users without a password and they get an email to choose one (the link works for 7 days, `auth.inviteExpiration`). "Email a link to set the password" on a user's page sends an invitation or a reset link.
  - Emails are in English or Thai, or your own text with `auth.emails`. Links need `email` in the config, and `serverURL` in production (a request's Host could be forged); without them the admin doesn't offer them.
  - REST: `POST /users/forgot-password`, `GET` and `POST /users/reset-password`, `POST /users/:id/password-link`. Local API: `cms.auth.requestPasswordReset()`, `cms.auth.sendPasswordLink()`, `cms.auth.resetPassword()`.
  - `cms.create('users', …)` no longer requires a `password`: a user without one can't log in until they set it from an invitation.

## 0.23.0

### Minor Changes

- 0107902: Image galleries: upload fields with several files.
  
  - **`upload` with `hasMany: true`** keeps several files in the order editors arrange them, e.g. a gallery on a post. In the admin editors drop several files at once, pick several from the media library, drag them into order (or use the arrow buttons) and remove them. Reads return the media documents in order; it can be `localized`, and queries like `where: { gallery: { in: [id] } }` work. Needs a migration for the new field.
  - **`mimeTypes`** on upload fields, e.g. `['image/*']`: the media picker offers only those files, and saving refuses others ("must be an image").
  - **`minRows` / `maxRows`** on upload and relationship fields with `hasMany`.
  - An empty list now counts as fewer than `minRows` (arrays and blocks too); drafts may still be incomplete.

## 0.22.2

No changes in this release.

## 0.22.1

### Patch Changes

- d742afc: Package READMEs: what each package does, how to install it with npm, pnpm, Yarn or Bun, a short example and links to its guide.

## 0.22.0

### Minor Changes

- 63995c6: npm, pnpm, Yarn and Bun.
  
  - `create-easy-cms --pm npm|pnpm|yarn|bun` picks the package manager; without it, the project's `packageManager` field, then its lockfile, then the one you ran it with (`pnpm create easy-cms`, `bun create easy-cms`…).
  - The next steps it prints use that package manager: `pnpm exec easy-cms migrate`, `yarn easy-cms migrate`, `bunx easy-cms migrate`, `bun run dev`.
  - With Yarn 2 or later it writes `.yarnrc.yml` with `nodeLinker: node-modules` (Plug'n'Play isn't supported).
  - When the package manager isn't installed it says how to get it, and prints the install commands.
  - Messages from core and the Nuxt module no longer assume npx.
  - The docs show every command for npm, pnpm, Yarn and Bun, and keep the one you pick.

## 0.21.0

### Minor Changes

- 0e69436: Nested pages.
  
  - **New package `@easy-cms/plugin-nested-docs`:** pages inside pages (About → Team). Each document in the listed collections gets a `parent`, its full `path` (`/about/team`) and its `breadcrumbs`, per language when the slug is localized. When a page gets a new slug or parent, the pages under it are updated too, when it is published; with the redirects plugin their old addresses redirect. A page can't be moved under itself, levels are limited (`maxDepth`), and a page with pages under it can't be deleted (or they move up, with `onDeleteParent: 'orphan'`). `findByPath()`, `getTree()` and `GET /api/cms/tree/:collection` show pages and menus; `npx easy-cms nested:rebuild` works out the paths of pages that existed before. Needs a migration for the new fields.
  - **Relationship `filterOptions`:** which documents a relationship may point to, worked out on the server. The admin's picker offers only those, and saving checks them.
  - **Slug `uniqueWithin`:** slugs unique only among documents with the same value of another field, e.g. `uniqueWithin: 'parent'`.
  - **Tree lists:** `admin: { list: { tree: 'parent' } }` shows a collection's list as a tree; `list.sort` sets the list's default order.
  - **`update(…, { live: true })`:** upkeep of the live version that leaves a pending draft pending and adds no version.
  - **CLI commands from the config:** `commands: [{ name, description, run }]`, e.g. from plugins.
  - **SEO:** `seoMeta({ breadcrumbs })` adds BreadcrumbList JSON-LD.

## 0.20.1

No changes in this release.

## 0.20.0

### Minor Changes

- b7564cb: Forms and email.
  
  - **Email:** `email` in the config sends email for plugins and your hooks: `smtp()` from the new `@easy-cms/email-smtp` (Gmail, SES, Resend, Mailgun or any SMTP server), `consoleEmail()` for development, or your own adapter. `cms.sendEmail()` queues each email in the database and retries it for about a day if sending fails (`runJobs`); `flushEmails()` waits for them on serverless hosts. Needs a migration for the `email-deliveries` table.
  - **New package `@easy-cms/plugin-form-builder`:** editors build forms in the admin from field blocks (text, long text, email, number, phone, choice, checkbox, date, message), with a confirmation message or redirect and notification emails (`{{name}}`, `{{*}}`, and confirmations to the sender). Submissions are validated on the server, stored without IP addresses and exported as CSV. A honeypot, a minimum time, a rate limit per visitor and optional Cloudflare Turnstile keep bots out. `<easy-form form="contact">` renders a form on any page (the CMS also serves it at `/api/cms/form/element.js`); `getForm()` and `submitForm()` are there for your own components. Needs a migration for the `forms` and `form-submissions` collections.
  - Requests without a session cookie from origins in `cors` now pass the CSRF check, so frontends on other origins can send forms without being trusted with cookies. Endpoints get the client's `ip`.
  - The admin's lists can be narrowed to one related document from the URL (`?f_form=3`).

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
