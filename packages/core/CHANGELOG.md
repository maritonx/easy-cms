# @easy-cms/core

## 0.66.1

No changes in this release.

## 0.66.0

### Minor Changes

- b5390b6: Multi-tenant hygiene (#102):
  
  - Staff of a tenant see others' memberships in that tenant only; people still see all their own.
  - Checking the audit log's integrity is for admins of the whole system (not of one tenant); the admin hides the button for others.
  - A plugin's collections listed only partly per tenant (forms without their submissions, some of the shop's) log a warning on the first request.
  - `unique` on a field inside a group, array or block logs a config warning: it is enforced on top-level fields only.

## 0.65.0

### Minor Changes

- eb1dd41: Operations (#101):
  
  - GraphQL introspection is off in production by default (`introspection: true` to keep it); `easy-cms generate:graphql` still writes the schema.
  - `backups.encryptionKey` encrypts backup files (AES-256-GCM, `.db.gz.enc`); admin downloads are decrypted and `easy-cms backup:decrypt <file>` decrypts one by hand. A backup storage with public URLs logs a warning; `create-easy-cms` adds `backups/` to `.gitignore`.
  - SMTP on port 587 requires STARTTLS (`requireTLS`, shown in the admin's Email settings).
  - Without the audit log, failed sign-ins are written to the server log; each audit check logs its last id there too.
  - Forms without a client IP share one rate limit of ten times `max`, instead of none.

## 0.64.0

### Minor Changes

- 42b3c86: Browser and transport (#99):
  
  - Over HTTPS (and in production) the session, CSRF and SSO cookies are named `__Host-…`; the old names are still read, so nobody is signed out. Logging out clears both and sends `Clear-Site-Data: "cache"`, and the admin forgets drafts and recent documents it kept in the browser.
  - The REST API and the admin send HSTS (`max-age=31536000`) in production.
  - Uploaded text files are stored and served with `charset=utf-8`.
  - The CSRF origin check uses `X-Forwarded-Host` only with trust-proxy (`trustProxy`, `--trust-proxy`) or on Vercel and Netlify; `createRestHandler` takes `trustProxy`.
  - The SEO plugin's sitemap and robots.txt build their own addresses from `serverURL`, not the request's host.
  - The admin's switcher cookie is `Secure` over HTTPS.

## 0.63.0

### Minor Changes

- 1ea78b2: Access checks (#98):
  
  - Updating or deleting a document the user may not read answers `404`, as for an id that doesn't exist; one they may read but not change still answers `403`.
  - Preview links from the admin read with the access of whoever made them (`createPreviewToken(target, { user })`); they stop working when that user is deactivated.
  - `<api>/admin/ui/media-usage` counts only documents the user may read (`cms.mediaUsage(ids, access)`).
  - Shop: `POST <api>/shop/confirm` is only for whoever paid: the customer, or the guest with the cart's secret (the client sends it); others get `404`.

## 0.62.0

### Minor Changes

- 3530913: Account hardening (#97):
  
  - Passwords that are among the ~2,000 most common (from SecLists, 8 characters or more) are refused. Existing passwords keep working.
  - Account lists your API keys with Revoke and Revoke all; after a password reset the admin shows your keys first and offers to revoke them.
  - In production the server warns while no admin exists and no setup code is set; creating the first admin is in the audit log (`setup`).
  - `cronSecret` must be at least 32 characters (a shorter `CRON_SECRET` is a warning), and `<api>/jobs/run` with the session cookie takes `POST` only.

## 0.61.0

### Minor Changes

- 3a8422c: Deprecation warnings: `warnDeprecated(code, message)` (from `@easy-cms/core` and `@easy-cms/core/plugin`) logs a Node.js `DeprecationWarning` once per code and process. Old names that still work warn with codes `EASY_CMS_DEP001`–`005`: `<api>/users/<action>`, `POST` to a global, `?fallback-locale=`, `easy-cms create-admin` and `easy-cms run-scheduled`. A new docs page, "Versions and deprecations", says what the version number promises and lists them.
  
  The admin saves globals with `PATCH` and sends `?fallbackLocale=`, and a failed sign-in no longer counts as an expired session.

## 0.60.0

The same code as 0.49.0, released as 0.60.0 to match the [roadmap](https://github.com/maritonx/easy-cms/blob/main/docs/ROADMAP.md):
the names and shapes for 1.0. See the [upgrade guide](https://easy-cms-website.vercel.app/docs/upgrading).

## 0.49.0

### Minor Changes

- ee496b4: Names and shapes for 1.0. This release renames config options, Local API methods, CLI commands,
  REST routes and plugin options; the config check names the new option when an old one is used.
  See the upgrade guide: https://easy-cms-website.vercel.app/docs/upgrading
  
  - Public API separated from what packages share (`@easy-cms/core/internal`, outside semver) and
    `@easy-cms/core/plugin` for plugin authors
  - Error codes on every `EasyCMSError` and REST error; `Retry-After` on 429
  - Config renames (`siteURL`, `admin.order`, `admin.icon`, `cliCommands`, `keepDays`,
    `backups.frequency`, …) and warnings for unknown options
  - Local API: `isStaff`, `findSchedule`, `upcomingSchedules`, `runJobs()` result, `increment()`
    throws for a missing document
  - REST: `/auth/<action>` (with `/users/<action>` aliases), `/admin/ui/*`, `PATCH` for globals
  - Plugins and adapters declare `apiVersion`; `onRequest` lists; `flags` for plugin commands;
    CLI `admin:create` and `jobs:run`; plugin option renames

## 0.48.0

### Minor Changes

- db47c50: Security changes that may need a step when you upgrade:
  
  - **SVG is no longer included in `image/*`** (it can carry scripts). To keep allowing it, list it: `upload.mimeTypes: ['image/*', 'image/svg+xml']`. After a direct upload, the type the storage serves the file with must be the one checked (S3 reports it).
  - **Users changing their own password or email send their current password** (`currentPassword`); the account page asks for it. Admins changing other users don't. Accounts without a password can't change their own email.
  - **Single sign-on no longer signs existing staff in by email** until they link the provider from their account page, unless the provider has `linkByEmail: true` (for providers whose emails your organization controls). Site members are still matched by email. `microsoft()` no longer uses the user principal name as an email.
  - **`trustProxy` takes the last `X-Forwarded-For` address** (the one your proxy added), not the first, which the client can write. On Vercel and Netlify the client IP is found without it; Nuxt uses the connection's address otherwise. A warning is logged in production when logins have no client IP.
  - **In production, a `secret` that looks like an example or a repeated pattern is refused.** The Next.js starter no longer falls back to a fixed secret in production: without `EASY_CMS_SECRET` (and without a database URL) it uses a random one per process and says so.
  - **Multi-tenant: the people of a tenant, its admins included, no longer change shared collections and globals** (those not listed in `collections`/`globals`). List the ones they may change in `editShared`. The deliveries page is for system admins only.

## 0.47.4

### Patch Changes

- 76e22e3: Security fixes:
  
  - Site members never read drafts, through any API (the Local API now applies the rule REST already had).
  - A sign-up for an account still waiting for its email takes the new password and sends a new link; signing in with a provider confirms such an account and drops the password set before. Email confirmation links work once.
  - Only system admins unlink someone else's single sign-on account.
  - Request bodies sent without a length are refused once past the limit, instead of being read whole first. Endpoints get `req.text()` for raw bodies (at most 1 MB).
  - Upload from URL also refuses IPv4 addresses inside IPv6 (NAT64, `::a.b.c.d`) that are private.
  - Shop: changing an order's status (paid, sent, cancelled, refunded) needs update access to the order.
  - Multi-tenant: a tenant's admins can't add site members or people with access to all tenants to it; adding someone who already has an account answers as for someone new and emails them.

## 0.47.3

No changes in this release.

## 0.47.2

### Patch Changes

- 43833ab: Packing a package with npm or Yarn 1 now stops with a message when its `package.json` still has `workspace:` ranges, which those tools would publish as they are; pnpm, Yarn 2+ and Bun rewrite them and pass.

## 0.47.1

No changes in this release.

## 0.47.0

### Minor Changes

- 203e359: The admin grows with your plugins. The menu has groups that fold, two levels deep (`admin.nav`, and `admin.group` on collections, globals and pages): Content, the media library, each plugin's group (Shop › Catalog, Sales, Customers; Forms) and Settings › Site, Users & access, System. Each person can fold groups, pin items and collapse the menu to icons. Badges show what needs attention (`admin.badge`, e.g. orders to send), and a **+** creates a document from the menu.
  
  ⌘K opens search and commands: go anywhere, create, find documents by title in every collection, reopen recent ones, and run commands, plugins' too (`admin.commands`). Shortcuts: ⌘S saves, ⌘⇧P publishes, `[` collapses the menu, `?` lists them.
  
  Edit pages take tabs, sections that fold and rows (`admin.layout`, by field name), help below fields (`admin.description`), widths (`admin.width`) and fields shown only when they apply (`admin.condition`, which the server reads too: a hidden field isn't required). A failed save lists what to fix and opens the right tab; unsaved changes are kept in the browser and offered back. The SEO plugin puts its fields in an SEO tab (`tab: false` keeps them below). Lists remember their filters and scroll, and say what a collection is for while empty (`admin.empty`).
  
  Configs keep working as they are; nothing changes in the database.

## 0.46.0

### Minor Changes

- 6938928: A shop: `@easy-cms/plugin-ecommerce`. Products with variants and prices in several currencies, carts that guests keep too, checkout with Stripe (card, PromptPay) or bank transfer, orders made exactly once however often a payment is confirmed, stock taken safely and put back on cancel or refund, customer accounts, order emails, `order.*` events, a dashboard panel, and a client for pages with React hooks and Vue composables. With the multi-tenant plugin, each tenant is a shop of its own.
  
  New in the core, for other uses too: site members (`auth.members`) who sign in on the site and never get into the admin, with sign-up, email confirmation and the site's own pages for email links (`isLoggedIn` no longer counts them; `isSignedIn` does); `update()` with `where` (compare and set) and `cms.increment()`; `jobs` that run with the scheduled jobs; `events` and `cms.emit()` for webhooks; menu headings of your own (`admin.group` with a label); list cells get their row's `doc`; plugin collections are typed in configs without `collections`. The form builder's spam checks moved to the core (`formToken`, `checkFormToken`, `rateKeys`, `honeypotName`, `verifyTurnstile`).
  
  Signing up adds an `emailVerified` field to users: create a migration (`easy-cms migrate:create`) before deploying.

## 0.45.0

### Minor Changes

- 56a926b: Multi-tenant, more complete. Uploads accept only the tenant's files, and media folders opened by an upload field's `folder` key are each tenant's own. Nested pages, redirects and forms work per tenant: paths, redirects and form slugs only differ within a tenant, `findByPath()`, `getTree()` and `resolveRedirect()` take a `context`, and documents a plugin writes take the tenant of what they point to. Admins of a tenant see its audit log. Deleting a tenant shows what goes with it and asks for its name. New documents start in the chosen tenant, and lists show a Tenant column while all tenants are shown.
  
  New in the core, for other uses too: `filterOptions` on upload fields; `uniqueWithin` with several fields; `cms.uniqueScope()`; `audit.scope`; `admin.confirmDelete` on collections; `admin.defaultValue`, `admin.column` and `admin.allowCreate` on fields; relationship columns in lists.
  
  Projects with `audit` get a `scope` column: create a migration (`easy-cms migrate:create`) before deploying.

## 0.44.0

### Minor Changes

- 40bd4bc: New plugin: `@easy-cms/plugin-multi-tenant`, several sites or clients in one CMS. A `tenants` collection, a `tenant` on the documents of the collections you name, members with a role in each tenant (Settings → Members), globals with a value per tenant, a tenant switcher in the admin, frontends that name their tenant by header, `?tenant=` or domain, API keys that keep their tenant, and `easy-cms tenants:assign`. New guide: Multi-tenant.
  
  The core gains what it is built on, for other uses too: `onRequest` in the config gives each request a `context` (and may change its user), which access rules, hooks, `filterOptions` and the Local API (`context`, `cms.forRequest(request)`) receive; `scoped` users and `isSystemAdmin()`; globals with a value per `scope`; `uniqueWithin` on any unique field, with a unique index per scope; and `admin.switcher`.
  
  The SEO plugin's sitemap and llms.txt read in the request's context (e.g. the tenant of the domain); `sitemap()`, `sitemapXml()`, `llmsTxt()` and `llmsFullTxt()` take a `context`.
  
  Projects with the nested-docs plugin get a unique index on `(parent, slug)`: create a migration (`easy-cms migrate:create`) before deploying.

## 0.43.0

No changes in this release.

## 0.42.0

### Minor Changes

- 4afac22: A kit for running Easy CMS inside any framework that handles Web `Request`s: `sharedEasyCMS(config)` (one instance per server, compared by structure, kept across hot reloads), `createApiHandler(config, { trustProxy })` (the REST API on it), `cms.auth.userFromHeaders(headers)`, and `adminHandlerFor(resolvedConfig)` in `@easy-cms/admin`. The Next.js and Nuxt packages and the standalone server now use it; Nuxt compares configs by structure like Next.js. New guide: Other frameworks.

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

### Patch Changes

- 63f0116: The CSRF check also accepts an Origin matching the request's public host (`x-forwarded-host` or `host`), so admin writes work behind proxies whose request URL names an internal host, like Netlify's (the first-admin setup said "CSRF check failed: untrusted origin").

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

No changes in this release.

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

### Patch Changes

- f3c65cd: Backups: older backups are removed before a new one is marked done, so the list never shows more than `keep` finished backups (it briefly showed one more).

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
