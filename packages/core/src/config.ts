import type { AuthUser, CollectionAccess, GlobalAccess, ID } from './access.js'
import type { PasswordEmailFn } from './auth/emails.js'
import type { DatabaseAdapter } from './database.js'
import type { EmailAdapter } from './email.js'
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
}

export interface ImageSize {
  /** Key in `media.sizes`, e.g. `thumbnail`. */
  readonly name: string
  readonly width: number
  readonly height?: number
  /** How to fit when both width and height are set. Default `cover`. */
  readonly fit?: 'cover' | 'contain' | 'inside'
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
}

export interface RoutesConfig {
  /** Where the REST API is served. Default `/api/cms`. */
  readonly api?: string
}

export interface AuthConfig {
  /** Roles a user can have. Must include `admin`. Default `['admin', 'editor']`. */
  readonly roles?: readonly string[]
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
  /** Your own text for the password emails, e.g. in your brand's voice. Default: English or Thai. */
  readonly emails?: {
    readonly resetPassword?: PasswordEmailFn
    readonly invite?: PasswordEmailFn
    readonly passwordChanged?: PasswordEmailFn
  }
}

/** What an endpoint's handler receives. */
export interface EndpointRequest {
  readonly request: Request
  readonly url: URL
  /** Values of `:name` segments in the endpoint's path. */
  readonly params: Readonly<Record<string, string>>
  /** The logged-in user (session cookie or Bearer token), or `null`. */
  readonly user: AuthUser | null
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

/** Receives the config and returns a modified copy. Runs before validation. */
export type Plugin = (config: Config) => MaybePromise<Config>

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
  > {
  readonly cors: readonly string[] | '*'
  /** `null` without localization. */
  readonly localization: Required<LocalizationConfig> | null
  readonly routes: Required<RoutesConfig>
  readonly admin: Required<AdminConfig>
  readonly upload: Required<Omit<UploadConfig, 'storage'>> & Pick<UploadConfig, 'storage'>
  readonly auth: Required<AuthConfig>
  readonly collections: readonly CollectionConfig[]
  readonly globals: readonly GlobalConfig[]
  readonly endpoints: readonly Endpoint[]
  readonly commands: readonly CliCommand[]
}

/**
 * Declares the Easy CMS config. Returns it unchanged, keeping literal types
 * so document types can be inferred from it.
 */
export function defineConfig<const TConfig extends Config>(config: TConfig): TConfig {
  return config
}
