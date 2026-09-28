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
| `apiKeys` | `boolean` | `false` | API keys under Settings, for scripts and other apps. [API keys](/guide/api-keys) |
| `plugins` | `Plugin[]` | `[]` | `(config) => config`, run in order before validation. [Plugins](/guide/plugins) |

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

<!-- api: AdminBrand -->
### brand

| Option | Type | |
|---|---|---|
| `name` | `string` | Shown in the menu, login page and browser tab. Default "Easy CMS". |
| `logo` | `string` | A path on your site or an `https://` URL. |
| `color` | `string` | Main color as `#rrggbb`; shades are derived. |

<!-- api: AuthConfig -->
## auth

| Option | Type | Default | |
|---|---|---|---|
| `roles` | `string[]` | `['admin', 'editor']` | Must include `admin`. [Users & auth](/guide/auth) |
| `tokenExpiration` | `number` | `604800` (7 days) | Session lifetime in seconds. |
| `maxLoginAttempts` | `number` | `5` | Failed logins allowed per email (and IP) within `lockWindow`. |
| `lockWindow` | `number` | `900` (15 minutes) | In seconds. |
| `trustedOrigins` | `string[]` | `[]` | Other origins that may send cookie-authenticated requests. |

<!-- api: UploadConfig -->
## upload

| Option | Type | Default | |
|---|---|---|---|
| `dir` | `string` | `uploads` | Folder for the default local storage, from the project root. |
| `maxFileSize` | `number` | `10485760` (10 MB) | In bytes. |
| `mimeTypes` | `string[]` | `['image/*', 'application/pdf']` | Allowed types, detected from file contents. |
| `storage` | `StorageAdapter` | local disk | E.g. `s3Storage()` from `@easy-cms/storage-s3`. [Uploads](/guide/uploads) |
| `imageSizes` | `ImageSize[]` | `[]` | Resized copies (needs `sharp`). See [image sizes](#image-sizes). |

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
| `cms` | `EasyCMS` | The [Local API](./local-api). |
| `json` | `() => Promise<object>` | The JSON body (an object, at most 1 MB). |
