# Config reference

Every option of `easy-cms.config.ts`, grouped by where it goes. For explanations and examples,
follow the links to the guide. A test checks this page against the types in `@easy-cms/core`,
so every option is listed here.

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
| `localization` | `LocalizationConfig` | — | See [localization](#localization). |
| `routes` | `RoutesConfig` | | See [routes](#routes). |
| `admin` | `AdminConfig` | | See [admin](#admin). |
| `upload` | `UploadConfig` | | See [upload](#upload). |
| `auth` | `AuthConfig` | | See [auth](#auth). |
| `collections` | `CollectionConfig[]` | `[]` | See [collections](#collections). |
| `globals` | `GlobalConfig[]` | `[]` | See [globals](#globals). |
| `endpoints` | `Endpoint[]` | `[]` | See [endpoints](#endpoints). |
| `commands` | `CliCommand[]` | `[]` | `easy-cms <name>` commands, e.g. from plugins: `{ name, description, help?, run({ cms, args, log }) }`. [CLI](/guide/cli#commands-from-plugins) |
| `apiKeys` | `boolean` | `false` | API keys under Settings, for scripts and other apps. [API keys](/guide/api-keys) |
| `email` | `EmailAdapter` | — | Sends email for plugins, e.g. `smtp()` or `consoleEmail()`. [Email](/guide/email) |
| `backups` | `BackupsConfig` | by hand only | Database backups on a schedule. See [backups](#backups). |
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
| `siteUrl` | `string` | `/` (Nuxt, Next.js) | The public site for "View site": a path or an `http(s)` URL. |
| `menu` | `string[]` | config order | Collection slugs in menu order; unlisted ones follow, media last. |
| `modules` | `string[]` | `[]` | Admin modules with Web Components: package exports or paths. [Admin components](/guide/plugins#admin-components) |
| `pages` | `AdminPage[]` | `[]` | Pages of their own at `<admin>/p/<path>`, e.g. from plugins. See [pages](#pages). |
| `dashboard` | `DashboardWidget[]` | `[]` | Panels on the dashboard after the built-in ones. See [dashboard](#dashboard). |

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
| `group` | `'content' \| 'settings' \| false` | Where it is in the menu; `false`: not listed. Default `content`. |
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
| `every` | `'day' \| 'week'` | — | Back up automatically. Without it, admins back up by hand. |
| `at` | `string` | `03:00` | When, as `HH:MM` in the server's time zone. |
| `keep` | `number` | `7` | Finished backups to keep; older ones are deleted. |
| `dir` | `string` | `backups` | Folder for the default local storage. Never served publicly. |
| `storage` | `StorageAdapter` | local disk | E.g. `s3Storage()` with a private bucket. |
| `sqlite` | `(options) => DatabaseAdapter` | — | Postgres only: `sqlite` from `@easy-cms/db-sqlite`, which writes the backup file. [Backups](/guide/backups#from-the-admin) |

<!-- api: AuthConfig -->
## auth

| Option | Type | Default | |
|---|---|---|---|
| `roles` | `string[]` | `['admin', 'editor']` | Must include `admin`. With `rbac`, the roles that always exist. [Users & auth](/guide/auth) |
| `rbac` | `boolean` | `false` | Roles and their permissions from the admin (Settings → Roles), on top of access rules. [Roles](/guide/roles) |
| `providers` | `AuthProvider[]` | `[]` | Signing in to the admin with outside accounts, e.g. `[google()]` from `@easy-cms/auth-oauth`. [Single sign-on](/guide/sso) |
| `allowSignUp` | `{ domains, role? }` | — | With `providers`: people from these email domains get an account on their first sign-in, with `role` (not `admin`). |
| `password` | `boolean` | `true` | `false`: only admins sign in with a password; everyone else uses `providers`. |
| `tokenExpiration` | `number` | `604800` (7 days) | Session lifetime in seconds. |
| `maxLoginAttempts` | `number` | `5` | Failed logins allowed per email (and IP) within `lockWindow`. |
| `lockWindow` | `number` | `900` (15 minutes) | In seconds. |
| `trustedOrigins` | `string[]` | `[]` | Other origins that may send cookie-authenticated requests. |
| `resetPasswordExpiration` | `number` | `3600` | Seconds a "forgot password" link works. Links need `email`, and `serverURL` in production. [Forgotten passwords](/guide/auth#forgotten-passwords-and-invitations) |
| `inviteExpiration` | `number` | `604800` | Seconds an invitation link works. |
| `emails` | `{ resetPassword?, invite?, passwordChanged? }` | — | Functions `({ user, url, locale, expiresAt }) => { subject, text, html? }` for your own email text. |

<!-- api: UploadConfig -->
## upload

| Option | Type | Default | |
|---|---|---|---|
| `dir` | `string` | `uploads` | Folder for the default local storage, from the project root. |
| `maxFileSize` | `number` | `10485760` (10 MB) | In bytes. |
| `mimeTypes` | `string[]` | `['image/*', 'application/pdf']` | Allowed types, detected from file contents. |
| `storage` | `StorageAdapter` | local disk | E.g. `s3Storage()` from `@easy-cms/storage-s3`. [Uploads](/guide/uploads) |
| `imageSizes` | `ImageSize[]` | `[]` | Resized copies (needs `sharp`). See [image sizes](#image-sizes). |
| `fromURL` | `UploadFromURLConfig` | off | Uploads from links. See [fromURL](#fromurl). |

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
| `collections` | `string[]` | all | Collections to send events for; `[]` for none. |
| `globals` | `string[]` | all | Globals to send events for; `[]` for none. |
| `secret` | `string` | — | Signs bodies: `x-easy-cms-signature: sha256=<hex>`. |
| `headers` | `Record<string, string>` | — | Extra request headers. |

<!-- api: CollectionConfig -->
## collections

| Option | Type | Default | |
|---|---|---|---|
| `slug` | `string` | — | **Required**. URL and table name: lowercase letters, digits, `-`, `_`. |
| `fields` | `Field[]` | — | **Required**. See the [field reference](./fields). |
| `labels` | `{ singular?, plural? }` | from the slug | Each a string or `{ en, th }`. |
| `icon` | `AdminIcon` | `file-text` | Menu icon. [Branding](/guide/configuration#branding-the-admin) |
| `useAsTitle` | `string` | — | Top-level field shown as the document title. |
| `editIn` | `'page' \| 'drawer'` | `page` | `drawer` edits in a panel over the list (without drafts, versions or preview). |
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
| `max` | `number` | `50` | Versions kept per document; older ones are deleted. |

<!-- api: CollectionHooks -->
### hooks

Each is a list of functions. [Hooks](/guide/hooks)

| Hook | Arguments | Return |
|---|---|---|
| `beforeValidate` | `data`, `operation`, `originalDoc?` | new data, or nothing |
| `beforeChange` | `data`, `operation`, `originalDoc?` | new data, or nothing |
| `afterChange` | `doc`, `operation`, `previousDoc?` | — |
| `beforeDelete` | `id` | — |
| `afterDelete` | `id`, `doc` | — |
| `afterRead` | `doc` | new doc, or nothing |

Every hook also gets `user`, `cms` and `slug`.

<!-- api: CollectionAdmin -->
### Admin components

| Option | Type | |
|---|---|---|
| `sidebar` | `AdminComponent[]` | Panels in the edit page's side column. [Admin components](/guide/plugins#admin-components) |
| `group` | `'settings'` | List the collection under Settings in the menu, with Users and API keys. |
| `list` | `{ tree?, sort? }` | The list page: `tree` names a relationship to the same collection to show a tree (top-level documents first, children open below); `sort` is the default order, e.g. `'title'`. |
| `ownerField` | `string` | With `auth.rbac`: a relationship field to `users` naming the owner, e.g. `'author'`, for roles given "own documents only". Default: who created it (`createdBy`). [Roles](/guide/roles#own-documents-only) |

<!-- api: GlobalConfig -->
## globals

| Option | Type | Default | |
|---|---|---|---|
| `slug` | `string` | — | **Required**. |
| `fields` | `Field[]` | — | **Required**. |
| `label` | `string \| { en, th }` | from the slug | |
| `icon` | `AdminIcon` | `settings` | Menu icon. |
| `drafts` | `boolean` | `false` | |
| `versions` | `boolean \| VersionsConfig` | `false` | |
| `schedule` | `boolean` | `false` | Needs `drafts`. |
| `preview` | `({ doc, locale }) => string \| null` | — | |
| `access` | `{ read?, update? }` | logged in | |
| `hooks` | `GlobalHooks` | — | See below. |
| `admin` | `ContainerAdmin` | — | `{ sidebar }`, as for collections. |

<!-- api: GlobalHooks -->
### Global hooks

| Hook | Arguments | Return |
|---|---|---|
| `beforeChange` | `data`, `operation`, `originalDoc?` | new data, or nothing |
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
| `ip` | `string \| undefined` | The client's IP address, when the adapter knows it. |
| `cms` | `EasyCMS` | The [Local API](./local-api). |
| `json` | `() => Promise<object>` | The JSON body (an object, at most 1 MB). |
