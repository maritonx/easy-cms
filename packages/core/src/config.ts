import type { AuthUser, CollectionAccess, GlobalAccess, ID } from './access.js'
import type { DatabaseAdapter } from './database.js'
import type { Field, Label } from './fields.js'
import type { EasyCMS } from './local-api.js'
import type { StorageAdapter } from './storage.js'

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

export interface CollectionConfig {
  /** URL and table name. Lowercase letters, digits, `-` and `_`. */
  readonly slug: string
  readonly labels?: { readonly singular?: Label; readonly plural?: Label }
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
  /** Live preview: the page that shows a document, e.g. `({ doc }) => \`/posts/${doc.slug}\``. */
  readonly preview?: PreviewURL
  readonly access?: CollectionAccess
  readonly hooks?: CollectionHooks
}

export interface GlobalConfig {
  readonly slug: string
  readonly label?: Label
  readonly fields: readonly Field[]
  readonly drafts?: boolean
  /** Keep a snapshot of every save. See `CollectionConfig.versions`. */
  readonly versions?: boolean | VersionsConfig
  /** Live preview: the page that shows the global. See `CollectionConfig.preview`. */
  readonly preview?: PreviewURL
  readonly access?: GlobalAccess
  readonly hooks?: GlobalHooks
}

export type AdminLocale = 'en' | 'th'

export interface AdminConfig {
  /** Where the admin UI is served. Default `/admin`. */
  readonly path?: string
  /** Default admin UI language. Default `en`. */
  readonly locale?: AdminLocale
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
}

/**
 * Declares the Easy CMS config. Returns it unchanged, keeping literal types
 * so document types can be inferred from it.
 */
export function defineConfig<const TConfig extends Config>(config: TConfig): TConfig {
  return config
}
