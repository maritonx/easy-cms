# Config reference

Every option of `easy-cms.config.ts`, grouped by where it goes. For explanations and examples,
follow the links to the guide. A test checks this page against the types in `@easy-cms/core`,
so every option is listed here.

Easy CMS checks the config when it starts. An option that was renamed is an error that names the
new one (e.g. ``admin.siteUrl is now `siteURL` ``), so an upgrade can't quietly drop a setting. An
option Easy CMS doesn't know is logged as a warning with the closest name (``did you mean
`maxLength`?``).

```ts
import { defineConfig } from '@easy-cms/core'

export default defineConfig({ secret, db, collections, /* … */ })
```

<!-- api: Config -->
## Top level

| Option | Type | Default | |
|---|---|---|---|
| `secret` | `string` | — | **Required**, 32+ characters. Signs sessions and preview tokens. |
| `db` | `DatabaseAdapter` | — | **Required**. `sqlite()` or `postgres()`. [Databases](/guide/databases) |
| `serverURL` | `string` | — | Public origin (`https://example.com`); makes media URLs absolute. |
| `cors` | `string[] \| '*'` | `[]` | Origins whose browser code may call the API. [Security](/guide/security) |
| `cronSecret` | `string` | `CRON_SECRET` | Bearer secret for `GET <api>/jobs/run`. [Scheduling](/guide/drafts#scheduled-publishing) |
| `webhooks` | `WebhookConfig[]` | `[]` | See [webhooks](#webhooks). |
| `events` | `string[]` | `[]` | Events of the app or its plugins besides content changes (`<area>.<what>`, e.g. `order.paid`), sent with `cms.emit()` to webhooks that list them. [Webhooks](/guide/webhooks#your-own-events) |
| `jobs` | `JobConfig[]` | `[]` | Work run with the scheduled jobs, e.g. a plugin's clean-up. See [jobs](#jobs). |
| `localization` | `LocalizationConfig \| false` | — | See [localization](#localization). |
| `routes` | `RoutesConfig` | | See [routes](#routes). |
| `admin` | `AdminConfig` | | See [admin](#admin). |
| `upload` | `UploadConfig` | | See [upload](#upload). |
| `auth` | `AuthConfig` | | See [auth](#auth). |
| `collections` | `CollectionConfig[]` | `[]` | See [collections](#collections). |
| `globals` | `GlobalConfig[]` | `[]` | See [globals](#globals). |
| `endpoints` | `Endpoint[]` | `[]` | See [endpoints](#endpoints). |
| `cliCommands` | `CliCommand[]` | `[]` | `easy-cms <name>` commands, e.g. from plugins: `{ name, description, help?, run({ cms, args, log }) }`. [CLI](/guide/cli#commands-from-plugins) |
| `onRequest` | `({ headers, url, user, cms }) => { context?, user? }` | — | Runs on each API request once its user is known: returns the request's `context` (e.g. its tenant) and may change the user (their role there, `scoped`). Usually set by a plugin. [Multi-tenant](/guide/multi-tenant#how-it-works) |
| `apiKeys` | `boolean` | `false` | API keys under Settings, for scripts and other apps. [API keys](/guide/api-keys) |
| `email` | `EmailAdapter` | — | Sends email for plugins, e.g. `smtp()` or `consoleEmail()`. [Email](/guide/email) |
| `backups` | `BackupsConfig` | by hand only | Database backups on a schedule. See [backups](#backups). |
| `audit` | `boolean \| AuditConfig` | off | The audit log: who changed what, sign-ins, admin actions. See [audit](#audit). |
| `plugins` | `Plugin[]` | `[]` | `(config) => config`, run in order before validation; `definePlugin(fn, { name, version })` names one for the dashboard. [Plugins](/guide/plugins) |
| `fieldTypes` | `FieldTypeDefinition[]` | `[]` | Field types from packages, e.g. `color` from `@easy-cms/fields`. [Custom field types](/guide/field-types) |

<!-- api: RoutesConfig -->
## routes

| Option | Type | Default | |
|---|---|---|---|
| `api` | `string` | `/api/cms` | Where the REST API is served. |

<!-- api: AdminConfig -->
## admin

| Option | Type | Default | |
|---|---|---|---|
| `path` | `string` | `/admin` | Where the admin is served. |
| `locale` | `'en' \| 'th'` | `en` | Default admin language before a user picks one. |
| `brand` | `AdminBrand` | `{}` | See [brand](#brand). |
| `siteURL` | `string` | `/` (Nuxt, Next.js) | The public site for "View site": a path or an `http(s)` URL. |
| `nav` | `NavGroup[]` | — | The menu's groups: `{ id, label, icon?, order?, children? }`, children one level deep. Built in: `content`, `settings` (`site`, `people`, `system`). [The admin](/guide/admin#the-menu) |
| `commands` | `{ label, href, icon?, keywords? }[]` | — | More entries of the command palette (⌘K) that open a page of the admin. |
| `modules` | `string[]` | `[]` | Admin modules with Web Components: package exports or paths. [Admin components](/guide/plugins#admin-components) |
| `pages` | `AdminPage[]` | `[]` | Pages of their own at `<admin>/p/<path>`, e.g. from plugins. See [pages](#pages). |
| `dashboard` | `DashboardWidget[]` | `[]` | Panels on the dashboard after the built-in ones. See [dashboard](#dashboard). |
| `switcher` | `{ cookie, label, options } \| false` | — | A choice at the top of the menu for the whole admin, e.g. the tenant, kept in a cookie. `options`: a path under the API returning `{ options: [{ value, label }], all? }`. Usually set by a plugin. |

<!-- api: AdminBrand -->
### brand

| Option | Type | |
|---|---|---|
| `name` | `string` | Shown in the menu, login page and browser tab. Default "Easy CMS". |
| `logo` | `string` | A path on your site or an `https://` URL. |
| `color` | `string` | Main color as `#rrggbb`; shades are derived. |

<!-- api: AdminPage -->
### pages

| Option | Type | |
|---|---|---|
| `path` | `string` | **Required**. Lowercase letters, digits and `-`, unique: the page is at `<admin>/p/<path>`. |
| `component` | `AdminComponent` | **Required**. The page's body; the admin draws the header. |
| `label` | `string \| { en, th }` | **Required**. Title in the header, the menu and the browser tab. |
| `icon` | `AdminIcon` | Menu icon. Default `file-text`. |
| `group` | `'content' \| 'settings' \| false \| string` | Its menu group: `content`, `settings`, a group's id (`admin.nav`) or a label; `false`: not listed. Default `content`. |
| `order` | `number` | Its place in its menu group: lower first. Those without one come after, in config order. |
| `access` | `({ user }) => boolean` | Who may open it, checked on the server. Default: every logged-in user. |

<!-- api: DashboardWidget -->
### dashboard

| Option | Type | |
|---|---|---|
| `component` | `AdminComponent` | **Required**. The panel's content. |
| `width` | `'half' \| 'full'` | `half` (default): the side column; `full`: below both columns. One column on phones. |
| `label` | `Label` | Its name in Settings → Roles (`auth.rbac`). Default: the component's tag. |
| `access` | `({ user }) => boolean` | Who sees it, checked on the server. Default: every logged-in user. |

[Pages and dashboard panels](/guide/plugins#pages-and-dashboard-panels) shows how to write them.

<!-- api: BackupsConfig -->
## backups

| Option | Type | Default | |
|---|---|---|---|
| `frequency` | `'daily' \| 'weekly'` | — | Back up automatically. Without it, admins back up by hand. |
| `at` | `string` | `03:00` | When, as `HH:MM` in the server's time zone. |
| `keep` | `number` | `7` | Finished backups to keep; older ones are deleted. |
| `dir` | `string` | `backups` | Folder for the default local storage. Never served publicly. |
| `storage` | `StorageAdapter` | local disk | E.g. `s3Storage()` with a private bucket. |
| `sqlite` | `(options) => DatabaseAdapter` | — | Postgres only: `sqlite` from `@easy-cms/db-sqlite`, which writes the backup file. [Backups](/guide/backups#from-the-admin) |

<!-- api: AuditConfig -->
## audit

| Option | Type | Default | |
|---|---|---|---|
| `keepDays` | `number` | `365` | Days to keep entries; older ones are deleted. `0`: keep them all. |
| `values` | `boolean` | `true` | Keep values before and after a change; `false`: only which fields changed. |
| `failedLogins` | `number` | `20` | Failed sign-ins within an hour that the dashboard warns about. [Audit log](/guide/audit-log) |
| `scope` | `({ context, user }) => string \| null` | — | The part of the site an entry belongs to, e.g. its tenant (usually set by a plugin). Admins of a part (`scoped`) see its entries; others the chosen part's, or all. |

<!-- api: AuthConfig -->
## auth

| Option | Type | Default | |
|---|---|---|---|
| `roles` | `string[]` | `['admin', 'editor']` | Must include `admin`. With `rbac`, the roles that always exist. [Users & auth](/guide/auth) |
| `rbac` | `boolean` | `false` | Roles and their permissions from the admin (Settings → Roles), on top of access rules. [Roles](/guide/roles) |
| `providers` | `AuthProvider[]` | `[]` | Signing in to the admin with outside accounts, e.g. `[google()]` from `@easy-cms/auth-oauth`. [Single sign-on](/guide/sso) |
| `providerSignUp` | `{ domains, role? }` | — | With `providers`: people from these email domains get an account on their first sign-in, with `role` (not `admin`). |
| `password` | `boolean` | `true` | `false`: only admins sign in with a password; everyone else uses `providers`. |
| `setupCode` | `string` | `EASY_CMS_SETUP_CODE` | The code the first admin must enter on `/admin`, so nobody else claims a fresh site. Without one, no code is asked. [One-click deploy](/guide/one-click-deploy) |
| `tokenExpiration` | `number` | `604800` (7 days) | Session lifetime in seconds. |
| `maxLoginAttempts` | `number` | `5` | Failed logins allowed per email (and IP) within `lockWindow`. |
| `lockWindow` | `number` | `900` (15 minutes) | In seconds. |
| `trustedOrigins` | `string[]` | `[]` | Other origins that may send cookie-authenticated requests. |
| `resetPasswordExpiration` | `number` | `3600` | Seconds a "forgot password" link works. Links need `email`, and `serverURL` in production. [Forgotten passwords](/guide/auth#forgotten-passwords-and-invitations) |
| `inviteExpiration` | `number` | `604800` | Seconds an invitation link works. |
| `emails` | `{ resetPassword?, invite?, passwordChanged? }` | — | Functions `({ user, url, locale, expiresAt }) => { subject, text, html? }` for your own email text. |
| `members` | `MembersConfig` | — | People who sign in on the site, not the admin, e.g. customers. See [members](#members). |

<!-- api: MembersConfig -->
### members

| Option | Type | |
|---|---|---|
| `roles` | `string[]` | Their roles, also in `roles`. Members never get into the admin, and `isLoggedIn` (every collection's default) doesn't count them. [Site members](/guide/members) |
| `signUp` | `MembersSignup` | Visitors create their own account: `POST <api>/users/signup`. |
| `pages` | `{ verifyEmail?, resetPassword? }` | The site's pages that open members' email links with `?token=`: paths on `admin.siteURL` (else `serverURL`) or URLs. Default: the admin's pages. |
| `emails` | `{ verifyEmail? }` | Your own text for the email that confirms an address. |

<!-- api: MembersSignup -->
#### signUp

| Option | Type | Default | |
|---|---|---|---|
| `role` | `string` | — | The role new accounts get: one of `members.roles`. |
| `verifyEmail` | `boolean` | `true` | New accounts confirm their email with a link before signing in. |
| `turnstile` | `{ siteKey, secretKey }` | — | Cloudflare Turnstile, checked on every sign-up. |

<!-- api: UploadConfig -->
## upload

| Option | Type | Default | |
|---|---|---|---|
| `dir` | `string` | `uploads` | Folder for the default local storage, from the project root. |
| `maxFileSize` | `number` | `10485760` (10 MB) | In bytes. |
| `mimeTypes` | `string[]` | `['image/*', 'application/pdf']` | Allowed types, detected from file contents: MIME types, `type/*`, or `documents`, `office`, `archives`. See [File types](/guide/uploads#file-types). |
| `storage` | `StorageAdapter` | local disk | E.g. `s3Storage()` from `@easy-cms/storage-s3`. [Uploads](/guide/uploads) |
| `imageSizes` | `ImageSize[]` | `[]` | Resized copies (needs `sharp`). See [image sizes](#image-sizes). |
| `fromURL` | `UploadFromURLConfig` | off | Uploads from links. See [fromURL](#fromurl). |
| `privateStorage` | `StorageAdapter` | `storage` without public URLs | Where files in private folders go. See [Private folders](/guide/uploads#private-folders). |
| `folders` | `boolean` | `false` | Folders in the media library, and with `auth.rbac` who can use each. See [Folders](/guide/uploads#folders). |

<!-- api: UploadFromURLConfig -->
### fromURL

| Option | Type | |
|---|---|---|
| `allowedHosts` | `string[]` | **Required**. `images.example.com`, `*.example.com` (subdomains) or `*` (any public host). |
| `allowPrivate` | `boolean` | Also private network addresses (`localhost`, `10.x`…). Default `false`. [Read first](/guide/uploads#from-a-link) |

<!-- api: ImageSize -->
### Image sizes

| Option | Type | Default | |
|---|---|---|---|
| `name` | `string` | — | Key in `media.sizes`, e.g. `thumbnail`. |
| `width` | `number` | — | Width in pixels. |
| `height` | `number` | — | Optional height. |
| `fit` | `'cover' \| 'contain' \| 'inside'` | `cover` | How to fit when both width and height are set. |

<!-- api: LocalizationConfig -->
## localization

| Option | Type | Default | |
|---|---|---|---|
| `locales` | `string[]` | — | Content locales, e.g. `['th', 'en']`. [Localization](/guide/localization) |
| `defaultLocale` | `string` | the first locale | Used when no locale is given; its values fill empty ones. |
| `fallback` | `boolean` | `true` | Reads return the default locale's value when a value is empty. |

<!-- api: WebhookConfig -->
## webhooks

| Option | Type | Default | |
|---|---|---|---|
| `url` | `string` | — | Where to POST events. [Webhooks](/guide/webhooks) |
| `events` | `string[]` | all | `create`, `update`, `delete`, `publish`, `unpublish`, `draft`. |
| `collections` | `string[]` | all but `users` | Collections to send events for; `[]` for none. List `users` to get user accounts. |
| `globals` | `string[]` | all | Globals to send events for; `[]` for none. |
| `secret` | `string` | — | Signs bodies: `x-easy-cms-signature: sha256=<hex>`. |
| `headers` | `Record<string, string>` | — | Extra request headers. |

`events` also takes the config's own `events` (e.g. `order.paid`): those are sent only to webhooks
that list them.

<!-- api: JobConfig -->
## jobs

| Option | Type | |
|---|---|---|
| `name` | `string` | Unique, lowercase with `-` and `:`, e.g. `shop:carts`. |
| `every` | `number` | At most this often, in seconds; when each last ran is kept in the database. Default: every run. |
| `run` | `({ cms, now }) => unknown` | The work. A failure is logged; the other jobs still run. |

They run with the scheduled jobs: every minute in a server, or each time a cron calls
`GET <api>/jobs/run`.

<!-- api: CollectionConfig -->
## collections

| Option | Type | Default | |
|---|---|---|---|
| `slug` | `string` | — | **Required**. URL and table name: lowercase letters, digits, `-`, `_`. |
| `fields` | `Field[]` | — | **Required**. See the [field reference](./fields). |
| `labels` | `{ singular?, plural? }` | from the slug | Each a string or `{ en, th }`. |
| `useAsTitle` | `string` | — | Top-level field shown as the document title. |
| `drafts` | `boolean` | `false` | Adds `status` (`draft` \| `published`). [Drafts](/guide/drafts) |
| `versions` | `boolean \| VersionsConfig` | `false` | Keep a version of every save. See [versions](#versions). |
| `schedule` | `boolean` | `false` | Publish and unpublish at a set time (needs `drafts`). |
| `preview` | `({ doc, locale }) => string \| null` | — | The page showing a document, for [live preview](/guide/live-preview). |
| `access` | `{ read?, create?, update?, delete? }` | logged in | [Access control](/guide/access-control) |
| `hooks` | `CollectionHooks` | — | See [hooks](#hooks). |
| `admin` | `CollectionAdmin` | — | See [admin components](#admin-components). |

<!-- api: VersionsConfig -->
### versions

| Option | Type | Default | |
|---|---|---|---|
| `keep` | `number` | `50` | Versions kept per document; older ones are deleted. |

<!-- api: CollectionHooks -->
### hooks

Each is a list of functions. [Hooks](/guide/hooks)

| Hook | Arguments | Return |
|---|---|---|
| `beforeValidate` | `data`, `operation`, `previousDoc?` | new data, or nothing |
| `beforeChange` | `data`, `operation`, `previousDoc?` | new data, or nothing |
| `afterChange` | `doc`, `operation`, `previousDoc?` | — |
| `beforeDelete` | `id` | — |
| `afterDelete` | `id`, `doc` | — |
| `afterRead` | `doc` | new doc, or nothing |

Every hook also gets `user`, `cms` and `slug`.

<!-- api: CollectionAdmin -->
### Admin components

| Option | Type | |
|---|---|---|
| `icon` | `AdminIcon` | Menu icon. Default `file-text`. [Branding](/guide/configuration#branding-the-admin) |
| `order` | `number` | Its place in its menu group: lower first. Those without one come after, in config order. |
| `editIn` | `'page' \| 'drawer'` | `drawer` edits in a panel over the list (without drafts, versions or preview). Default `page`. |
| `sidebar` | `SidebarPanel[]` | Panels in the edit page's side column; `{ tag, props, position: 'top' }` puts one above the rest. [Admin components](/guide/plugins#admin-components) |
| `group` | `string \| Label \| false` | Its menu group: a group's id (`admin.nav`, e.g. `shop.catalog`), `settings` (Settings › Site), or a label that makes a group of that name; `false`: not in the menu, reached by links. Default: Content. [The admin](/guide/admin#the-menu) |
| `layout` | `LayoutNode[]` | Tabs, sections that fold and rows of the edit page, by field name. [The admin](/guide/admin#edit-pages) |
| `badge` | `{ where, tone?, label? }` | A number beside its menu item: the documents matching `where` that the user may read, e.g. orders to send. |
| `count` | `boolean` | The number of documents beside its menu item. Default `true`. |
| `empty` | `{ description?, link? }` | What the list says before it has documents, and a link (`{ label, href }`). |
| `list` | `{ tree?, sort? }` | The list page: `tree` names a relationship to the same collection to show a tree (top-level documents first, children open below); `sort` is the default order, e.g. `'title'`. |
| `ownerField` | `string` | With `auth.rbac`: a relationship field to `users` naming the owner, e.g. `'author'`, for roles given "own documents only". Default: who created it (`createdBy`). [Roles](/guide/roles#own-documents-only) |
| `confirmDelete` | `{ typeTitle?, impact? }` | Deleting asks more: `typeTitle` has the user type the title; `impact` is a path under the API, called with `?id=`, returning `{ message }` about what goes too. No deleting from a selection. |

<!-- api: GlobalConfig -->
## globals

| Option | Type | Default | |
|---|---|---|---|
| `slug` | `string` | — | **Required**. |
| `fields` | `Field[]` | — | **Required**. |
| `label` | `string \| { en, th }` | from the slug | |
| `drafts` | `boolean` | `false` | |
| `versions` | `boolean \| VersionsConfig` | `false` | |
| `schedule` | `boolean` | `false` | Needs `drafts`. |
| `preview` | `({ doc, locale }) => string \| null` | — | |
| `access` | `{ read?, update? }` | logged in | |
| `scope` | `({ context, user }) => string \| null \| undefined` | — | One value per scope, e.g. per tenant: a string keeps a value of its own, `undefined` the shared one, `null` none (reads give it empty, changes are refused). |
| `hooks` | `GlobalHooks` | — | See below. |
| `admin` | `ContainerAdmin` | — | `{ icon, order, group, sidebar, layout }`, as for collections. Default icon `settings`, group Settings › Site. |

<!-- api: GlobalHooks -->
### Global hooks

| Hook | Arguments | Return |
|---|---|---|
| `beforeValidate` | `data`, `operation`, `previousDoc?` | new data, or nothing |
| `beforeChange` | `data`, `operation`, `previousDoc?` | new data, or nothing |
| `afterChange` | `doc`, `operation`, `previousDoc?` | — |
| `afterRead` | `doc` | new doc, or nothing |

<!-- api: Endpoint -->
## endpoints

| Option | Type | |
|---|---|---|
| `path` | `string` | Under `routes.api`, e.g. `/seo/generate` or `/stats/:collection`. |
| `method` | `'get' \| 'post' \| 'put' \| 'patch' \| 'delete'` | |
| `handler` | `(request: EndpointRequest) => unknown` | Returns a `Response`, or a value sent as JSON. [Endpoints](/guide/plugins#endpoints) |
| `root` | `boolean` | Serve the path from the site's root (standalone server only), e.g. `/robots.txt`. Default `false`. |

<!-- api: EndpointRequest -->
### EndpointRequest

| Property | Type | |
|---|---|---|
| `request` | `Request` | The Web request. |
| `url` | `URL` | Its URL. |
| `params` | `Record<string, string>` | Values of `:name` segments. |
| `user` | `AuthUser \| null` | The logged-in user. |
| `context` | `RequestContext` | The request's context (`onRequest`); pass it to the Local API with `user`. |
| `ip` | `string \| undefined` | The client's IP address, when the adapter knows it. |
| `cms` | `EasyCMS` | The [Local API](./local-api). |
| `json` | `() => Promise<object>` | The JSON body (an object, at most 1 MB). |
| `text` | `() => Promise<string>` | The body as sent, as text (at most 1 MB), e.g. to check a webhook's signature. |
