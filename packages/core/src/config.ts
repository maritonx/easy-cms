import type { AuthUser, CollectionAccess, GlobalAccess, ID, RequestContext } from './access.js'
import type { AuditConfig } from './audit.js'
import type { PasswordEmailFn } from './auth/emails.js'
import type { AuthProvider } from './auth/providers.js'
import type { DatabaseAdapter } from './database.js'
import type { EmailAdapter } from './email.js'
import type { FieldTypeDefinition } from './field-types.js'
import type { AdminComponent, Field, Label } from './fields.js'
import type { EasyCMS } from './local-api.js'
import type { StorageAdapter } from './storage.js'
import type { WebhookConfig } from './webhooks.js'

type Data = Record<string, unknown>
type MaybePromise<T> = T | Promise<T>

export type Operation = 'create' | 'update'

interface HookBase {
  /** The user the operation runs for; `null` for anonymous or trusted Local API calls. */
  readonly user: AuthUser | null
  /** The Local API, e.g. to query other collections or trigger a revalidation. */
  readonly cms: EasyCMS
  /** Slug of the collection or global. */
  readonly slug: string
  /** The request's context (`onRequest`, or `context` of a Local API call); `{}` when there is none. */
  readonly context: RequestContext
}

export type BeforeValidateHook = (
  args: HookBase & { data: Data; operation: Operation; originalDoc?: Data },
) => MaybePromise<Data | undefined>

export type BeforeChangeHook = (
  args: HookBase & { data: Data; operation: Operation; originalDoc?: Data },
) => MaybePromise<Data | undefined>

export type AfterChangeHook = (
  args: HookBase & { doc: Data; operation: Operation; previousDoc?: Data },
) => MaybePromise<void>

export type BeforeDeleteHook = (args: HookBase & { id: ID }) => MaybePromise<void>

export type AfterDeleteHook = (args: HookBase & { id: ID; doc: Data }) => MaybePromise<void>

export type AfterReadHook = (args: HookBase & { doc: Data }) => MaybePromise<Data | undefined>

export interface CollectionHooks {
  readonly beforeValidate?: readonly BeforeValidateHook[]
  readonly beforeChange?: readonly BeforeChangeHook[]
  readonly afterChange?: readonly AfterChangeHook[]
  readonly beforeDelete?: readonly BeforeDeleteHook[]
  readonly afterDelete?: readonly AfterDeleteHook[]
  readonly afterRead?: readonly AfterReadHook[]
}

export interface GlobalHooks {
  readonly beforeChange?: readonly BeforeChangeHook[]
  readonly afterChange?: readonly AfterChangeHook[]
  readonly afterRead?: readonly AfterReadHook[]
}

export interface LocalizationConfig {
  /** Content locales, e.g. `['th', 'en']`. */
  readonly locales: readonly string[]
  /** The locale used when none is given; its values also fill empty ones. Default: the first. */
  readonly defaultLocale?: string
  /** Reads return the default locale's value when a locale's value is empty. Default true. */
  readonly fallback?: boolean
}

/**
 * Where a document is shown on the site, for live preview in the admin: an absolute URL or a
 * path on the site's origin. Return `null` when the document has no page.
 */
export type PreviewURL = (args: {
  readonly doc: Record<string, unknown>
  /** The content locale being edited (with `localization`), otherwise the admin locale. */
  readonly locale: string
}) => string | null | undefined

export interface VersionsConfig {
  /** Versions kept per document; older ones are deleted. Default 50. */
  readonly max?: number
}

/** Custom admin components for a collection's or global's edit page. */
export interface ContainerAdmin {
  /** Panels in the edit page's side column, below publishing (components from admin modules). */
  readonly sidebar?: readonly AdminComponent[]
}

export interface CollectionAdmin extends ContainerAdmin {
  /**
   * `settings` lists the collection under Settings in the admin menu (with Users and API keys)
   * instead of with the content, e.g. for redirects or forms settings.
   */
  readonly group?: 'settings'
  readonly list?: CollectionListAdmin
  /**
   * With `auth.rbac`: the relationship field to `users` that names a document's owner, e.g.
   * `author`, for roles given "own documents only". Default: who created it (`createdBy`).
   */
  readonly ownerField?: string
  /**
   * Deleting asks more than "Are you sure?", for documents that take much with them (e.g. a
   * tenant): `typeTitle` has the user type the document's title; `impact` is a path under the
   * API, called with `?id=`, that returns `{ message }` (a label) saying what will be lost.
   * Documents are then deleted one at a time, not from a selection.
   */
  readonly confirmDelete?: { readonly typeTitle?: boolean; readonly impact?: string }
}

export interface CollectionListAdmin {
  /**
   * Show the list as a tree: the name of a relationship field to this same collection (e.g.
   * `parent`). Top-level documents come first; their children open below them.
   */
  readonly tree?: string
  /** The list's default order, e.g. `title` or `-updatedAt` (the default). */
  readonly sort?: string
}

export interface CollectionConfig {
  /** URL and table name. Lowercase letters, digits, `-` and `_`. */
  readonly slug: string
  readonly labels?: { readonly singular?: Label; readonly plural?: Label }
  /** Icon in the admin menu. Default `file-text`. */
  readonly icon?: AdminIcon
  /**
   * How the admin opens documents from the list: `drawer` slides a panel over the list, handy
   * for small collections (categories, tags). Default `page`. Collections with drafts, versions
   * or live preview always use the page.
   */
  readonly editIn?: 'page' | 'drawer'
  readonly fields: readonly Field[]
  /** Top-level field shown as the document title in the admin UI. */
  readonly useAsTitle?: string
  /** Adds a `status` field (`draft` | `published`). */
  readonly drafts?: boolean
  /**
   * Keep a snapshot of every save, to view history and restore. With `drafts`, a draft saved
   * on a published document is kept as a version and the published document stays live until
   * it is published again.
   */
  readonly versions?: boolean | VersionsConfig
  /** Allow scheduling publish/unpublish for a later time (needs `drafts`). */
  readonly schedule?: boolean
  /** Live preview: the page that shows a document, e.g. `({ doc }) => \`/posts/${doc.slug}\``. */
  readonly preview?: PreviewURL
  readonly access?: CollectionAccess
  readonly hooks?: CollectionHooks
  /** Custom admin components, and where the collection is in the menu. */
  readonly admin?: CollectionAdmin
}

export interface GlobalConfig {
  readonly slug: string
  readonly label?: Label
  /** Icon in the admin menu. Default `settings`. */
  readonly icon?: AdminIcon
  readonly fields: readonly Field[]
  readonly drafts?: boolean
  /** Keep a snapshot of every save. See `CollectionConfig.versions`. */
  readonly versions?: boolean | VersionsConfig
  /** Allow scheduling publish/unpublish for a later time (needs `drafts`). */
  readonly schedule?: boolean
  /** Live preview: the page that shows the global. See `CollectionConfig.preview`. */
  readonly preview?: PreviewURL
  readonly access?: GlobalAccess
  readonly hooks?: GlobalHooks
  /**
   * One value per scope, e.g. per tenant (usually set by a plugin): the scope of a call, from its
   * context (`onRequest`). A string keeps a value of its own; `undefined` the shared value; `null`
   * means the call has none, so reads give the global empty and changes are refused.
   */
  readonly scope?: (args: {
    readonly context: RequestContext
    readonly user: AuthUser | null
  }) => string | null | undefined
  /** Custom admin components. */
  readonly admin?: ContainerAdmin
}

export type AdminLocale = 'en' | 'th'

/** Icons a collection or global can show in the admin menu ([Lucide](https://lucide.dev) names). */
export const ADMIN_ICONS = [
  'file-text',
  'newspaper',
  'book-open',
  'notebook',
  'folder',
  'tag',
  'tags',
  'image',
  'images',
  'video',
  'music',
  'file',
  'users',
  'user',
  'building',
  'store',
  'shopping-bag',
  'shopping-cart',
  'package',
  'box',
  'calendar',
  'calendar-days',
  'map-pin',
  'globe',
  'house',
  'layout-grid',
  'layers',
  'star',
  'heart',
  'message-square',
  'mail',
  'phone',
  'briefcase',
  'graduation-cap',
  'utensils',
  'car',
  'settings',
  'sliders-horizontal',
  'palette',
  'megaphone',
  'bell',
  'link',
  'quote',
  'circle-help',
  'award',
  'ticket',
  'camera',
  'key',
  'chart-column',
  'chart-line',
] as const

export type AdminIcon = (typeof ADMIN_ICONS)[number]

/** Your or your client's brand in the admin UI. */
export interface AdminBrand {
  /** Shown in the menu, on the login page and in the browser tab. Default "Easy CMS". */
  readonly name?: string
  /** Logo URL: a path on your site (`/logo.svg`) or an `https://` address. */
  readonly logo?: string
  /** Main color as `#rrggbb`; lighter and darker shades are derived from it. */
  readonly color?: string
}

/** Who may see an admin page or dashboard widget. Default: every logged-in user. */
export type AdminViewAccess = (args: { readonly user: AuthUser }) => boolean | Promise<boolean>

/** A page of its own in the admin, e.g. a plugin's report, at `<admin>/p/<path>`. */
export interface AdminPage {
  /** Its address under `<admin>/p/`: lowercase letters, digits and `-`, e.g. `forms-overview`. */
  readonly path: string
  /** The page's body: a Web Component from an admin module. The admin draws the header. */
  readonly component: AdminComponent
  /** Its title in the header and the menu. */
  readonly label: Label
  /** Icon in the admin menu. Default `file-text`. */
  readonly icon?: AdminIcon
  /** Listed under Content (default) or Settings in the menu, or not listed (`false`): reached by links. */
  readonly group?: 'content' | 'settings' | false
  /** Who may open it. Pages a user may not open are left out of their admin. */
  readonly access?: AdminViewAccess
}

/** A panel on the admin's dashboard, after the built-in ones. */
export interface DashboardWidget {
  /** A Web Component from an admin module. */
  readonly component: AdminComponent
  /** `half` (default): the side column, beside drafts and recent edits; `full`: below both. */
  readonly width?: 'half' | 'full'
  /** Its name in Settings → Roles (`auth.rbac`). Default: the component's tag. */
  readonly label?: Label
  /** Who sees it. */
  readonly access?: AdminViewAccess
}

export interface AdminConfig {
  /** Where the admin UI is served. Default `/admin`. */
  readonly path?: string
  /** Default admin UI language. Default `en`. */
  readonly locale?: AdminLocale
  /** Name, logo and color of the admin UI. */
  readonly brand?: AdminBrand
  /**
   * The public site, for the admin's "View site" link: a path (`/`) or an `https://` URL.
   * Default `/` with Nuxt and Next.js; none with the standalone server.
   */
  readonly siteUrl?: string
  /**
   * Order of collections in the admin menu, by slug, e.g. `['posts', 'categories', 'media']`.
   * Collections not listed follow in config order, with the media library last.
   */
  readonly menu?: readonly string[]
  /**
   * JavaScript modules the admin loads after login, which define Web Components used by
   * fields (`admin.component`, `admin.after`) and edit pages (`admin.sidebar`). Each entry is a
   * package export (`'@easy-cms/plugin-seo/admin'`) or a file path relative to the project root
   * (`'./admin/color-picker.js'`), resolved on the server. A module must be one self-contained ES
   * module file. Remote URLs are not allowed.
   */
  readonly modules?: readonly string[]
  /** Pages of their own, e.g. from plugins, at `<admin>/p/<path>`. */
  readonly pages?: readonly AdminPage[]
  /** Panels on the dashboard, after the built-in ones. */
  readonly dashboard?: readonly DashboardWidget[]
  /**
   * A choice at the top of the menu that applies to everything in the admin, e.g. the tenant
   * (usually set by a plugin). The choice is kept in a cookie, which every request of the admin
   * sends; `onRequest` reads it.
   */
  readonly switcher?: AdminSwitcher | null
}

/** See `AdminConfig.switcher`. */
export interface AdminSwitcher {
  /** Cookie that keeps the choice, e.g. `ecms-tenant`. */
  readonly cookie: string
  readonly label: Label
  /**
   * Path under the API that lists the choices for the logged-in user:
   * `{ options: [{ value, label }], all?: Label }`, with `all` to offer "all of them" (value `*`).
   */
  readonly options: string
}

export interface ImageSize {
  /** Key in `media.sizes`, e.g. `thumbnail`. */
  readonly name: string
  readonly width: number
  readonly height?: number
  /** How to fit when both width and height are set. Default `cover`. */
  readonly fit?: 'cover' | 'contain' | 'inside'
}

/**
 * Uploads from a link: the server downloads the file (`cms.uploadFromURL`, `POST <api>/media`
 * with `{ url }`, "From a link" in the admin).
 */
export interface UploadFromURLConfig {
  /**
   * Hosts files may come from: `images.example.com`, `*.example.com` (its subdomains, not
   * `example.com` itself) or `*` for any public host. Checked at every redirect too.
   */
  readonly allowedHosts: readonly string[]
  /**
   * Also download from private network addresses (`10.x`, `192.168.x`, `localhost`…), e.g. an
   * intranet. Off by default: links could then reach services that are not meant to be public.
   */
  readonly allowPrivate?: boolean
}

export interface UploadConfig {
  /** Directory for uploaded files with the default local storage, relative to the project root. Default `uploads`. */
  readonly dir?: string
  /** Maximum file size in bytes. Default 10 MB. */
  readonly maxFileSize?: number
  /** Allowed MIME types, detected from file contents. `image/*` style wildcards are allowed. */
  readonly mimeTypes?: readonly string[]
  /** Where files are stored. Default: local disk in `dir`. */
  readonly storage?: StorageAdapter
  /** Resized copies generated for images when `sharp` is installed. */
  readonly imageSizes?: readonly ImageSize[]
  /** Lets users upload from a link. Off by default. */
  readonly fromURL?: UploadFromURLConfig
  /**
   * Folders in the media library (`media-folders`; a file is in one folder at most). With
   * `auth.rbac`, admins can also choose which roles see and change each folder. Off by default.
   */
  readonly folders?: boolean
  /**
   * Where files in private folders are kept: never served publicly, only through the API to
   * users who may see them or with `cms.signedMediaURL()`. Default: `storage`, when it has no
   * public URL (the local disk, Netlify Blobs); a storage with public URLs (S3 with `publicUrl`,
   * a public Vercel Blob store) needs one, e.g. `vercelBlobStorage({ access: 'private' })`.
   */
  readonly privateStorage?: StorageAdapter
}

export interface RoutesConfig {
  /** Where the REST API is served. Default `/api/cms`. */
  readonly api?: string
}

export interface AuthConfig {
  /**
   * Roles a user can have. Must include `admin`. Default `['admin', 'editor']`. With `rbac`, these
   * are the roles that always exist; admins can add more in Settings → Roles.
   */
  readonly roles?: readonly string[]
  /**
   * Roles and their permissions from the admin (Settings → Roles): admins tick what each role
   * may do with each collection, global and admin page, on top of access rules. Default `false`.
   */
  readonly rbac?: boolean
  /** Session lifetime in seconds. Default 7 days. */
  readonly tokenExpiration?: number
  /** Failed logins allowed per email (and IP) within `lockWindow`. Default 5. */
  readonly maxLoginAttempts?: number
  /** Window for `maxLoginAttempts`, in seconds. Default 15 minutes. */
  readonly lockWindow?: number
  /**
   * Origins allowed to send cookie-authenticated requests, besides the API's own origin.
   * Needed when the admin or frontend is served from another origin, or behind a proxy that rewrites the host.
   */
  readonly trustedOrigins?: readonly string[]
  /**
   * How long a "forgot password" link works, in seconds. Default 1 hour. Links work once: setting
   * the password ends them. Needs `email` and, in production, `serverURL` for the link.
   */
  readonly resetPasswordExpiration?: number
  /** How long an invitation link works, in seconds. Default 7 days. */
  readonly inviteExpiration?: number
  /**
   * Signing in to the admin with outside accounts, e.g. `[google({ clientId, clientSecret })]`
   * from `@easy-cms/auth-oauth`. Users are matched by their verified email.
   */
  readonly providers?: readonly AuthProvider[]
  /**
   * With `providers`: people from these email domains who sign in for the first time get an
   * account with `role` (default: as new users). Without it, only existing users can sign in.
   */
  readonly allowSignUp?: { readonly domains: readonly string[]; readonly role?: string }
  /**
   * `false`: only admins may sign in with a password (a way in when the provider is down);
   * everyone else signs in with `providers`. Default `true`.
   */
  readonly password?: boolean
  /**
   * A code the first admin must enter to create their account, so nobody else can claim a
   * freshly deployed site. Default: the `EASY_CMS_SETUP_CODE` environment variable; without it,
   * no code is asked.
   */
  readonly setupCode?: string
  /** Your own text for the password emails, e.g. in your brand's voice. Default: English or Thai. */
  readonly emails?: {
    readonly resetPassword?: PasswordEmailFn
    readonly invite?: PasswordEmailFn
    readonly passwordChanged?: PasswordEmailFn
  }
}

/** What `onRequest` receives. */
export interface OnRequestArgs {
  readonly headers: Headers
  /** The request's URL; `undefined` when only headers are known (`cms.forRequest(headers)`). */
  readonly url: URL | undefined
  /** The user of the session or API key, before `onRequest` changes it; `null` when anonymous. */
  readonly user: AuthUser | null
  readonly cms: EasyCMS
}

/**
 * Runs on each API request (REST, plugin endpoints, `cms.forRequest`) after the user is known:
 * returns the request's `context` (e.g. the tenant it works in, from a header) and may change the
 * user (e.g. their role in that tenant, `scoped`). Plugins that set it call the one before.
 */
export type OnRequest = (args: OnRequestArgs) => MaybePromise<
  | {
      readonly user?: AuthUser | null
      readonly context?: RequestContext
    }
  | undefined
>

/** What an endpoint's handler receives. */
export interface EndpointRequest {
  readonly request: Request
  readonly url: URL
  /** Values of `:name` segments in the endpoint's path. */
  readonly params: Readonly<Record<string, string>>
  /** The logged-in user (session cookie or Bearer token), or `null`. */
  readonly user: AuthUser | null
  /** The request's context (`onRequest`): pass it to the Local API with `user`. */
  readonly context: RequestContext
  /** The client's IP address, when the adapter knows it (e.g. to rate-limit a public form). */
  readonly ip: string | undefined
  /** The Local API. Pass `{ user, overrideAccess: false }` to apply the user's access rules. */
  readonly cms: EasyCMS
  /** The request's JSON body, which must be an object (at most 1 MB). */
  json(): Promise<Record<string, unknown>>
}

/**
 * A custom REST endpoint, served under `routes.api`. Writes from the browser pass the same
 * CSRF check as the built-in endpoints.
 */
/** An `easy-cms <name> [args…]` command. Built-in commands keep their names. */
export interface CliCommand {
  /** Lowercase, e.g. `nested:rebuild`. */
  readonly name: string
  /** One line for `easy-cms --help`. */
  readonly description: string
  /** Shown by `easy-cms <name> --help`. */
  readonly help?: string
  /** Runs with the CMS open (no schema push); return a non-zero exit code on failure. */
  readonly run: (args: {
    readonly cms: EasyCMS
    /** Positional arguments after the command name. */
    readonly args: readonly string[]
    readonly log: (line: string) => void
  }) => MaybePromise<number | undefined>
}

export interface Endpoint {
  /**
   * Path under the API, e.g. `/seo/generate` or `/stats/:collection`. The first segment must
   * not be a collection slug or one of `users`, `globals`, `admin`, `jobs`. With `root`, the
   * path from the site's root, outside the API and the admin.
   */
  readonly path: string
  readonly method: 'get' | 'post' | 'put' | 'patch' | 'delete'
  /**
   * Serve the path from the site's root instead of under `routes.api`, e.g. `/robots.txt`.
   * Only the standalone server (`easy-cms serve`) serves these; a Nuxt or Next.js app owns its
   * root, so plugins also offer a helper to use in the app's own route. Default false.
   */
  readonly root?: boolean
  /**
   * Returns a `Response`, or a value that is sent as JSON. Throw an Easy CMS error
   * (`UnauthorizedError`, `ForbiddenError`, `ValidationError`, `NotFoundError`) for error responses.
   */
  readonly handler: (request: EndpointRequest) => MaybePromise<unknown>
}

/** A plugin's package and version, listed for admins on the dashboard (System). */
export interface PluginInfo {
  /** Usually the package name, e.g. `@acme/easy-cms-plugin-stats`. */
  readonly name: string
  readonly version?: string
}

/** Receives the config and returns a modified copy. Runs before validation. */
export type Plugin = ((config: Config) => MaybePromise<Config>) & {
  /** Set by `definePlugin(plugin, info)`. */
  readonly info?: PluginInfo
}

/** Holds a plugin's `PluginTypes` at the type level only: nothing is stored at runtime. */
declare const PLUGIN_TYPES: unique symbol

/**
 * What a plugin adds, for the document types inferred from the config: fields on collections
 * and globals (by slug), and whole collections. Field types are written like config fields,
 * e.g. `{ fields: { posts: readonly [{ readonly name: 'meta'; readonly type: 'group'; … }] } }`.
 */
export interface PluginTypes {
  readonly fields?: { readonly [collection: string]: readonly Field[] }
  readonly globalFields?: { readonly [global: string]: readonly Field[] }
  readonly collections?: readonly CollectionConfig[]
}

/** A plugin that tells the type system what it adds (see `definePlugin`). */
export type TypedPlugin<T extends PluginTypes> = Plugin & { readonly [PLUGIN_TYPES]?: T }

/**
 * Returns the plugin with what it adds as types, so `cms.find()` and `CollectionDocument` know
 * the plugin's fields; `info` (its name and version) is listed for admins on the dashboard:
 *
 * ```ts
 * export const colorPlugin = (options: { collections: readonly string[] }) =>
 *   definePlugin<{ fields: { posts: readonly [{ readonly name: 'color'; readonly type: 'text' }] } }>(
 *     (config) => ({ ...config, collections: … }),
 *     { name: '@acme/easy-cms-plugin-color', version: '1.2.0' },
 *   )
 * ```
 */
export function definePlugin<const T extends PluginTypes = Record<never, never>>(
  plugin: Plugin,
  info?: PluginInfo,
): TypedPlugin<T> {
  if (info) Object.defineProperty(plugin, 'info', { value: info, configurable: true })
  return plugin
}

/** Database backups (Settings → Backups): one compressed SQLite file each. */
export interface BackupsConfig {
  /** Back up automatically every day or week. Default: only by hand. */
  readonly every?: 'day' | 'week'
  /** When, as `HH:MM` in the server's time zone. Default `03:00`. */
  readonly at?: string
  /** How many finished backups to keep; older ones are deleted. Default 7. */
  readonly keep?: number
  /** Folder for the default local storage, from the project root. Default `backups`. Never served publicly. */
  readonly dir?: string
  /** Where backups are stored instead, e.g. `s3Storage()` with a private bucket. */
  readonly storage?: StorageAdapter
  /**
   * For Postgres: the SQLite adapter that writes the backup file, `sqlite` from
   * `@easy-cms/db-sqlite`. SQLite databases back themselves up and don't need it.
   */
  readonly sqlite?: (options: { url: string; tablePrefix?: string }) => DatabaseAdapter
}

export interface Config {
  /** Signs sessions. At least 32 characters; read it from `process.env.EASY_CMS_SECRET`. */
  readonly secret: string
  readonly db: DatabaseAdapter
  /**
   * Public origin of the app, e.g. `https://example.com`. When set, media URLs are absolute
   * so frontends on other origins can use them. Default: relative URLs.
   */
  readonly serverURL?: string
  /**
   * Origins whose browser code may call the REST API (CORS), e.g. a Vite or React app on
   * another origin. `'*'` allows any origin for anonymous requests. Origins in
   * `auth.trustedOrigins` are always allowed, with cookies. Default: none.
   */
  readonly cors?: readonly string[] | '*'
  /**
   * Lets a cron service run due scheduled jobs: `GET <api>/jobs/run` with
   * `Authorization: Bearer <cronSecret>`. Default: the `CRON_SECRET` environment variable (the
   * convention of Vercel Cron). Logged-in admins can always run jobs.
   */
  readonly cronSecret?: string
  /** Endpoints notified when content changes, e.g. to rebuild a static site. */
  readonly webhooks?: readonly WebhookConfig[]
  /** Content in several languages: fields with `localized: true` hold one value per locale. */
  readonly localization?: LocalizationConfig | null
  readonly routes?: RoutesConfig
  readonly admin?: AdminConfig
  readonly upload?: UploadConfig
  readonly auth?: AuthConfig
  /**
   * Collections. A collection with slug `users` adds fields, access or hooks
   * to the built-in users collection.
   */
  readonly collections?: readonly CollectionConfig[]
  readonly globals?: readonly GlobalConfig[]
  /** Custom REST endpoints, e.g. from plugins. */
  readonly endpoints?: readonly Endpoint[]
  /** Extra `easy-cms <name>` CLI commands, e.g. from plugins. */
  readonly commands?: readonly CliCommand[]
  /** The request's context and user, worked out on each API request (usually by a plugin). */
  readonly onRequest?: OnRequest
  /**
   * Field types from packages, e.g. `color` from `@easy-cms/fields`: fields then use
   * `type: 'color'`. See `defineFieldType`.
   */
  readonly fieldTypes?: readonly FieldTypeDefinition[]
  /**
   * API keys for scripts and other apps (`Authorization: Bearer ecms_…`), managed in the admin
   * under Settings. A key acts as its owner, limited to the collections and operations it lists.
   */
  readonly apiKeys?: boolean
  /**
   * Sends email for plugins such as the form builder, e.g. `smtp()` from
   * `@easy-cms/email-smtp`, or `consoleEmail()` in development. Emails are queued in the
   * database and retried until sent.
   */
  readonly email?: EmailAdapter
  /**
   * Database backups, made on a schedule and from the admin (Settings → Backups). Without
   * `every`, admins can still back up by hand.
   */
  readonly backups?: BackupsConfig
  /**
   * The audit log (Settings → Audit log): who changed what and when, sign-ins, and admin
   * actions, kept for `keep` days. `true` for the defaults.
   */
  readonly audit?: boolean | AuditConfig
  readonly plugins?: readonly Plugin[]
}

/** The config after plugins ran, validation passed and defaults were applied. */
export interface ResolvedConfig
  extends Omit<
    Config,
    | 'cors'
    | 'localization'
    | 'routes'
    | 'admin'
    | 'upload'
    | 'auth'
    | 'collections'
    | 'globals'
    | 'endpoints'
    | 'plugins'
    | 'audit'
  > {
  readonly cors: readonly string[] | '*'
  /** `null` without localization. */
  readonly localization: Required<LocalizationConfig> | null
  readonly routes: Required<RoutesConfig>
  readonly admin: Required<AdminConfig>
  readonly upload: Required<Omit<UploadConfig, 'storage' | 'fromURL' | 'privateStorage'>> &
    Pick<UploadConfig, 'storage' | 'fromURL' | 'privateStorage'>
  readonly auth: Required<AuthConfig>
  /** `false` without an audit log. */
  readonly audit: Required<AuditConfig> | false
  readonly collections: readonly CollectionConfig[]
  readonly globals: readonly GlobalConfig[]
  readonly endpoints: readonly Endpoint[]
  readonly commands: readonly CliCommand[]
  readonly fieldTypes: readonly FieldTypeDefinition[]
  /** The config's plugins in order, with their `info` where they give one. */
  readonly installedPlugins: readonly Partial<PluginInfo>[]
}

/**
 * Declares the Easy CMS config. Returns it unchanged, keeping literal types
 * so document types can be inferred from it.
 */
export function defineConfig<const TConfig extends Config>(config: TConfig): TConfig {
  return config
}
