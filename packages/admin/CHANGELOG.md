# @easy-cms/admin

## 0.41.0

### Minor Changes

- 7a43c55: Large files straight to the storage: with S3 (R2, MinIO) or Vercel Blob, the admin sends files over 4 MB from the browser to the storage (`POST <api>/media/uploads` for a signed ticket and a presigned URL or client token, then `/media/uploads/complete`), past hosts' request limits (about 4.5 MB on Vercel); the server still checks each file's size and type from its contents, and deletes what fails. Storage adapters can add `uploadURL()` and `getStart()`. `cms.createUpload()` and `cms.completeUpload()` do the same from code. Making a media folder private or public (moving or deleting it) now refuses to move more than 200 files at once.

## 0.40.0

### Minor Changes

- e24dbd1: Private folders: admins tick Private on a media folder, and its files (and subfolders') are kept apart (`upload.privateStorage`, or the storage itself when it has no public URLs), served only at `<api>/media/private/<name>` to users who may see them or with `cms.signedMediaURL(doc, { expiresIn })` (at most 7 days), and hidden from requests that are not signed in. Files move between storages, renamed, when they or their folders change; the admin asks first, with how many documents use them. Upload fields take a folder by key (`folder: 'banners'`, made when first needed), with `folderOnly` to allow no other. API keys can be limited to some media folders.

## 0.39.0

### Minor Changes

- 72758f0: Media: upload several files at once (three at a time, each with its progress; cancel or retry a file; files over `maxFileSize` refused before sending; the new files stay selected) — the Media page only uploaded the first of several dropped files before. New file types detected from their contents: Word, Excel, PowerPoint, OpenDocument, zip, MP3, WAV, Ogg, M4A, WebM, MOV and CSV, with `mimeTypes` groups `documents`, `office` and `archives`. Files show an icon in their type's color; the Media page has a grid view; a file's page previews it by type (players for audio and video, the browser's PDF viewer, the start of text and CSV files). PDFs are served without the sandbox CSP so browsers can show them.

## 0.38.0

### Minor Changes

- 5a71c12: Media folders (`upload.folders: true`): nested folders in the media library (`media-folders`, each file in one `folder`), a folder tree, path and subfolders on the Media page, drag files onto folders or "Move to…", uploads into the open folder, and folders in upload fields' pickers. Deleting a folder moves what it holds up to its parent. With `auth.rbac`, admins choose which roles may view, edit or manage each folder (inherited by subfolders; it only narrows the role's Media permissions; recorded in the audit log). Files stay public: folders sort the team's work.

## 0.37.2

No changes in this release.

## 0.37.1

No changes in this release.

## 0.37.0

### Minor Changes

- cbf800c: One-click deploy to Vercel and Netlify, and a setup code for the first admin.
  
  - **Deploy buttons** (README, docs): a Next.js blog with its admin, from `templates/next-starter`, with a Neon Postgres database and file storage made by the platform, and sample posts. The only thing to fill in is a setup code.
  - **`auth.setupCode`** (default: the `EASY_CMS_SETUP_CODE` environment variable): creating the first admin needs this code, so nobody else can claim a freshly deployed site. Wrong codes are rate-limited. `GET <api>/users/init` says whether it is asked (`setupCode`), and the admin's setup page asks for it.
  - **New package `@easy-cms/storage-vercel-blob`:** `vercelBlobStorage()` keeps uploads in Vercel Blob (`BLOB_READ_WRITE_TOKEN`), public on the CDN, or private behind the API (`access: 'private'`, e.g. for backups).
  - **New package `@easy-cms/storage-netlify-blobs`:** `netlifyBlobsStorage()` keeps uploads in Netlify Blobs, served through the API.

## 0.36.1

### Patch Changes

- 4885cc2: Audit log: a translated field's change shows one row per language that changed (`title · en: — → Contact`), not the raw values of every language.

## 0.36.0

### Minor Changes

- 7fbd37e: Audit log: who changed what and when, sign-ins, and admin actions.
  
  - Turn it on with **`audit: true`** (or `{ keep: 365, values: true, failedLogins: 20 }`). It adds the internal `audit-logs` table: create a migration (`easy-cms migrate:create audit`).
  - **Recorded:** creating, changing, publishing, unpublishing, restoring and deleting documents and globals (with each changed field's value before and after; hidden fields never, the password only as changed), scheduling; logins, failed logins, lock-outs, logouts, password links and single sign-on; roles, backups, test emails and deliveries. Each entry has who (their email then), how (signed in, API key, code, scheduled job), the IP address and the browser.
  - **Settings → Audit log** (admins, and roles given it): filters, each change's fields, CSV export and an integrity check. A document's page shows its **Activity**.
  - **Tamper evidence:** entries can't be changed or deleted through Easy CMS (only older than `keep` days, oldest first), and each is signed with the secret; the check finds edited and missing entries, daily with scheduled jobs.
  - The dashboard warns about many failed logins within an hour, entries that couldn't be written, and a failed check.
  - `cms.audit.record({ action, target, doc })` writes your own entries. New endpoints: `GET <api>/admin/audit`, `/admin/audit.csv`, `POST /admin/audit/verify`.

## 0.35.0

### Minor Changes

- 892f6cf: Single sign-on for the admin: Google, Microsoft (Entra ID), GitHub or any OpenID Connect provider.
  
  - **New package `@easy-cms/auth-oauth`:** `google()`, `microsoft()`, `github()` and `oidc({ issuer, clientId, clientSecret })`, with the Authorization Code flow, PKCE, `state` and `nonce` (oauth4webapi). Client IDs and secrets come from environment variables.
  - **`auth.providers`** adds "Sign in with …" to the login page. People are matched to users by the provider's id for them, or the first time by their verified email. **`auth.allowSignUp: { domains, role }`** gives people from your domains an account on their first sign-in; nobody else gets in without one.
  - **`auth.password: false`**: only admins sign in with a password (a way in if the provider is down). Invitations then tell people to sign in with the provider.
  - **Account** lists the outside accounts you sign in with: link another, unlink one (never the last way in). Admins see a user's on their page. **Settings → Single sign-on** shows each provider's callback URL to give it.
  - New endpoints under `<api>/auth/` and `GET <api>/admin/sso`; the `auth` slug and endpoint root are reserved.
  - With providers, the internal `user-identities` table is added: create a migration (`easy-cms migrate:create sso`).

## 0.34.0

### Minor Changes

- 3e33a26: Roles (`auth.rbac`): own documents only, field permissions, and who gets a deleted user's documents.
  
  - **Own documents only:** next to a ticked Read, Update, Delete or Publish, Settings → Roles can limit it to the role's own documents, e.g. writers read every post but change, publish and delete only theirs.
  - **Who owns a document:** with roles on, every collection but Users gets **`createdBy`**, set when a document is created (requests can't set it; trusted Local API calls can, for imports). Or name an owner field with **`admin.ownerField`**, e.g. `'author'`: filled with the creator when empty, and read-only for roles limited to their own documents. Lists get a **Mine** filter. Documents from before get `createdBy` from their first version's author, where there is history.
  - **Field permissions:** per role, each top-level field can be **Can edit**, **Read only** or **Hidden**; others follow the row. Required fields stay editable for roles that create documents.
  - **Hidden fields can't be used to filter or sort** (403), for role rules and for `access.read` in the code, which before only hid the value. The admin schema leaves out fields the user can't read.
  - **Deleting a user** in the admin asks who gets the documents they own. REST: `DELETE <api>/users/:id?transferTo=<id>` (or `none`); Local API: `cms.delete('users', id, { transferTo })`. New admin endpoint: `GET <api>/admin/owned/:userId`.
  - Projects with `auth.rbac` get a `created_by` column in every collection: create a migration (`easy-cms migrate:create owners`).

## 0.33.0

### Minor Changes

- a26533e: Roles from the admin (RBAC): admins add roles and tick what each may do, without code.
  
  - Turn it on with **`auth: { rbac: true }`**. Admins get **Settings → Roles**: add, rename, copy and delete roles, and tick **Read, Create, Update, Delete and Publish** per collection and global, plus admin pages (the system status, Deliveries, and plugin pages and dashboard panels). Each role keeps a history of who changed it.
  - Permissions are checked on the server **on top of access rules**: both must allow. Admins may always do everything; requests that aren't logged in are left to access rules; everyone keeps their own account; API keys can do no more than their owner's role.
  - The roles in `auth.roles` always exist and can't be deleted. When roles are first turned on they get everything they could do before, so nothing changes until an admin unticks something. Collections added later are given to no role until ticked (marked **New**).
  - The admin hides what a role can't do: menus, buttons, Publish (the main button saves a draft instead), and relationship and upload fields pointing to collections the role can't read (shown as they are, kept on save). The API key permissions table only offers what you may do yourself.
  - `/admin/schema` now has `permissions.publish` and `views`; dashboard panels take an optional `label`, and with `rbac` each needs its own tag. New admin-only endpoints under `<api>/admin/roles`.
  - Adds the internal `user-roles` table when `rbac` is on: create a migration (`easy-cms migrate:create roles`). The `user-roles` slug is now reserved.

## 0.32.0

### Minor Changes

- 281435f: Database backups from the admin.
  
  - **Settings → Backups** (admins): **Back up now**, the list of backups with who made and last downloaded each, **Download** and **Delete**.
  - **`backups: { every, at, keep, dir, storage, sqlite }`** in the config: back up every `day` or `week` at `at` (server time), keep the newest `keep` (7). Without `every`, back up by hand.
  - Each backup is one compressed SQLite file (`<site>-YYYY-MM-DD-HHmm.db.gz`) of the whole database. SQLite copies itself; Postgres is copied into a SQLite file with `backups.sqlite` (`sqlite` from `@easy-cms/db-sqlite`).
  - Stored privately: `backups/` by default (never the uploads folder, never served) or `backups.storage`, e.g. a private S3 bucket. Downloads go through the server, for admins only.
  - Scheduled backups run with scheduled jobs (every minute on a server, or from the `jobs/run` cron); one at a time. The dashboard's "Needs attention" warns when the last scheduled backup failed or none finished in two periods.
  - `easy-cms backup <file>` uses the same engine: it now backs up Postgres too, and compresses a `.gz` name.
  - Adds the internal `database-backups` table: create a migration (`easy-cms migrate:create backups`).

## 0.31.0

### Minor Changes

- 36fc19b: Settings → Email in the admin: see the email settings in use, check the connection, send a test email.
  
  - Admins see the email adapter and its settings with where each comes from (`SMTP_HOST`, `smtp({ from })`…). Passwords only show as set or not.
  - **Check the connection** logs in to the SMTP server without sending; **Send test email** sends one now, not through the queue, to you or another address (5 in 10 minutes). Both show the server's answer with a hint for the usual mistakes (user or password, port and TLS, an unreachable server, a refused sender).
  - `EmailAdapter` gets two optional methods for this: `describe()` (never secrets) and `verify()`. `smtp()` and `consoleEmail()` have them.
  - New admin-only endpoints: `GET <api>/admin/email`, `POST <api>/admin/email/verify`, `POST <api>/admin/email/test`.

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

No changes in this release.

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

No changes in this release.

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

No changes in this release.

## 0.16.1

No changes in this release.

## 0.16.0

No changes in this release.

## 0.15.0

### Minor Changes

- fdb3985: API keys for scripts, other apps and AI assistants. With `apiKeys: true`, **Settings → API keys** in the admin creates keys that are shown once and stored as a hash. A key acts as its owner, limited to the collections, globals and actions it lists (read, create or upload, update, delete, publish); it never reaches users or other keys. Send it as `Authorization: Bearer ecms_…`. Bad, expired or revoked keys get `401 Invalid or expired API key`. Also `cms.createApiKey()` in the Local API and `user.apiKey` in access rules and hooks.

## 0.14.0

No changes in this release.

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
- 070d710: Clearer languages in the admin: lists always show the default language with a Translations column instead of a language switch; the edit page labels its content language switcher and marks languages a document still needs; the interface language can also be set on the Account page.
- 070d710: The admin now follows its design more closely: counts in the menu, a greeting and "View site" on the dashboard (`admin.siteUrl`), breadcrumbs and row menus in lists, and an edit page with a page-wide header, a large title input with the slug beneath it, a split Publish button, a save bar pinned to the bottom, and a side panel for fields with `position: 'sidebar'`. Icons replace the text buttons in the rich-text and blocks editors. The menu lists user accounts under Settings and the media library last; `admin.menu` sets the order of collections.

### Patch Changes

- 070d710: After a new version is deployed, an admin tab that was already open reloads the page it navigates to instead of silently staying put (its old page files are gone).

## 0.11.0

### Minor Changes

- a035bce: A refreshed admin look: new color tokens, the Anuphan typeface (Thai and Latin), Lucide icons, a menu that works on phones, and a light / dark / system theme switch. Brand the admin for a client with `admin.brand` (`name`, `logo`, `color`; shades are derived and text stays readable), and give collections and globals a menu `icon`.
- 2a5a18d: Admin layouts from the redesign: lists get status and select-field filters, a column picker, a floating bar for bulk publish / unpublish / delete, and cards on phones; the edit page moves publishing, scheduling, delete and history into a side panel; the dashboard shows recent edits, drafts to review and upcoming scheduled publishes (`cms.upcomingJobs()`); messages appear as toasts.

## 0.10.0

No changes in this release.

## 0.9.1

No changes in this release.

## 0.9.0

No changes in this release.

## 0.8.0

No changes in this release.

## 0.7.0

No changes in this release.

## 0.6.0

### Minor Changes

- a76cf49: Blocks field: `{ type: 'blocks', blocks: [{ slug, fields }] }` holds rows of different kinds (`{ id, blockType, ...fields }`), validated, populated and typed as a union, with an admin editor to add, reorder and remove blocks. Inferred types now treat arrays, blocks, groups and hasMany fields as always present.
- a76cf49: Scheduled publishing: `schedule: true` on collections or globals with drafts. `cms.schedule(collection, id, { action, at })`, a Schedule button in the admin, a per-minute runner in long-running servers, `GET <api>/jobs/run` for cron (Bearer `CRON_SECRET`) and `easy-cms run-scheduled`.

## 0.5.0

### Minor Changes

- df8b783: Localization: `localization: { locales, defaultLocale }` in the config and `localized: true` on fields store one value per locale (one column per locale; the default locale keeps the existing column, so turning it on keeps data). Reads and writes take `locale` (or `'all'`) and `fallbackLocale`, REST takes `?locale=` and `?fallback-locale=`; queries, sorting, slugs and unique values work per locale. The admin gets a content language switcher.

## 0.4.0

### Minor Changes

- b6f8aa3: Live preview: `preview: ({ doc }) => url` on a collection or global adds a Preview pane to the admin that shows the real page and updates it as you type, without saving. The server builds the preview document like a normal read (`cms.preview`, `POST /:collection/:id/preview`); pages receive it through `useLivePreview` (auto-imported in Nuxt, `@easy-cms/next/live-preview` in Next.js) or `subscribeLivePreview` from `@easy-cms/core/live-preview`.

## 0.3.0

### Minor Changes

- 8dd12a8: Version history: `versions: true` (or `{ max }`) on a collection or global keeps a version of every save, with history and restore in the Local API (`findVersions`, `findVersion`, `restoreVersion`), REST and a History panel in the admin. With `drafts`, a draft of a published document is kept as a version and the published document stays live until it is published again; `unpublish` and `discardDraft` are new actions. Projects without versions are unchanged and need no migration.

## 0.2.0

No changes in this release.

## 0.1.1

No changes in this release.

## 0.1.0

### Minor Changes

- 312df64: First release of Easy CMS: an embedded, code-first headless CMS for Nuxt and Next.js with an admin UI,
  typed Local API, REST API, SQLite and Postgres adapters, uploads, drafts, hooks and access control.
