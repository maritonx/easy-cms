# @easy-cms/admin

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
