import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { AuthUser, ID, RequestContext, Where } from './access.js'
import {
  andWhere,
  evaluateAccess,
  FieldAccessChecker,
  filterInput,
  stripFields,
} from './access-control.js'
import {
  API_KEYS,
  type ApiKeyOperation,
  type ApiKeyPermissions,
  keyAllows,
  newApiKey,
} from './api-keys.js'
import { AuditLog, auditContext } from './audit.js'
import { Auth, asMember } from './auth/auth.js'
import { hashPassword, MIN_PASSWORD_LENGTH } from './auth/password.js'
import { signPreviewToken, verifyPreviewToken } from './auth/tokens.js'
import { runDueBackups } from './backups.js'
import {
  EMAIL_DELIVERIES,
  INTERNAL_COLLECTIONS,
  MEDIA,
  MEDIA_FOLDERS,
  SCHEDULED_JOBS,
  USERS,
  WEBHOOK_DELIVERIES,
} from './builtins.js'
import type { CollectionConfig, Config, GlobalConfig, ImageSize, ResolvedConfig } from './config.js'
import type { Database, PaginatedDocs, RawDocument, SchemaMode } from './database.js'
import {
  applyDefaults,
  fillMissing,
  generateSlugs,
  mergeForUpdate,
  parseId,
  type Reference,
  validateFields,
} from './document.js'
import { type EmailMessage, type EmailQueue, Mailer, type QueuedEmail } from './email.js'
import {
  EasyCMSError,
  type FieldError,
  ForbiddenError,
  NotFoundError,
  PayloadTooLargeError,
  QueryError,
  UnauthorizedError,
  ValidationError,
} from './errors.js'
import { type Field, type FilterOptions, mimeAllowedBy, uniqueWithinOf } from './fields.js'
import type {
  CollectionDocument,
  CollectionSlug,
  CreateInput,
  GlobalDocument,
  GlobalInput,
  GlobalSlug,
  MediaDocument,
  UpdateInput,
} from './infer.js'
import {
  ALL_LOCALES,
  localizeSort,
  localizeWhere,
  pickLocale,
  toLocaleMaps,
} from './localization.js'
import { consoleLogger, type Logger } from './logger.js'
import {
  EXTENSIONS,
  imageDimensions,
  isPrivateKey,
  mimeAllowed,
  sizeKey,
  sniffMimeType,
  storageKey,
  typeFromName,
  withPrivacy,
} from './media.js'
import { MediaFolders, PUBLIC_FILES } from './media-folders.js'
import { DEFAULT_DEPTH, type Loader, MAX_DEPTH, populate } from './populate.js'
import { fetchRemoteFile, RemoteFileError } from './remote-file.js'
import { resolveConfig } from './resolve-config.js'
import { Roles } from './roles.js'
import { type DirectUpload, localStorage, type StorageAdapter } from './storage.js'
import {
  collectionParent,
  globalParent,
  snapshotOf,
  type Version,
  VersionStore,
  type VersionSummary,
  versionLimit,
} from './versions.js'
import { type QueuedDelivery, type WebhookEvent, type WebhookQueue, Webhooks } from './webhooks.js'

type Data = Record<string, unknown>

// When the config type is not a literal (e.g. loaded at runtime), fall back to loose types.
type Slug<C extends Config> = string extends CollectionSlug<C> ? string : CollectionSlug<C>
type GSlug<C extends Config> = string extends GlobalSlug<C> ? string : GlobalSlug<C>
type Doc<C extends Config, S> =
  string extends CollectionSlug<C> ? RawDocument : CollectionDocument<C, S & CollectionSlug<C>>
type Create<C extends Config, S> =
  string extends CollectionSlug<C> ? Data : CreateInput<C, S & CollectionSlug<C>>
type Update<C extends Config, S> =
  string extends CollectionSlug<C> ? Data : UpdateInput<C, S & CollectionSlug<C>>
type GDoc<C extends Config, S> =
  string extends GlobalSlug<C> ? Data : GlobalDocument<C, S & GlobalSlug<C>>
type GInput<C extends Config, S> =
  string extends GlobalSlug<C> ? Data : GlobalInput<C, S & GlobalSlug<C>>

/** A collection slug of the config `C` (any string when the config isn't a literal). */
export type SlugOf<C extends Config> = Slug<C>
/**
 * A document of collection `S` as the Local API returns it, e.g. for helpers that take an
 * `EasyCMS<C>`: inferred from a literal config, loose otherwise.
 */
export type DocumentOf<C extends Config, S> = Doc<C, S>

export interface AccessOptions {
  /**
   * The Local API trusts its caller and skips access rules by default.
   * Pass `false` (with `user`) to apply them, as the REST API does.
   */
  readonly overrideAccess?: boolean
  /** The user to check access for. `null` = not logged in. */
  readonly user?: AuthUser | null
  /**
   * What the call is about besides its user, e.g. the tenant (see `onRequest`): given to access
   * functions, hooks and `filterOptions`.
   */
  readonly context?: RequestContext
}

export interface DepthOptions extends AccessOptions {
  /** How many levels of relationships to populate. Default 1, maximum 3. */
  readonly depth?: number
  /**
   * With `localization`: the locale to read, and for writes the locale the data is in. Default:
   * the default locale. `'all'` reads (and writes) localized fields as `{ [locale]: value }`.
   */
  readonly locale?: string
}

export interface UpdateOptions extends DepthOptions {
  /**
   * Upkeep of the live document, e.g. values a plugin keeps up to date (a page's path): with
   * drafts and versions a pending draft stays as it is (edits go to it by default), the status
   * stays, and no version is added to the history.
   */
  readonly live?: boolean
  /**
   * Saves only when the stored document still matches this at the moment of writing (compare and
   * set), e.g. `{ status: { equals: 'pending' } }` so that one of two concurrent calls wins.
   * `update()` then returns `null` when it doesn't match, after its `before*` hooks ran.
   */
  readonly where?: Where
}

export interface IncrementOptions {
  /** Only when the result stays at or above this, e.g. `0` for stock. */
  readonly min?: number
  /** Only when the result stays at or below this. */
  readonly max?: number
}

export interface ReadOptions extends DepthOptions {
  /**
   * Include drafts. By default only published documents of collections with
   * `drafts: true` are returned, including when populating relationships (FR-DRF-04).
   */
  readonly draft?: boolean
  /** Use the default locale's value when a localized value is empty. Default: `localization.fallback`. */
  readonly fallbackLocale?: boolean
}

export interface FindOptions extends ReadOptions {
  readonly where?: Where
  /** Field path, `-` prefix for descending. Default `-createdAt`. */
  readonly sort?: string | readonly string[]
  /** Default 10. `0` returns every document. */
  readonly limit?: number
  /** 1-based. Default 1. */
  readonly page?: number
}

export interface CreateEasyCMSOptions {
  /** Project root. Default `process.cwd()`. */
  readonly cwd?: string
  /**
   * Run due scheduled jobs and webhook retries every minute in this process. Default: on when
   * a collection or global has `schedule`, or `webhooks`, `email` or `jobs` is set. Turn it off
   * where a cron calls `runJobs` (or `GET <api>/jobs/run`) instead.
   */
  readonly scheduler?: boolean
  /** Default `verify` when `NODE_ENV=production`, otherwise `push`. */
  readonly schema?: SchemaMode
  readonly logger?: Logger
  readonly interactive?: boolean
}

/** Connects to the database and returns the Local API. */
export async function createEasyCMS<const C extends Config>(
  config: C,
  options: CreateEasyCMSOptions = {},
): Promise<EasyCMS<C>> {
  const resolved = await resolveConfig(config)
  const logger = options.logger ?? consoleLogger
  const cwd = options.cwd ?? process.cwd()
  const storage = resolved.upload.storage ?? localStorage({ dir: resolved.upload.dir })
  await storage.init?.({ cwd })
  if (resolved.upload.privateStorage) await resolved.upload.privateStorage.init?.({ cwd })
  const db = await resolved.db.init({
    config: resolved,
    cwd,
    schema: options.schema ?? (process.env.NODE_ENV === 'production' ? 'verify' : 'push'),
    logger,
    interactive: options.interactive ?? false,
  })
  const cms = new EasyCMS<C>(resolved, db, logger, storage, cwd)
  const scheduling =
    [...resolved.collections, ...resolved.globals].some((c) => c.schedule) ||
    (resolved.webhooks?.length ?? 0) > 0 ||
    resolved.email !== undefined ||
    resolved.jobs.length > 0
  if (scheduling && options.scheduler !== false) cms.startScheduler()
  return cms
}

/** A scheduled publish or unpublish. */
export interface ScheduledJob {
  readonly id: ID
  readonly action: 'publish' | 'unpublish'
  /** ISO time the job runs at (or after). */
  readonly runAt: string
  readonly state: 'pending' | 'done' | 'failed'
  readonly error: string | null
  readonly author: ID | null
}

const toJob = (row: RawDocument): ScheduledJob => ({
  id: row.id,
  action: row.action as ScheduledJob['action'],
  runAt: String(row.runAt),
  state: row.state as ScheduledJob['state'],
  error: (row.error as string | null) ?? null,
  author: (row.author as ID | null) ?? null,
})

/** Access has been checked (or skipped) for one call. */
interface Guard {
  readonly enforce: boolean
  readonly user: AuthUser | null
  readonly context: RequestContext
}

export class EasyCMS<C extends Config = Config> {
  readonly config: ResolvedConfig
  readonly db: Database
  readonly logger: Logger
  /** Login, logout and session checks. */
  readonly auth: Auth
  /** Where uploaded files are stored. */
  readonly storage: StorageAdapter
  /**
   * Where files in private folders are stored (`upload.privateStorage`, else `storage` when it has
   * no public URLs); `null` when private folders can't be used.
   */
  readonly privateStorage: StorageAdapter | null
  /** Project root: relative paths in the config (e.g. `admin.modules`) start here. */
  readonly cwd: string
  /** Roles and their permissions (`auth.rbac`, Settings → Roles). */
  readonly roles: Roles
  /** Who did what (`audit`, Settings → Audit log). */
  readonly audit: AuditLog
  /** Folders of the media library and their permissions (`upload.folders`). */
  readonly folders: MediaFolders
  private readonly versions: VersionStore
  private readonly webhooks: Webhooks
  private readonly mailer: Mailer

  constructor(
    config: ResolvedConfig,
    db: Database,
    logger: Logger = consoleLogger,
    storage: StorageAdapter = localStorage({ dir: config.upload.dir }),
    cwd: string = process.cwd(),
    privateStorage?: StorageAdapter | null,
  ) {
    this.config = config
    this.db = db
    this.logger = logger
    this.storage = storage
    // A storage that can give files public URLs (S3, Vercel Blob…) never holds private files.
    this.privateStorage =
      privateStorage !== undefined
        ? privateStorage
        : (config.upload.privateStorage ?? (typeof storage.url === 'function' ? null : storage))
    this.cwd = cwd
    this.versions = new VersionStore(db)
    this.roles = new Roles(
      config,
      db,
      (message) => logger.info(message),
      (entry) => this.audit.record(entry),
    )
    this.audit = new AuditLog(this as unknown as EasyCMS)
    this.folders = new MediaFolders(config, db, this.roles)
    this.webhooks = new Webhooks(
      config.webhooks ?? [],
      logger,
      config.collections.some((c) => c.slug === WEBHOOK_DELIVERIES)
        ? this.webhookQueue()
        : undefined,
    )
    this.mailer = new Mailer(
      config.email,
      logger,
      config.collections.some((c) => c.slug === EMAIL_DELIVERIES) ? this.emailQueue() : undefined,
    )
    this.auth = new Auth(this as unknown as EasyCMS)
  }

  /**
   * The user and context of a request, as the REST API works them out: its session cookie or
   * Bearer token, then `onRequest`. For framework routes and server code that act for a visitor;
   * pass both to the Local API with `overrideAccess: false`.
   */
  async forRequest(
    request: Request | Headers,
  ): Promise<{ user: AuthUser | null; context: RequestContext }> {
    const headers = request instanceof Headers ? request : request.headers
    const url = request instanceof Headers ? undefined : new URL(request.url)
    return this.applyOnRequest(headers, url, await this.auth.userFromHeaders(headers))
  }

  /** @internal `onRequest` of the config, for a request whose user is known. */
  async applyOnRequest(
    headers: Headers,
    url: URL | undefined,
    user: AuthUser | null,
  ): Promise<{ user: AuthUser | null; context: RequestContext }> {
    const result = await this.config.onRequest?.({
      headers,
      url,
      user,
      cms: this as unknown as EasyCMS,
    })
    const changed = result?.user !== undefined ? result.user : user
    return {
      // `onRequest` may change the role (e.g. per tenant): membership follows it.
      user: changed && asMember(changed, this.config.auth.members.roles),
      context: result?.context ?? NO_CONTEXT,
    }
  }

  async find<S extends Slug<C>>(
    collection: S,
    options: FindOptions = {},
  ): Promise<PaginatedDocs<Doc<C, S>>> {
    const config = this.collection(collection)
    const guard = guardOf(options)
    const limit = options.limit ?? 10
    const page = options.page ?? 1
    if (!Number.isInteger(limit) || limit < 0)
      throw new QueryError('limit must be a non-negative integer')
    if (!Number.isInteger(page) || page < 1) throw new QueryError('page must be a positive integer')

    const draft = readsDrafts(guard, options.draft)
    const where = this.whereFor(
      config,
      draftWhere(config, draft, await this.readWhere(config, guard, options.where)),
      options,
    )
    const requested = options.sort === undefined ? ['-createdAt'] : [options.sort].flat()
    await this.checkQueryFields(config, guard, undefined, requested)
    const locale = this.localeOf(options)
    const sort =
      locale === undefined
        ? requested
        : localizeSort(
            config.fields,
            requested,
            locale === ALL_LOCALES ? (this.config.localization?.defaultLocale ?? locale) : locale,
            this.config.localization?.locales ?? [],
          )
    const result = await this.db.find({ collection, where, sort, limit, page })
    const found = draft ? await this.withDrafts(config, result.docs) : result.docs
    const docs = await this.output(config, found, guard, { ...options, draft })
    return { ...result, docs: docs as Doc<C, S>[] }
  }

  async findById<S extends Slug<C>>(
    collection: S,
    id: ID,
    options: ReadOptions = {},
  ): Promise<Doc<C, S> | null> {
    const config = this.collection(collection)
    const guard = guardOf(options)
    const parsed = parseId(id)
    if (parsed === undefined) return null
    const draft = readsDrafts(guard, options.draft)
    const where = this.whereFor(
      config,
      draftWhere(config, draft, await this.readWhere(config, guard, undefined)),
      options,
    )
    const doc = where
      ? (
          await this.db.find({
            collection,
            where: andWhere(where, { id: { equals: parsed } }),
            sort: [],
            limit: 1,
            page: 1,
          })
        ).docs[0]
      : await this.db.findById({ collection, id: parsed })
    if (!doc) return null
    const [current] = draft ? await this.withDrafts(config, [doc]) : [doc]
    const [out] = await this.output(config, [current as RawDocument], guard, { ...options, draft })
    return (out ?? null) as Doc<C, S> | null
  }

  async count<S extends Slug<C>>(
    collection: S,
    options: { where?: Where; draft?: boolean; locale?: string } & AccessOptions = {},
  ): Promise<number> {
    const config = this.collection(collection)
    const where = this.whereFor(
      config,
      draftWhere(
        config,
        readsDrafts(guardOf(options), options.draft),
        await this.readWhere(config, guardOf(options), options.where),
      ),
      options,
    )
    return this.db.count({ collection, where })
  }

  async create<S extends Slug<C>>(
    collection: S,
    data: Create<C, S>,
    options: DepthOptions = {},
  ): Promise<Doc<C, S>> {
    const config = this.collection(collection)
    if (config.slug === MEDIA) {
      throw new ValidationError(MEDIA, [
        { field: 'file', message: 'upload files with cms.upload() or POST multipart' },
      ])
    }
    return (await this.createDocument(config, asObject(data, collection), options)) as Doc<C, S>
  }

  /**
   * Stores a file and creates its `media` document (FR-UPL). The type is detected from
   * the contents; images get width/height, and resized copies when `sharp` is installed.
   */
  async upload(
    file: { data: Uint8Array; name: string },
    data: Record<string, unknown> = {},
    options: DepthOptions = {},
  ): Promise<MediaDocument> {
    const config = this.collection(MEDIA)
    const guard = guardOf(options)
    await this.checkUpload(guard, data, folderOf(MEDIA, data))
    const { maxFileSize, mimeTypes, imageSizes } = this.config.upload
    if (file.data.byteLength > maxFileSize) {
      throw new PayloadTooLargeError(`File is larger than ${maxFileSize} bytes`)
    }
    if (file.data.byteLength === 0)
      throw new ValidationError(MEDIA, [{ field: 'file', message: 'is empty' }])
    const mimeType = sniffMimeType(file.data, file.name)
    if (!mimeType || !mimeAllowed(mimeType, mimeTypes)) {
      throw new ValidationError(MEDIA, [
        {
          field: 'file',
          message: `file type ${mimeType ?? 'unknown'} is not allowed (allowed: ${mimeTypes.join(', ')})`,
        },
      ])
    }

    const random = randomBytes(4).toString('hex')
    // A file in a private folder goes to the private storage, under a private name.
    const isPrivate = await this.folders.isPrivate(folderOf(MEDIA, data))
    const storage = this.storageFor(isPrivate)
    const filename = withPrivacy(storageKey(file.name, mimeType, random), isPrivate)
    const stored: string[] = []
    try {
      await storage.put(filename, file.data, { contentType: mimeType })
      stored.push(filename)
      const dimensions = imageDimensions(file.data, mimeType)
      const sizes = await this.resizeImage(
        file.data,
        mimeType,
        filename,
        imageSizes,
        stored,
        storage,
      )
      const doc = await this.createDocument(
        config,
        {
          ...data,
          ...(this.folders.enabled ? { private: isPrivate } : {}),
          filename,
          originalName: file.name.slice(0, 255),
          mimeType,
          filesize: file.data.byteLength,
          width: dimensions?.width ?? null,
          height: dimensions?.height ?? null,
          sizes,
        },
        // System fields are set here, not by the caller: skip field-level update access for them.
        { ...options, overrideAccess: true },
        guard,
      )
      return doc as unknown as MediaDocument
    } catch (error) {
      // Don't leave orphaned files behind when the document could not be created.
      for (const key of stored) await storage.delete(key).catch(() => {})
      throw error
    }
  }

  /**
   * Starts an upload straight to the storage, for files too large to send through the server
   * (`POST <api>/media/uploads`): checks who uploads what where, as `upload()` does, and returns
   * a signed ticket and where to send the file. `upload` is `null` when the storage can't take
   * files directly: send it to `upload()` instead. Then `completeUpload(ticket)`.
   */
  async createUpload(
    file: { name: string; size: number; type?: string },
    data: Record<string, unknown> = {},
    options: AccessOptions = {},
  ): Promise<{ ticket: string; upload: DirectUpload | null }> {
    const guard = guardOf(options)
    const folder = folderOf(MEDIA, data)
    await this.checkUpload(guard, data, folder)
    const { maxFileSize, mimeTypes } = this.config.upload
    const size = Number(file.size)
    if (!Number.isInteger(size) || size <= 0)
      throw new ValidationError(MEDIA, [{ field: 'size', message: 'must be the size in bytes' }])
    if (size > maxFileSize)
      throw new PayloadTooLargeError(`File is larger than ${maxFileSize} bytes`)
    // The type the name says (browsers' types vary), checked against the contents once uploaded.
    const name = String(file.name ?? '').slice(0, 255)
    const type = typeFromName(name) ?? file.type ?? ''
    if (!EXTENSIONS[type] || !mimeAllowed(type, mimeTypes))
      throw new ValidationError(MEDIA, [
        {
          field: 'file',
          message: `file type ${type || 'unknown'} is not allowed (allowed: ${mimeTypes.join(', ')})`,
        },
      ])
    const isPrivate = await this.folders.isPrivate(folder)
    const storage = this.storageFor(isPrivate)
    const key = withPrivacy(storageKey(name, type, randomBytes(4).toString('hex')), isPrivate)
    const upload = storage.uploadURL
      ? await storage.uploadURL(key, { contentType: type, size, expiresIn: UPLOAD_URL_SECONDS })
      : null
    const ticket = this.sign('upload', {
      key,
      private: isPrivate,
      name,
      size,
      type,
      user: guard.user?.id ?? null,
      expires: Math.floor(Date.now() / 1000) + UPLOAD_TICKET_SECONDS,
      data,
    } satisfies UploadTicket)
    return { ticket, upload }
  }

  /**
   * Finishes an upload made with `createUpload()` (`POST <api>/media/uploads/complete`): checks
   * the file in the storage like any upload (its size, and its type from its contents), then
   * makes its media document. A file that fails is deleted.
   */
  async completeUpload(ticket: string, options: DepthOptions = {}): Promise<MediaDocument> {
    const guard = guardOf(options)
    const t = this.verify<UploadTicket>('upload', ticket)
    if (!t || t.expires < Date.now() / 1000)
      throw new ValidationError(MEDIA, [
        { field: 'ticket', message: 'is not valid or has expired' },
      ])
    if (guard.enforce && String(guard.user?.id ?? null) !== String(t.user)) throw deny(guard.user)
    await this.checkUpload(guard, t.data, folderOf(MEDIA, t.data))
    // Finished already: the file belongs to that document now.
    if ((await this.db.count({ collection: MEDIA, where: { filename: { equals: t.key } } })) > 0)
      throw new ValidationError(MEDIA, [{ field: 'ticket', message: 'was used already' }])
    const storage = this.storageFor(t.private)
    const start = storage.getStart
      ? await storage.getStart(t.key, SNIFF_BYTES)
      : await storage.get(t.key)
    if (!start) throw new ValidationError(MEDIA, [{ field: 'file', message: 'was not uploaded' }])
    const refuse = async (message: string): Promise<never> => {
      await storage.delete(t.key).catch(() => {})
      throw new ValidationError(MEDIA, [{ field: 'file', message }])
    }
    if (start.size !== t.size) await refuse(`is ${start.size} bytes, not the ${t.size} announced`)
    if (start.size > this.config.upload.maxFileSize)
      await refuse(`is larger than ${this.config.upload.maxFileSize} bytes`)
    const mimeType = sniffMimeType(start.body.subarray(0, SNIFF_BYTES), t.name)
    if (mimeType !== t.type)
      await refuse(`contains ${mimeType ?? 'an unknown type'}, not ${t.type}`)

    const stored: string[] = []
    try {
      // Images: their size, and resized copies, need the whole file.
      let dimensions: { width: number; height: number } | undefined
      let sizes: Record<string, unknown> = {}
      if (t.type.startsWith('image/')) {
        const whole = await storage.get(t.key)
        if (whole) {
          dimensions = imageDimensions(whole.body, t.type)
          sizes = await this.resizeImage(
            whole.body,
            t.type,
            t.key,
            this.config.upload.imageSizes,
            stored,
            storage,
          )
        }
      }
      const doc = await this.createDocument(
        this.collection(MEDIA),
        {
          ...t.data,
          ...(this.folders.enabled ? { private: t.private } : {}),
          filename: t.key,
          originalName: t.name,
          mimeType: t.type,
          filesize: start.size,
          width: dimensions?.width ?? null,
          height: dimensions?.height ?? null,
          sizes,
        },
        { ...options, overrideAccess: true },
        guard,
      )
      return doc as unknown as MediaDocument
    } catch (error) {
      for (const key of [t.key, ...stored]) await storage.delete(key).catch(() => {})
      throw error
    }
  }

  /** Who may upload, and into which folder: `upload()` and direct uploads. */
  private async checkUpload(guard: Guard, data: Record<string, unknown>, folder: ID | null) {
    if (!guard.enforce) return
    await this.checkGrant(guard, { collection: MEDIA }, 'create')
    const allowed = await evaluateAccess(this.collection(MEDIA).access?.create, {
      user: guard.user,
      context: guard.context,
      data,
    })
    if (allowed !== true) throw deny(guard.user)
    await this.folders.checkTarget(guard.user, MEDIA, folder)
  }

  /** A value with its HMAC (`secret`), for `purpose` only: `<base64url JSON>.<signature>`. */
  private sign(purpose: string, value: unknown): string {
    const payload = Buffer.from(JSON.stringify(value)).toString('base64url')
    const mac = createHmac('sha256', this.config.secret).update(`${purpose}:${payload}`)
    return `${payload}.${mac.digest('base64url')}`
  }

  /** The value of a token made by `sign`, or `undefined` when it isn't genuine. */
  private verify<T>(purpose: string, token: string): T | undefined {
    const [payload, signature] = String(token).split('.')
    if (!payload || !signature) return undefined
    const expected = Buffer.from(
      createHmac('sha256', this.config.secret).update(`${purpose}:${payload}`).digest('base64url'),
    )
    const given = Buffer.from(signature)
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return undefined
    try {
      return JSON.parse(Buffer.from(payload, 'base64url').toString()) as T
    } catch {
      return undefined
    }
  }

  /**
   * Downloads a file from an `http(s)` link and uploads it like `upload()`. Private network
   * addresses are refused unless `upload.fromURL.allowPrivate`. Calls on behalf of a user (the
   * REST API, `overrideAccess: false`) also need `upload.fromURL` and a host in its `allowedHosts`.
   */
  async uploadFromURL(
    url: string,
    data: Record<string, unknown> = {},
    options: DepthOptions = {},
  ): Promise<MediaDocument> {
    const config = this.collection(MEDIA)
    const guard = guardOf(options)
    const fromURL = this.config.upload.fromURL
    // Before downloading anything: who may upload, and whether links are allowed at all.
    if (guard.enforce) {
      await this.checkGrant(guard, { collection: MEDIA }, 'create')
      const allowed = await evaluateAccess(config.access?.create, {
        user: guard.user,
        context: guard.context,
        data,
      })
      if (allowed !== true) throw deny(guard.user)
      if (!fromURL)
        throw new ValidationError(MEDIA, [
          { field: 'url', message: 'uploads from links are off (upload.fromURL)' },
        ])
    }
    let file: { data: Uint8Array; name: string }
    try {
      file = await fetchRemoteFile(url, {
        allowedHosts: guard.enforce ? fromURL?.allowedHosts : undefined,
        allowPrivate: fromURL?.allowPrivate === true,
        maxBytes: this.config.upload.maxFileSize,
        userAgent: 'EasyCMS (+https://github.com/maritonx/easy-cms)',
      })
    } catch (error) {
      if (!(error instanceof RemoteFileError)) throw error
      if (error.status === 413) throw new PayloadTooLargeError(`File ${error.message}`)
      throw new ValidationError(MEDIA, [{ field: 'url', message: error.message }])
    }
    return this.upload(file, data, options)
  }

  /**
   * Creates an API key (needs `apiKeys: true`) and returns it once: only a hash is stored.
   * With access enforced the key belongs to `user`; trusted calls name the owner in `data.user`.
   */
  async createApiKey(
    data: {
      name: string
      permissions?: ApiKeyPermissions
      expiresAt?: string | Date | null
      user?: ID
    },
    options: AccessOptions = {},
  ): Promise<{ key: string; doc: Record<string, unknown> }> {
    if (!this.config.collections.some((c) => c.slug === API_KEYS))
      throw new QueryError('API keys are off: set `apiKeys: true` in the config')
    const config = this.collection(API_KEYS)
    const guard = guardOf(options)
    if (guard.enforce) {
      const allowed = await evaluateAccess(config.access?.create, {
        user: guard.user,
        context: guard.context,
      })
      if (allowed !== true) throw deny(guard.user)
    }
    const owner = guard.enforce ? guard.user?.id : data.user
    if (owner === undefined || owner === null)
      throw new ValidationError(API_KEYS, [{ field: 'user', message: 'is required' }])
    const { key, prefix, hash } = newApiKey()
    const expiresAt = data.expiresAt instanceof Date ? data.expiresAt.toISOString() : data.expiresAt
    const created = await this.createDocument(
      config,
      {
        name: data.name,
        // The context it is created in (e.g. a tenant) stays with the key. Requests can't name
        // one; trusted calls may.
        permissions: {
          ...withoutContext(data.permissions),
          ...(guard.enforce
            ? Object.keys(guard.context).length > 0
              ? { context: guard.context }
              : {}
            : data.permissions?.context
              ? { context: data.permissions.context }
              : {}),
        },
        expiresAt: expiresAt ?? null,
        prefix,
        user: owner,
      },
      { depth: 0 },
      guard,
    )
    // The hash is a hidden field, which input never sets: store it directly.
    const raw = (await this.db.findById({ collection: API_KEYS, id: created.id })) as RawDocument
    const { id: _id, ...rest } = raw
    await this.db.update({ collection: API_KEYS, id: created.id, data: { ...rest, keyHash: hash } })
    return { key, doc: created as Record<string, unknown> }
  }

  /** Public URL of a stored file. */
  mediaURL(key: string): string {
    const base = `${this.config.serverURL?.replace(/\/+$/, '') ?? ''}${this.config.routes.api}`
    // Private files only through the API, which checks who asks.
    if (isPrivateKey(key)) return `${base}/media/private/${encodeURIComponent(key)}`
    const custom = this.storage.url?.(key)
    if (custom) return custom
    return `${base}/media/file/${encodeURIComponent(key)}`
  }

  /**
   * A link to a private file that works without signing in until it expires: `expiresIn` in
   * seconds or as `'30m'`, `'1h'` (the default), `'7d'` (the most). Public files get their usual
   * URL. `size`: one of the file's resized copies. Links stop working when `secret` changes or
   * the file stops being private.
   */
  signedMediaURL(
    doc: { filename?: unknown; private?: unknown; sizes?: unknown },
    options: { expiresIn?: number | string; size?: string } = {},
  ): string {
    const sizes = (doc.sizes ?? {}) as Record<string, { filename?: string }>
    const key = options.size ? sizes[options.size]?.filename : doc.filename
    if (typeof key !== 'string' || !key)
      throw new QueryError(
        options.size ? `The file has no "${options.size}" size` : 'The document is not a file',
      )
    if (!isPrivateKey(key)) return this.mediaURL(key)
    const seconds = durationSeconds(options.expiresIn ?? '1h')
    const expires = Math.floor(Date.now() / 1000) + seconds
    return `${this.mediaURL(key)}?expires=${expires}&signature=${this.mediaSignature(key, expires)}`
  }

  /** Whether a signed link to a private file is genuine and not expired. */
  verifyMediaSignature(key: string, expires: string | null, signature: string | null): boolean {
    const at = Number(expires)
    if (!signature || !Number.isInteger(at) || at < Date.now() / 1000) return false
    const expected = Buffer.from(this.mediaSignature(key, at))
    const given = Buffer.from(signature)
    return expected.length === given.length && timingSafeEqual(expected, given)
  }

  private mediaSignature(key: string, expires: number): string {
    return createHmac('sha256', this.config.secret)
      .update(`media:${key}:${expires}`)
      .digest('base64url')
  }

  /**
   * How many documents use any of these files in a top-level upload field (rich text and fields
   * inside groups, arrays and blocks are not counted). Drafts count too.
   */
  async mediaUsage(ids: readonly ID[]): Promise<number> {
    if (ids.length === 0) return 0
    let count = 0
    for (const config of this.config.collections) {
      if (INTERNAL_COLLECTIONS.has(config.slug)) continue
      for (const field of config.fields) {
        if (field.type !== 'upload') continue
        count += await this.db.count({
          collection: config.slug,
          where: { [field.name]: { in: [...ids] } },
        })
      }
    }
    return count
  }

  /** The storage for public files, or for private ones. */
  storageFor(isPrivate: boolean): StorageAdapter {
    if (!isPrivate) return this.storage
    if (!this.privateStorage)
      throw new EasyCMSError(
        'Private folders need upload.privateStorage: the storage has public URLs, so private files must be kept elsewhere',
        500,
      )
    return this.privateStorage
  }

  /**
   * Copies a file and its resized copies to the other storage under their new names (`.private`
   * added or removed). Returns the fields to save, and `cleanUp` to delete the old copies once
   * the document points to the new ones.
   */
  private async relocate(doc: RawDocument, toPrivate: boolean) {
    const from = this.storageFor(doc.private === true)
    const to = this.storageFor(toPrivate)
    const contentType = String(doc.mimeType ?? 'application/octet-stream')
    const filename = withPrivacy(String(doc.filename), toPrivate)
    const old = [String(doc.filename)]
    const copy = async (source: string, target: string) => {
      const file = await from.get(source)
      // A copy that is gone already has nothing to move.
      if (file) await to.put(target, file.body, { contentType })
    }
    await copy(String(doc.filename), filename)
    const sizes: Record<string, Record<string, unknown>> = {}
    for (const [name, size] of Object.entries(
      (doc.sizes ?? {}) as Record<string, Record<string, unknown>>,
    )) {
      const key = sizeKey(filename, name)
      await copy(String(size.filename), key)
      old.push(String(size.filename))
      sizes[name] = { ...size, filename: key }
    }
    return {
      patch: { filename, sizes, private: toPrivate },
      cleanUp: async () => {
        for (const key of old) await from.delete(key).catch(() => {})
      },
    }
  }

  /** A folder's name, parent and permissions; private only with somewhere private to keep files. */
  private async validateFolder(data: Data, self: ID | undefined): Promise<void> {
    await this.folders.validate(data, self)
    if (data.private === true && !this.privateStorage)
      throw new ValidationError(MEDIA_FOLDERS, [
        {
          field: 'private',
          message:
            'needs upload.privateStorage: the storage gives files public URLs, so private files must be kept elsewhere',
        },
      ])
  }

  /**
   * Refuses a change that would move more than 200 files between storages in one request: they
   * are copied one by one, which could outlast a serverless function.
   */
  private async checkMoveLimit(folders: readonly { id: ID; private: boolean }[]): Promise<void> {
    let count = 0
    for (const f of folders)
      count += await this.db.count({
        collection: MEDIA,
        where: andWhere(
          { folder: { equals: f.id } },
          f.private ? PUBLIC_FILES : { private: { equals: true } },
        ),
      })
    if (count > MAX_FILES_TO_MOVE)
      throw new ValidationError(MEDIA_FOLDERS, [
        {
          field: 'private',
          message: `${count} files would move between public and private storage; move at most ${MAX_FILES_TO_MOVE} at a time (folder by folder)`,
        },
      ])
  }

  /** After a folder became private or public (or moved): its files follow, in every subfolder. */
  private async settlePrivacy(folder: ID): Promise<void> {
    for (const f of await this.folders.subtree(folder))
      await this.settleFiles({ folder: { equals: f.id } }, f.private)
  }

  /** Files at the top level are public. */
  private async settleTopLevel(): Promise<void> {
    await this.settleFiles({ folder: { exists: false } }, false)
  }

  private async settleFiles(where: Where, isPrivate: boolean): Promise<void> {
    const found = await this.db.find({
      collection: MEDIA,
      where: andWhere(where, isPrivate ? PUBLIC_FILES : { private: { equals: true } }),
      sort: [],
      limit: 0,
      page: 1,
    })
    for (const doc of found.docs) {
      const moved = await this.relocate(doc, isPrivate)
      const { id, ...rest } = doc
      await this.db.update({ collection: MEDIA, id, data: { ...rest, ...moved.patch } })
      await moved.cleanUp()
    }
  }

  update<S extends Slug<C>>(
    collection: S,
    id: ID,
    data: Update<C, S>,
    options: UpdateOptions & { where: Where },
  ): Promise<Doc<C, S> | null>
  update<S extends Slug<C>>(
    collection: S,
    id: ID,
    data: Update<C, S>,
    options?: UpdateOptions & { where?: undefined },
  ): Promise<Doc<C, S>>
  async update<S extends Slug<C>>(
    collection: S,
    id: ID,
    data: Update<C, S>,
    options: UpdateOptions = {},
  ): Promise<Doc<C, S> | null> {
    return (await this.updateDocument(collection, id, asObject(data, collection), options)) as Doc<
      C,
      S
    > | null
  }

  /**
   * Adds `by` (negative to take away) to a top-level number field in one database statement, so
   * concurrent calls never lose a change, e.g. stock or a counter. Skips hooks, validation, access
   * and versions. Returns the new value, or `null` when `min` / `max` would be passed.
   */
  async increment<S extends Slug<C>>(
    collection: S,
    id: ID,
    field: string,
    by: number,
    options: IncrementOptions = {},
  ): Promise<number | null> {
    this.collection(collection)
    const parsed = parseId(id)
    if (parsed === undefined) throw new NotFoundError(collection, id)
    return this.db.increment({ collection, id: parsed, field, by, ...options })
  }

  /**
   * Takes a document off the site: its status becomes `draft`. With versions and drafts, a plain
   * `update` with `status: 'draft'` only saves a draft and leaves the published document live;
   * this is how to unpublish it.
   */
  async unpublish<S extends Slug<C>>(
    collection: S,
    id: ID,
    options: DepthOptions = {},
  ): Promise<Doc<C, S>> {
    const config = this.collection(collection)
    if (!config.drafts) throw new QueryError(`"${collection}" has no drafts`)
    return (await this.updateDocument(
      collection,
      id,
      { status: 'draft' },
      options,
      'unpublish',
    )) as Doc<C, S>
  }

  /** Throws away the unpublished draft of a published document, going back to what is live. */
  async discardDraft<S extends Slug<C>>(
    collection: S,
    id: ID,
    options: DepthOptions = {},
  ): Promise<Doc<C, S>> {
    const config = this.collection(collection)
    const guard = guardOf(options)
    const parsed = parseId(id)
    const existing =
      parsed === undefined ? null : await this.db.findById({ collection, id: parsed })
    if (!existing || parsed === undefined) throw new NotFoundError(collection, id)
    await this.checkDocumentAccess(config, 'update', guard, parsed, undefined)
    const [current] = await this.withDrafts(config, [existing])
    if (current !== existing) {
      // The published document becomes the latest version again; the draft stays in history.
      await this.saveVersion(config, collectionParent(collection), parsed, existing, guard)
    }
    const [out] = await this.output(config, [existing], guard, { ...options, draft: true })
    return out as Doc<C, S>
  }

  /** Saved versions of a document, newest first. Needs update access to the document. */
  async findVersions<S extends Slug<C>>(
    collection: S,
    id: ID,
    options: AccessOptions & { limit?: number; page?: number } = {},
  ): Promise<PaginatedDocs<VersionSummary>> {
    const { config, parsed } = await this.versionTarget(collection, id, options)
    return this.versions.list(
      collectionParent(config.slug),
      parsed,
      options.limit ?? 20,
      options.page ?? 1,
    )
  }

  /** One saved version with the document as it was then. */
  async findVersion<S extends Slug<C>>(
    collection: S,
    id: ID,
    versionId: ID,
    options: DepthOptions = {},
  ): Promise<Version<Doc<C, S>> | null> {
    const { config, parsed, existing } = await this.versionTarget(collection, id, options)
    const version = await this.versions.get(collectionParent(config.slug), parsed, versionId)
    if (!version) return null
    const doc = {
      ...version.data,
      id: parsed,
      createdAt: existing.createdAt,
      updatedAt: version.createdAt,
    }
    const [out] = await this.output(config, [doc as RawDocument], guardOf(options), {
      ...options,
      draft: true,
    })
    return { ...version, data: out as Doc<C, S> }
  }

  /**
   * Makes an old version the current content, as a new version. With drafts it is restored as
   * a draft (publish it to put it live); access, hooks and validation run as for `update`.
   */
  async restoreVersion<S extends Slug<C>>(
    collection: S,
    id: ID,
    versionId: ID,
    options: DepthOptions = {},
  ): Promise<Doc<C, S>> {
    const { config, parsed } = await this.versionTarget(collection, id, options)
    const version = await this.versions.get(collectionParent(config.slug), parsed, versionId)
    if (!version) throw new NotFoundError(`${collection} version`, versionId)
    const { status: _status, ...data } = version.data
    return (await this.updateDocument(
      collection,
      parsed,
      config.drafts ? { ...data, status: 'draft' } : data,
      options,
      'restore',
    )) as Doc<C, S>
  }

  /**
   * Live preview: the document as it would be read if `data` were saved on top of its current
   * state (or as a new document when `id` is `null`), with relationships populated and
   * `afterRead` hooks applied. Nothing is written. Also returns the page URL from `preview`.
   */
  async preview<S extends Slug<C>>(
    collection: S,
    id: ID | null,
    data: Record<string, unknown>,
    options: DepthOptions = {},
  ): Promise<LivePreview<Doc<C, S>>> {
    const config = this.collection(collection)
    const guard = guardOf(options)
    const raw = asObject(data, collection)
    let base: RawDocument | undefined
    let parsed: ID | undefined
    if (id === null) {
      if (guard.enforce) {
        await this.checkGrant(guard, { collection }, 'create')
        const allowed = await evaluateAccess(config.access?.create, {
          user: guard.user,
          context: guard.context,
          data: raw,
        })
        if (allowed !== true) throw deny(guard.user)
      }
    } else {
      parsed = parseId(id)
      const existing =
        parsed === undefined ? null : await this.db.findById({ collection, id: parsed })
      if (!existing || parsed === undefined) throw new NotFoundError(collection, id)
      await this.checkDocumentAccess(config, 'update', guard, parsed, raw)
      ;[base] = await this.withDrafts(config, [existing])
    }
    const { input } = splitPassword(config, raw)
    const filtered = await filterInput(
      config.fields,
      input,
      await this.fieldChecker('update', guard, parsed, input),
    )
    const localized = this.toMaps(config, filtered, base ?? {}, options)
    const merged = base
      ? mergeForUpdate(config.fields, base, localized)
      : applyDefaults(config.fields, localized, this.config.localization)
    if (config.drafts) merged.status = filtered.status ?? base?.status ?? 'draft'
    const doc = await this.previewDoc(
      config,
      generateSlugs(config.fields, merged, this.config.localization),
      {
        id: parsed ?? 0,
        createdAt: base?.createdAt ?? new Date().toISOString(),
      },
      options,
    )
    const [out] = await this.output(config, [doc], guard, { ...options, draft: true })
    return { doc: out as Doc<C, S>, url: this.previewURL(config, out as RawDocument, options) }
  }

  /**
   * A token that lets a page read one document's current draft for a while (default one hour),
   * without a login: `GET /api/cms/:collection/:id?preview=<token>`. The admin adds one to the
   * preview URL as `easy-cms-preview`, for sites on another origin.
   */
  createPreviewToken(
    target: { collection: string; id: ID } | { global: string },
    options: { expiresIn?: number } = {},
  ): string {
    const seconds = options.expiresIn ?? 60 * 60
    const normalized =
      'global' in target ? target : { collection: target.collection, id: String(target.id) }
    return signPreviewToken(this.config.secret, normalized, Date.now() + seconds * 1000)
  }

  /** What a preview token opens, or `null` when it is invalid or expired. */
  verifyPreviewToken(token: string | null | undefined) {
    return token ? verifyPreviewToken(this.config.secret, token) : null
  }

  /** Live preview of a global. See `preview`. */
  async previewGlobal<S extends GSlug<C>>(
    slug: S,
    data: Record<string, unknown>,
    options: DepthOptions = {},
  ): Promise<LivePreview<GDoc<C, S>>> {
    const config = this.global(slug)
    const guard = guardOf(options)
    await this.checkGlobalAccess(config, 'update', guard)
    const raw = asObject(data, slug)
    const input = await filterInput(
      config.fields,
      raw,
      await this.fieldChecker('update', guard, undefined, raw),
    )
    const key = this.globalKey(config, guard)
    const saved = (key ? await this.db.findGlobal({ slug: key }) : null) ?? {}
    const current = await this.globalDraft(config, saved, key)
    const merged = generateSlugs(
      config.fields,
      applyDefaults(
        config.fields,
        mergeForUpdate(config.fields, current, this.toMaps(config, input, current, options)),
        this.config.localization,
      ),
      this.config.localization,
    )
    if (config.drafts) merged.status = input.status ?? current.status ?? 'draft'
    const doc = await this.previewDoc(config, merged, { id: 0 }, options)
    const [out] = await this.output(config, [doc], guard, { ...options, draft: true })
    const { id: _id, ...global } = out as RawDocument
    return { doc: global as GDoc<C, S>, url: this.previewURL(config, global, options) }
  }

  /** Coerces preview input like a save would, keeping values that would fail validation. */
  private async previewDoc(
    config: CollectionConfig | GlobalConfig,
    data: Data,
    system: { id: ID; createdAt?: unknown },
    options: { locale?: string } = {},
  ): Promise<RawDocument> {
    const locale = this.localeOf(options)
    const { data: clean } = await validateFields(config.fields, data, {
      operation: 'update',
      root: data,
      skipRequired: true,
      localization: this.config.localization,
      ...(locale !== undefined && locale !== ALL_LOCALES ? { locale } : {}),
    })
    return {
      ...data,
      ...clean,
      ...(config.drafts ? { status: data.status } : {}),
      ...system,
      updatedAt: new Date().toISOString(),
    } as RawDocument
  }

  private previewURL(
    config: CollectionConfig | GlobalConfig,
    doc: Data,
    options: { locale?: string },
  ): string | null {
    if (!config.preview) return null
    const content = this.localeOf(options)
    const locale = content && content !== ALL_LOCALES ? content : this.config.admin.locale
    try {
      return config.preview({ doc, locale }) ?? null
    } catch (error) {
      this.logger.error(`preview URL of "${config.slug}" failed: ${(error as Error).message}`)
      return null
    }
  }

  private async versionTarget(collection: string, id: ID, options: AccessOptions) {
    const config = this.collection(collection)
    if (!versionLimit(config)) throw new QueryError(`"${collection}" has no versions`)
    const parsed = parseId(id)
    const existing =
      parsed === undefined ? null : await this.db.findById({ collection, id: parsed })
    if (!existing || parsed === undefined) throw new NotFoundError(collection, id)
    // History holds unpublished content: only people who may edit the document can see it.
    await this.checkDocumentAccess(config, 'update', guardOf(options), parsed, undefined)
    return { config, parsed, existing }
  }

  private async updateDocument(
    collection: string,
    id: ID,
    raw: Data,
    options: UpdateOptions,
    mode: 'save' | 'unpublish' | 'restore' = 'save',
  ): Promise<RawDocument | null> {
    const config = this.collection(collection)
    const guard = guardOf(options)
    const parsed = parseId(id)
    const existing =
      parsed === undefined ? null : await this.db.findById({ collection, id: parsed })
    if (!existing || parsed === undefined) throw new NotFoundError(collection, id)
    await this.checkDocumentAccess(config, 'update', guard, parsed, raw)
    if (guard.enforce && inFolders(this.config, collection)) {
      const key = collection === MEDIA ? 'folder' : 'parent'
      if (Object.hasOwn(raw, key) && String(raw[key] ?? null) !== String(existing[key] ?? null))
        await this.folders.checkTarget(guard.user, collection, folderOf(collection, raw))
    }
    if (config.drafts && (mode === 'unpublish' || raw.status === 'published'))
      await this.checkDocumentGrant(guard, collection, 'publish', parsed)
    // With separate drafts, edits apply to the pending draft when there is one.
    const [drafted] = (await this.withDrafts(config, [existing])) as [RawDocument]
    const live = options.live === true && mode === 'save'
    const current = live ? existing : drafted
    if (live && Object.hasOwn(raw, 'status')) {
      const { status: _status, ...rest } = raw
      raw = rest
    }

    const { input, password } = splitPassword(config, raw)
    const filtered = await filterInput(
      config.fields,
      input,
      await this.fieldChecker('update', guard, parsed, input),
    )
    // Versions hold every locale, so a restore writes the maps as they are.
    const localized =
      mode === 'restore' ? filtered : this.toMaps(config, filtered, current, options)
    let merged = mergeForUpdate(config.fields, current, localized)
    if (config.drafts)
      merged.status = Object.hasOwn(filtered, 'status') ? filtered.status : current.status
    const base = this.hookArgs(config, guard)
    merged = await this.transform(
      config.hooks?.beforeValidate,
      'data',
      { ...base, operation: 'update', originalDoc: current },
      merged,
    )
    let prepared = await this.prepare(
      config,
      generateSlugs(config.fields, merged, this.config.localization),
      'update',
      parsed,
      options,
      guard,
    )
    prepared = await this.transform(
      config.hooks?.beforeChange,
      'data',
      { ...base, operation: 'update', originalDoc: current },
      prepared,
    )
    const now = new Date().toISOString()

    // A draft of a published document: keep it as a version, leave the live document alone.
    if (
      mode !== 'unpublish' &&
      this.separateDrafts(config) &&
      existing.status === 'published' &&
      prepared.status === 'draft'
    ) {
      if (password !== undefined) {
        throw new ValidationError(collection, [
          { field: 'password', message: 'cannot be changed in a draft; publish instead' },
        ])
      }
      const draft = { ...prepared, id: parsed, createdAt: existing.createdAt, updatedAt: now }
      await this.saveVersion(config, collectionParent(collection), parsed, draft, guard)
      await this.notify(config.hooks?.afterChange, 'afterChange', config.slug, {
        ...base,
        doc: draft,
        previousDoc: current,
        operation: 'update',
      })
      this.emitChange(config, 'draft', draft)
      await this.audited(config, 'draft', draft, current, guard, mode)
      const [out] = await this.output(config, [draft as RawDocument], guard, {
        ...options,
        draft: true,
      })
      return out as RawDocument
    }

    if (config.slug === USERS) await this.guardLastAdmin(parsed, existing, prepared)
    if (password !== undefined) prepared.passwordHash = await hashPassword(password)
    if (collection === MEDIA_FOLDERS) {
      await this.validateFolder(prepared, parsed)
      if (
        prepared.private !== existing.private ||
        String(prepared.parent ?? null) !== String(existing.parent ?? null)
      )
        await this.checkMoveLimit(
          await this.folders.privacyAfter(parsed, {
            private: prepared.private === true,
            parent: (prepared.parent as ID | null | undefined) ?? null,
          }),
        )
    }
    // A file moved between a public and a private folder moves to the other storage, renamed.
    let moved: Awaited<ReturnType<typeof this.relocate>> | undefined
    if (collection === MEDIA && this.folders.enabled) {
      const toPrivate = await this.folders.isPrivate(folderOf(MEDIA, prepared))
      if (toPrivate !== (existing.private === true)) {
        moved = await this.relocate(existing, toPrivate)
        Object.assign(prepared, moved.patch)
      }
    }

    const data = { ...prepared, createdAt: existing.createdAt, updatedAt: now }
    const doc = options.where
      ? await this.db.update({ collection, id: parsed, data, where: options.where })
      : await this.db.update({ collection, id: parsed, data })
    if (!doc) return null
    if (moved) await moved.cleanUp()
    if (collection === MEDIA_FOLDERS) {
      this.folders.invalidate()
      // Made private (or public), or moved into a private folder: its files follow.
      if (
        prepared.private !== existing.private ||
        String(prepared.parent ?? null) !== String(existing.parent ?? null)
      )
        await this.settlePrivacy(parsed)
    }
    // Upkeep, not an edit: no version (which would also hide a pending draft behind it).
    if (!live) await this.saveVersion(config, collectionParent(collection), parsed, doc, guard)
    // A new password signs the user out everywhere.
    if (password !== undefined) await this.auth.revokeSessions(parsed)
    await this.notify(config.hooks?.afterChange, 'afterChange', config.slug, {
      ...base,
      doc,
      previousDoc: current,
      operation: 'update',
    })
    this.emitChange(config, 'update', doc, existing.status)
    await this.audited(config, 'update', doc, current, guard, mode)
    const [out] = await this.output(config, [doc], guard, { ...options, draft: true })
    return out as RawDocument
  }

  /**
   * Deletes a document. Deleting a user with roles from the admin (`auth.rbac`): `transferTo`
   * gives the documents they own to another user; without it they have no owner.
   */
  async delete<S extends Slug<C>>(
    collection: S,
    id: ID,
    options: AccessOptions & { transferTo?: ID | null } = {},
  ): Promise<Doc<C, S>> {
    const config = this.collection(collection)
    const guard = guardOf(options)
    const parsed = parseId(id)
    const existing =
      parsed === undefined ? null : await this.db.findById({ collection, id: parsed })
    if (!existing || parsed === undefined) throw new NotFoundError(collection, id)
    await this.checkDocumentAccess(config, 'delete', guard, parsed, undefined)
    if (config.slug === USERS)
      await this.guardLastAdmin(parsed, existing, { ...existing, active: false })
    const base = this.hookArgs(config, guard)
    for (const hook of config.hooks?.beforeDelete ?? []) await hook({ ...base, id: parsed })
    if (config.slug === USERS) {
      const to = options.transferTo
      if (to !== undefined && to !== null) {
        const target = parseId(to)
        const heir =
          target === undefined ? null : await this.db.findById({ collection: USERS, id: target })
        if (!heir || String(heir.id) === String(parsed))
          throw new ValidationError(USERS, [
            { field: 'transferTo', message: 'must be another existing user' },
          ])
        await this.roles.transfer(parsed, heir.id)
      } else await this.roles.transfer(parsed, null)
      await this.auth.revokeSessions(parsed)
      await this.auth.sso.forget(parsed)
    }
    // A folder's files and subfolders move up to its parent (as if it were no longer private).
    if (collection === MEDIA_FOLDERS) {
      await this.checkMoveLimit(await this.folders.privacyAfter(parsed, { private: false }))
      await this.folders.release(existing)
    }
    await this.db.delete({ collection, id: parsed })
    if (collection === MEDIA_FOLDERS) {
      this.folders.invalidate()
      // What moved up may now be public (or private).
      const parent = (existing.parent as ID | null | undefined) ?? null
      if (parent !== null) await this.settlePrivacy(parent)
      else await this.settleTopLevel()
    }
    if (versionLimit(config)) await this.versions.deleteAll(collectionParent(collection), parsed)
    if (config.schedule) {
      for (const job of await this.pendingJobs(collection, parsed))
        await this.db.delete({ collection: SCHEDULED_JOBS, id: job.id })
    }
    await this.notify(config.hooks?.afterDelete, 'afterDelete', config.slug, {
      ...base,
      id: parsed,
      doc: existing,
    })
    this.emitChange(config, 'delete', existing)
    await this.audited(config, 'delete', existing, existing, guard)
    const [out] = await this.output(config, [existing], guard, { depth: 0, draft: true })
    return out as Doc<C, S>
  }

  async findGlobal<S extends GSlug<C>>(slug: S, options: ReadOptions = {}): Promise<GDoc<C, S>> {
    const config = this.global(slug)
    const guard = guardOf(options)
    await this.checkGlobalAccess(config, 'read', guard)
    return this.readGlobal(config, this.globalKey(config, guard), guard, options) as Promise<
      GDoc<C, S>
    >
  }

  /** A global as stored under `key` (see `globalKey`); empty when there is no key. */
  private async readGlobal(
    config: GlobalConfig,
    key: string | null,
    guard: Guard,
    options: ReadOptions,
  ): Promise<Data> {
    const saved = key ? await this.db.findGlobal({ slug: key }) : null
    const stored =
      saved && readsDrafts(guard, options.draft)
        ? await this.globalDraft(config, saved, key)
        : saved
    const data = fillMissing(
      config.fields,
      applyDefaults(config.fields, stored ?? {}, this.config.localization),
    )
    if (!stored) {
      data.updatedAt = null
      if (config.drafts) data.status = 'draft'
    }
    const [out] = await this.output(config, [{ ...data, id: 0 }], guard, options)
    const { id: _id, ...doc } = out as RawDocument
    return doc
  }

  /**
   * Where a global is kept: its slug, or `<slug>@<scope>` for globals with `scope` (e.g. one per
   * tenant). `null` when the call has no scope: reads give the global empty. `scope` is given by
   * scheduled jobs, which have no request.
   */
  private globalKey(config: GlobalConfig, guard: Guard, scope?: string): string | null {
    if (scope !== undefined) return `${config.slug}@${scope}`
    if (!config.scope) return config.slug
    const own = config.scope({ context: guard.context, user: guard.user })
    if (own === undefined) return config.slug
    return own === null ? null : `${config.slug}@${own}`
  }

  /** `globalKey` for changes, which need a scope. */
  private writeKey(config: GlobalConfig, guard: Guard, scope?: string): string {
    const key = this.globalKey(config, guard, scope)
    if (key === null)
      throw new QueryError(
        `"${config.slug}" has a value per scope (e.g. per tenant): choose one to change it`,
      )
    return key
  }

  async updateGlobal<S extends GSlug<C>>(
    slug: S,
    data: GInput<C, S>,
    options: DepthOptions = {},
  ): Promise<GDoc<C, S>> {
    return this.saveGlobal(slug, asObject(data, slug), options) as Promise<GDoc<C, S>>
  }

  /** Takes a global off the site (`status: 'draft'`). See `unpublish`. */
  async unpublishGlobal<S extends GSlug<C>>(slug: S, options: DepthOptions = {}) {
    if (!this.global(slug).drafts) throw new QueryError(`"${slug}" has no drafts`)
    return this.saveGlobal(slug, { status: 'draft' }, options, 'unpublish') as Promise<GDoc<C, S>>
  }

  /** Throws away the unpublished draft of a published global. */
  async discardGlobalDraft<S extends GSlug<C>>(slug: S, options: DepthOptions = {}) {
    const config = this.global(slug)
    const guard = guardOf(options)
    await this.checkGlobalAccess(config, 'update', guard)
    const key = this.writeKey(config, guard)
    const saved = await this.db.findGlobal({ slug: key })
    if (saved && (await this.globalDraft(config, saved, key)) !== saved) {
      await this.saveVersion(config, globalParent(key), 0, saved, guard)
    }
    return this.findGlobal(slug, { ...options, draft: true })
  }

  /** Saved versions of a global, newest first. Needs update access. */
  async findGlobalVersions<S extends GSlug<C>>(
    slug: S,
    options: AccessOptions & { limit?: number; page?: number } = {},
  ): Promise<PaginatedDocs<VersionSummary>> {
    const { key } = await this.globalVersionTarget(slug, options)
    return this.versions.list(globalParent(key), 0, options.limit ?? 20, options.page ?? 1)
  }

  async findGlobalVersion<S extends GSlug<C>>(
    slug: S,
    versionId: ID,
    options: DepthOptions = {},
  ): Promise<Version<GDoc<C, S>> | null> {
    const { config, key } = await this.globalVersionTarget(slug, options)
    const version = await this.versions.get(globalParent(key), 0, versionId)
    if (!version) return null
    const data = fillMissing(
      config.fields,
      applyDefaults(config.fields, version.data, this.config.localization),
    )
    const [out] = await this.output(config, [{ ...data, id: 0 } as RawDocument], guardOf(options), {
      ...options,
      draft: true,
    })
    const { id: _id, ...doc } = out as RawDocument
    return { ...version, data: { ...doc, updatedAt: version.createdAt } as GDoc<C, S> }
  }

  /** Makes an old version of a global current (as a draft when the global has drafts). */
  async restoreGlobalVersion<S extends GSlug<C>>(
    slug: S,
    versionId: ID,
    options: DepthOptions = {},
  ): Promise<GDoc<C, S>> {
    const { config, key } = await this.globalVersionTarget(slug, options)
    const version = await this.versions.get(globalParent(key), 0, versionId)
    if (!version) throw new NotFoundError(`${slug} version`, versionId)
    const { status: _status, ...data } = version.data
    return this.saveGlobal(
      slug,
      config.drafts ? { ...data, status: 'draft' } : data,
      options,
      'restore',
    ) as Promise<GDoc<C, S>>
  }

  private async globalVersionTarget(slug: string, options: AccessOptions) {
    const config = this.global(slug)
    if (!versionLimit(config)) throw new QueryError(`"${slug}" has no versions`)
    const guard = guardOf(options)
    await this.checkGlobalAccess(config, 'update', guard)
    return { config, key: this.writeKey(config, guard) }
  }

  /** The global's pending draft when it has one (see `withDrafts`), otherwise `saved`. */
  private async globalDraft(config: GlobalConfig, saved: Data, key: string | null): Promise<Data> {
    if (!key || !this.separateDrafts(config) || saved.status !== 'published') return saved
    const version = (await this.versions.latest(globalParent(key), [0])).get('0')
    if (version?.status !== 'draft') return saved
    return { ...version.data, updatedAt: version.createdAt, status: 'draft' }
  }

  private async saveGlobal(
    slug: string,
    raw: Data,
    options: DepthOptions,
    mode: 'save' | 'unpublish' | 'restore' = 'save',
    /** The scope of a scheduled job (see `globalKey`). */
    scope?: string,
  ): Promise<Data> {
    const config = this.global(slug)
    const guard = guardOf(options)
    await this.checkGlobalAccess(config, 'update', guard)
    const key = this.writeKey(config, guard, scope)
    if (config.drafts && (mode === 'unpublish' || raw.status === 'published'))
      await this.checkGrant(guard, { global: slug }, 'publish')
    const input = await filterInput(
      config.fields,
      raw,
      await this.fieldChecker('update', guard, undefined, raw),
    )
    const existing = (await this.db.findGlobal({ slug: key })) ?? {}
    const current = await this.globalDraft(config, existing, key)
    const localized = mode === 'restore' ? input : this.toMaps(config, input, current, options)

    const merged = generateSlugs(
      config.fields,
      applyDefaults(
        config.fields,
        mergeForUpdate(config.fields, current, localized),
        this.config.localization,
      ),
      this.config.localization,
    )
    if (config.drafts) merged.status = input.status ?? current.status ?? 'draft'
    const base = this.hookArgs(config, guard)
    let prepared = await this.prepare(config, merged, 'update', undefined, options, guard)
    prepared = await this.transform(
      config.hooks?.beforeChange,
      'data',
      { ...base, operation: 'update', originalDoc: current },
      prepared,
    )
    const now = new Date().toISOString()

    if (
      mode !== 'unpublish' &&
      this.separateDrafts(config) &&
      existing.status === 'published' &&
      prepared.status === 'draft'
    ) {
      const draft = { ...prepared, updatedAt: now }
      await this.saveVersion(config, globalParent(key), 0, draft, guard)
      await this.notify(config.hooks?.afterChange, 'afterChange', slug, {
        ...base,
        doc: draft,
        previousDoc: current,
        operation: 'update',
      })
      this.emitChange(config, 'draft', draft)
      await this.audited(config, 'draft', draft, current, guard, mode)
      return this.readGlobal(config, key, guard, { ...options, draft: true })
    }

    const doc = await this.db.updateGlobal({ slug: key, data: { ...prepared, updatedAt: now } })
    await this.saveVersion(config, globalParent(key), 0, doc, guard)
    await this.notify(config.hooks?.afterChange, 'afterChange', slug, {
      ...base,
      doc,
      previousDoc: current,
      operation: 'update',
    })
    this.emitChange(config, 'update', doc, existing.status)
    await this.audited(config, 'update', doc, current, guard, mode)
    return this.readGlobal(config, key, guard, { ...options, draft: true })
  }

  /**
   * What `user` may do with one document. Resolves `where`-style access
   * against the document, so the admin UI can hide actions precisely.
   */
  async documentPermissions(
    collection: Slug<C>,
    id: ID,
    user: AuthUser | null,
    context: RequestContext = NO_CONTEXT,
  ): Promise<{ update: boolean; delete: boolean }> {
    const config = this.collection(collection)
    const parsed = parseId(id)
    if (parsed === undefined) return { update: false, delete: false }
    const guard: Guard = { enforce: true, user, context }
    const check = (operation: 'update' | 'delete') =>
      this.checkDocumentAccess(config, operation, guard, parsed, undefined).then(
        () => true,
        (error: unknown) => {
          if (error instanceof ForbiddenError || error instanceof UnauthorizedError) return false
          throw error
        },
      )
    return { update: await check('update'), delete: await check('delete') }
  }

  /** Closes the database connection. */
  /**
   * Waits until webhook deliveries in progress are done. Call it before a serverless function
   * returns, which may otherwise stop them.
   */
  flushWebhooks(): Promise<void> {
    return this.webhooks.flush()
  }

  /**
   * Sends an email with the config's `email` adapter, e.g. from a hook or plugin. Resolves once
   * the email is queued; it is sent in the background and retried from the queue if sending
   * fails. Without `email` in the config, the email is skipped with a warning.
   */
  sendEmail(message: EmailMessage): Promise<void> {
    return this.mailer.send(message)
  }

  /** Waits for emails being sent, e.g. before a serverless function returns. */
  flushEmails(): Promise<void> {
    return this.mailer.flush()
  }

  /** Emails queued until sent, stored in `email-deliveries`. */
  private emailQueue(): EmailQueue {
    const collection = EMAIL_DELIVERIES
    const toRow = (email: QueuedEmail, createdAt?: string) => {
      const now = new Date().toISOString()
      return { ...email, createdAt: createdAt ?? now, updatedAt: now } as unknown as Data
    }
    return {
      add: async (email) => (await this.db.create({ collection, data: toRow(email) })).id,
      update: async (id, email) => {
        const current = await this.db.findById({ collection, id })
        await this.db.update({
          collection,
          id,
          data: toRow(email, current?.createdAt as string | undefined),
        })
      },
      remove: async (id) => {
        await this.db.delete({ collection, id })
      },
      due: async (now, limit) => {
        const { docs } = await this.db.find({
          collection,
          where: {
            and: [{ state: { equals: 'pending' } }, { nextAttemptAt: { lte: now.toISOString() } }],
          },
          sort: ['nextAttemptAt'],
          limit,
          page: 1,
        })
        return docs as unknown as (QueuedEmail & { id: ID })[]
      },
    }
  }

  async destroy(): Promise<void> {
    if (this.schedulerTimer) clearInterval(this.schedulerTimer)
    await this.running
    await this.webhooks.flush()
    await this.mailer.flush()
    await this.db.destroy()
  }

  // --- Scheduled publishing --------------------------------------------------

  private schedulerTimer: ReturnType<typeof setInterval> | undefined
  private running: Promise<unknown> = Promise.resolve()

  /** Runs `runJobs` every `interval` ms in this process (`createEasyCMS` does this by default). */
  startScheduler(interval = 60_000): void {
    if (this.schedulerTimer) return
    this.schedulerTimer = setInterval(() => {
      this.running = this.running.then(() =>
        this.runJobs().catch((error) =>
          this.logger.error(`Scheduled jobs failed: ${(error as Error).message}`),
        ),
      )
    }, interval)
    this.schedulerTimer.unref?.()
  }

  /**
   * Runs due scheduled publishes and unpublishes, and retries failed webhook deliveries. What the
   * scheduler and the cron endpoint (`GET <api>/jobs/run`) call.
   */
  async runJobs(now: Date = new Date()): Promise<{
    ran: number
    failed: number
    webhooks: { sent: number; failed: number }
    emails: { sent: number; failed: number }
    jobs: { ran: number; failed: number }
  }> {
    // What jobs change is the scheduler's doing, in the audit log.
    return auditContext.run({ via: 'scheduler', user: null }, async () => {
      const scheduled = await this.runScheduled(now)
      await this.pruneFailedDeliveries(now)
      await runDueBackups(this as unknown as EasyCMS, now).catch((error) =>
        this.logger.error(`Backups: ${(error as Error).message}`),
      )
      await this.audit
        .upkeep(now)
        .catch((error) => this.logger.error(`Audit log: ${(error as Error).message}`))
      return {
        ...scheduled,
        webhooks: await this.retryWebhooks(now),
        emails: await this.mailer.retry(now),
        jobs: await this.runConfigJobs(now),
      }
    })
  }

  /** `jobs` of the config that are due; when each last ran is kept in the database. */
  private async runConfigJobs(now: Date): Promise<{ ran: number; failed: number }> {
    const { jobs } = this.config
    if (jobs.length === 0) return { ran: 0, failed: 0 }
    const last = ((await this.db.findGlobal({ slug: JOB_RUNS })) ?? {}) as Record<string, unknown>
    const runs: Record<string, string> = {}
    for (const [name, at] of Object.entries(last)) if (typeof at === 'string') runs[name] = at
    let ran = 0
    let failed = 0
    for (const job of jobs) {
      const previous = runs[job.name]
      if (
        job.every !== undefined &&
        previous !== undefined &&
        now.getTime() - Date.parse(previous) < job.every * 1000
      )
        continue
      runs[job.name] = now.toISOString()
      try {
        await job.run({ cms: this as unknown as EasyCMS, now })
        ran++
      } catch (error) {
        failed++
        this.logger.error(`Job ${job.name} failed: ${(error as Error).message}`)
      }
    }
    // `updatedAt` is the globals table's own column.
    await this.db.updateGlobal({ slug: JOB_RUNS, data: { ...runs, updatedAt: now.toISOString() } })
    return { ran, failed }
  }

  /**
   * Sends an event of the app or a plugin (`events` in the config, e.g. `order.paid`) to the
   * webhooks that list it. Returns at once; deliveries are queued and retried like content changes.
   */
  emit(event: string, data: Record<string, unknown>, about?: { collection: string; id: ID }): void {
    if (!this.config.events.includes(event))
      throw new QueryError(`Unknown event "${event}": add it to \`events\` in the config`)
    this.webhooks.emit(event, about ?? {}, data)
  }

  /**
   * Tries webhook deliveries that are due for another attempt. Deliveries are kept in the
   * database until they succeed, so they survive restarts.
   */
  retryWebhooks(now: Date = new Date()): Promise<{ sent: number; failed: number }> {
    return this.webhooks.retry(now)
  }

  /** Webhook deliveries until they succeed, stored in `webhook-deliveries`. */
  private webhookQueue(): WebhookQueue {
    const collection = WEBHOOK_DELIVERIES
    const toRow = (d: QueuedDelivery, createdAt?: string) => {
      const now = new Date().toISOString()
      return { ...d, createdAt: createdAt ?? now, updatedAt: now } as unknown as Data
    }
    return {
      add: async (delivery) => (await this.db.create({ collection, data: toRow(delivery) })).id,
      update: async (id, delivery) => {
        const current = await this.db.findById({ collection, id })
        await this.db.update({
          collection,
          id,
          data: toRow(delivery, current?.createdAt as string | undefined),
        })
      },
      remove: async (id) => {
        await this.db.delete({ collection, id })
      },
      due: async (now, limit) => {
        const { docs } = await this.db.find({
          collection,
          where: {
            and: [{ state: { equals: 'pending' } }, { nextAttemptAt: { lte: now.toISOString() } }],
          },
          sort: ['nextAttemptAt'],
          limit,
          page: 1,
        })
        return docs as unknown as (QueuedDelivery & { id: ID })[]
      },
    }
  }

  /**
   * Publishes or unpublishes documents whose scheduled time has come. Safe to call often, e.g.
   * from a cron job (`GET <api>/jobs/run`) where no process keeps running.
   */
  async runScheduled(now: Date = new Date()): Promise<{ ran: number; failed: number }> {
    if (!this.config.collections.some((c) => c.slug === SCHEDULED_JOBS))
      return { ran: 0, failed: 0 }
    const due = await this.db.find({
      collection: SCHEDULED_JOBS,
      where: {
        and: [{ state: { equals: 'pending' } }, { runAt: { lte: now.toISOString() } }],
      },
      sort: ['runAt'],
      limit: 100,
      page: 1,
    })
    let failed = 0
    for (const row of due.docs) {
      const parent = String(row.parent)
      const action = row.action as ScheduledJob['action']
      try {
        if (parent.startsWith('global:')) {
          const { slug, scope } = splitGlobalKey(parent.slice('global:'.length))
          if (action === 'publish')
            await this.saveGlobal(slug, { status: 'published' }, {}, 'save', scope)
          else await this.saveGlobal(slug, { status: 'draft' }, {}, 'unpublish', scope)
        } else if (action === 'publish') {
          await this.updateDocument(parent, row.doc as ID, { status: 'published' }, { depth: 0 })
        } else {
          await this.updateDocument(
            parent,
            row.doc as ID,
            { status: 'draft' },
            { depth: 0 },
            'unpublish',
          )
        }
        await this.db.update({
          collection: SCHEDULED_JOBS,
          id: row.id,
          data: { ...row, state: 'done' },
        })
      } catch (error) {
        failed++
        const message = (error as Error).message
        this.logger.error(`Scheduled ${action} of ${parent} ${row.doc} failed: ${message}`)
        await this.db.update({
          collection: SCHEDULED_JOBS,
          id: row.id,
          data: { ...row, state: 'failed', error: message.slice(0, 500) },
        })
      }
    }
    return { ran: due.docs.length - failed, failed }
  }

  /** Schedules a publish or unpublish, replacing a pending job with the same action. */
  async schedule<S extends Slug<C>>(
    collection: S,
    id: ID,
    job: { action: 'publish' | 'unpublish'; at: Date | string },
    options: AccessOptions = {},
  ): Promise<ScheduledJob> {
    const { parsed } = await this.scheduleTarget(collection, id, options)
    return this.addJob(collection, parsed, job, options)
  }

  /** Pending jobs of a document, soonest first. */
  async scheduled<S extends Slug<C>>(
    collection: S,
    id: ID,
    options: AccessOptions = {},
  ): Promise<ScheduledJob[]> {
    const { parsed } = await this.scheduleTarget(collection, id, options)
    return this.pendingJobs(collection, parsed)
  }

  async cancelSchedule<S extends Slug<C>>(
    collection: S,
    id: ID,
    jobId: ID,
    options: AccessOptions = {},
  ): Promise<void> {
    const { parsed } = await this.scheduleTarget(collection, id, options)
    await this.removeJob(collection, parsed, jobId)
  }

  async scheduleGlobal<S extends GSlug<C>>(
    slug: S,
    job: { action: 'publish' | 'unpublish'; at: Date | string },
    options: AccessOptions = {},
  ): Promise<ScheduledJob> {
    const key = await this.globalScheduleTarget(slug, options)
    return this.addJob(`global:${key}`, 0, job, options)
  }

  async scheduledGlobal<S extends GSlug<C>>(slug: S, options: AccessOptions = {}) {
    const key = await this.globalScheduleTarget(slug, options)
    return this.pendingJobs(`global:${key}`, 0)
  }

  async cancelGlobalSchedule<S extends GSlug<C>>(
    slug: S,
    jobId: ID,
    options: AccessOptions = {},
  ): Promise<void> {
    const key = await this.globalScheduleTarget(slug, options)
    await this.removeJob(`global:${key}`, 0, jobId)
  }

  private async scheduleTarget(collection: string, id: ID, options: AccessOptions) {
    const config = this.collection(collection)
    if (!config.schedule) throw new QueryError(`"${collection}" has no schedule`)
    const parsed = parseId(id)
    const existing =
      parsed === undefined ? null : await this.db.findById({ collection, id: parsed })
    if (!existing || parsed === undefined) throw new NotFoundError(collection, id)
    await this.checkDocumentAccess(config, 'update', guardOf(options), parsed, undefined)
    await this.checkDocumentGrant(guardOf(options), collection, 'publish', parsed)
    return { config, parsed }
  }

  private async globalScheduleTarget(slug: string, options: AccessOptions) {
    const config = this.global(slug)
    if (!config.schedule) throw new QueryError(`"${slug}" has no schedule`)
    const guard = guardOf(options)
    await this.checkGlobalAccess(config, 'update', guard)
    await this.checkGrant(guard, { global: slug }, 'publish')
    return this.writeKey(config, guard)
  }

  private async addJob(
    parent: string,
    doc: ID,
    job: { action: 'publish' | 'unpublish'; at: Date | string },
    options: AccessOptions,
  ): Promise<ScheduledJob> {
    const runAt = new Date(job.at)
    const errors: FieldError[] = []
    if (job.action !== 'publish' && job.action !== 'unpublish')
      errors.push({ field: 'action', message: 'must be "publish" or "unpublish"' })
    if (Number.isNaN(runAt.getTime())) errors.push({ field: 'at', message: 'must be a valid date' })
    if (errors.length > 0) throw new ValidationError(SCHEDULED_JOBS, errors)
    for (const pending of await this.pendingJobs(parent, doc)) {
      if (pending.action === job.action)
        await this.db.delete({ collection: SCHEDULED_JOBS, id: pending.id })
    }
    const now = new Date().toISOString()
    const row = await this.db.create({
      collection: SCHEDULED_JOBS,
      data: {
        parent,
        doc,
        action: job.action,
        runAt: runAt.toISOString(),
        state: 'pending',
        error: null,
        author: guardOf(options).user?.id ?? null,
        createdAt: now,
        updatedAt: now,
      },
    })
    await this.audit.record({
      action: 'schedule',
      target: parent,
      ...(parent.startsWith('global:') ? {} : { doc }),
      ...(guardOf(options).user ? { user: guardOf(options).user } : {}),
      detail: { action: job.action, at: runAt.toISOString() },
    })
    return toJob(row)
  }

  /**
   * The next pending jobs across all collections and globals, soonest first; with access
   * enforced, only those the user may update.
   */
  async upcomingJobs(
    options: AccessOptions & { limit?: number } = {},
  ): Promise<(ScheduledJob & { collection?: string; global?: string; doc: ID })[]> {
    if (!this.config.collections.some((c) => c.slug === SCHEDULED_JOBS)) return []
    const guard = guardOf(options)
    const limit = options.limit ?? 10
    const rows = await this.db.find({
      collection: SCHEDULED_JOBS,
      where: { state: { equals: 'pending' } },
      sort: ['runAt'],
      limit: limit * 5,
      page: 1,
    })
    const allowed = new Map<string, boolean>()
    const may = async (parent: string) => {
      if (!guard.enforce) return true
      const cached = allowed.get(parent)
      if (cached !== undefined) return cached
      const global = parent.startsWith('global:')
        ? this.config.globals.find(
            (g) => g.slug === splitGlobalKey(parent.slice('global:'.length)).slug,
          )
        : undefined
      // A global kept per scope (e.g. tenant): only the jobs of the caller's.
      if (global && this.globalKey(global, guard) !== parent.slice('global:'.length)) {
        allowed.set(parent, false)
        return false
      }
      const config = parent.startsWith('global:')
        ? global
        : this.config.collections.find((c) => c.slug === parent)
      const access = config
        ? await evaluateAccess(config.access?.update, { user: guard.user, context: guard.context })
        : false
      const target = parent.startsWith('global:')
        ? { global: splitGlobalKey(parent.slice('global:'.length)).slug }
        : { collection: parent }
      const result =
        access !== false && (await this.roles.allows(guard.user, target, 'update')) !== false
      allowed.set(parent, result)
      return result
    }
    const jobs: (ScheduledJob & { collection?: string; global?: string; doc: ID })[] = []
    for (const row of rows.docs) {
      const parent = String(row.parent)
      if (!(await may(parent))) continue
      const target = parent.startsWith('global:')
        ? { global: splitGlobalKey(parent.slice('global:'.length)).slug }
        : { collection: parent }
      jobs.push({ ...toJob(row), ...target, doc: row.doc as ID })
      if (jobs.length === limit) break
    }
    return jobs
  }

  private async pendingJobs(parent: string, doc: ID): Promise<ScheduledJob[]> {
    const rows = await this.db.find({
      collection: SCHEDULED_JOBS,
      where: {
        and: [
          { parent: { equals: parent } },
          { doc: { equals: doc } },
          { state: { equals: 'pending' } },
        ],
      },
      sort: ['runAt'],
      limit: 0,
      page: 1,
    })
    return rows.docs.map(toJob)
  }

  private async removeJob(parent: string, doc: ID, jobId: ID) {
    const job = (await this.pendingJobs(parent, doc)).find((j) => String(j.id) === String(jobId))
    if (!job) throw new NotFoundError('scheduled job', jobId)
    await this.db.delete({ collection: SCHEDULED_JOBS, id: job.id })
    await this.audit.record({
      action: 'unschedule',
      target: parent,
      ...(parent.startsWith('global:') ? {} : { doc }),
      detail: { action: job.action, at: job.runAt },
    })
  }

  /**
   * @internal One attempt now for a saved webhook delivery or email (the admin's Retry): removed
   * when it is sent, otherwise kept as failed with the new error.
   */
  async retryDelivery(
    kind: 'webhook' | 'email',
    id: ID,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const collection = kind === 'webhook' ? WEBHOOK_DELIVERIES : EMAIL_DELIVERIES
    const row = await this.db.findById({ collection, id })
    if (!row) throw new NotFoundError(collection, id)
    const error =
      kind === 'webhook'
        ? await this.webhooks
            .sendNow(row as unknown as QueuedDelivery)
            .then((result) => (result.ok ? undefined : result.error))
        : await this.mailer.sendNow(String(row.message))
    if (error === undefined) {
      await this.db.delete({ collection, id })
      return { ok: true }
    }
    const { id: _id, ...data } = row
    await this.db.update({
      collection,
      id,
      data: {
        ...data,
        attempts: Number(row.attempts ?? 0) + 1,
        state: 'failed',
        error,
        updatedAt: new Date().toISOString(),
      },
    })
    return { ok: false, error }
  }

  /** Removes webhook deliveries and emails that failed more than 30 days ago. */
  private async pruneFailedDeliveries(now: Date): Promise<void> {
    const before = new Date(now.getTime() - 30 * 86_400_000).toISOString()
    for (const collection of [WEBHOOK_DELIVERIES, EMAIL_DELIVERIES]) {
      if (!this.config.collections.some((c) => c.slug === collection)) continue
      for (;;) {
        const { docs } = await this.db.find({
          collection,
          where: { and: [{ state: { equals: 'failed' } }, { updatedAt: { lt: before } }] },
          sort: ['updatedAt'],
          limit: 100,
          page: 1,
        })
        for (const doc of docs) await this.db.delete({ collection, id: doc.id })
        if (docs.length < 100) break
      }
    }
  }

  // -------------------------------------------------------------------------

  /** @internal */
  collection(slug: string): CollectionConfig {
    const config = this.config.collections.find((c) => c.slug === slug)
    if (!config) throw new QueryError(`Unknown collection "${slug}"`)
    return config
  }

  private global(slug: string): GlobalConfig {
    const config = this.config.globals.find((g) => g.slug === slug)
    if (!config) throw new QueryError(`Unknown global "${slug}"`)
    return config
  }

  /**
   * Refuses what a request's API key (see `ApiKeyPermissions`) or the user's role (`auth.rbac`)
   * does not allow. Returns a constraint when the role allows only the user's own account.
   */
  private async checkGrant(
    guard: Guard,
    target: { collection: string } | { global: string },
    operation: ApiKeyOperation,
  ): Promise<true | Where> {
    if (!guard.enforce) return true
    const name = 'collection' in target ? target.collection : target.global
    // Folders are part of the media library: grants on `media` cover them.
    const folders = 'collection' in target && target.collection === MEDIA_FOLDERS
    const granted = folders ? { collection: MEDIA } : target
    if (!keyAllows(guard.user, granted, operation))
      throw new ForbiddenError(`This API key may not ${operation} "${name}"`)
    let role = await this.roles.allows(guard.user, granted, operation)
    if (role === false) throw deny(guard.user)
    // "Own documents only" on media: folders they created.
    if (folders && role !== true && guard.user) role = { createdBy: { equals: guard.user.id } }
    const inFolder = await this.folders.where(guard.user, name, operation)
    if (inFolder === true) return role
    return role === true ? inFolder : { and: [role, inFolder] }
  }

  /** The query constraint read access adds, or `undefined` when there is none. Throws when denied. */
  private async readWhere(config: CollectionConfig, guard: Guard, where: Where | undefined) {
    if (!guard.enforce) return where
    const own = await this.checkGrant(guard, { collection: config.slug }, 'read')
    const access = await evaluateAccess(config.access?.read, {
      user: guard.user,
      context: guard.context,
    })
    if (access === false) throw deny(guard.user)
    await this.checkQueryFields(config, guard, where)
    return andWhere(andWhere(where, access), own)
  }

  private async checkDocumentAccess(
    config: CollectionConfig,
    operation: 'update' | 'delete',
    guard: Guard,
    id: ID,
    data: Data | undefined,
  ) {
    if (!guard.enforce) return
    const own = await this.checkGrant(guard, { collection: config.slug }, operation)
    const allowed = await evaluateAccess(config.access?.[operation], {
      user: guard.user,
      context: guard.context,
      id,
      ...(data ? { data } : {}),
    })
    const access =
      allowed === false ? false : (andWhere(own === true ? undefined : own, allowed) ?? true)
    if (access === true) return
    if (access !== false) {
      const matches = await this.db.count({
        collection: config.slug,
        where: andWhere(access, { id: { equals: id } }),
      })
      if (matches > 0) return
    }
    throw deny(guard.user)
  }

  private async checkGlobalAccess(
    config: GlobalConfig,
    operation: 'read' | 'update',
    guard: Guard,
  ) {
    if (!guard.enforce) return
    await this.checkGrant(guard, { global: config.slug }, operation)
    const access = await evaluateAccess(config.access?.[operation], {
      user: guard.user,
      context: guard.context,
    })
    if (typeof access === 'object')
      throw new QueryError(`${operation} access of global "${config.slug}" must return a boolean`)
    if (!access) throw deny(guard.user)
  }

  private async fieldChecker(
    kind: 'read' | 'update',
    guard: Guard,
    id: ID | undefined,
    data: Data | undefined,
  ) {
    if (!guard.enforce) return undefined
    return new FieldAccessChecker(
      kind,
      {
        user: guard.user,
        context: guard.context,
        ...(id !== undefined ? { id } : {}),
        ...(data ? { data } : {}),
      },
      await this.roles.fieldRules(guard.user),
    )
  }

  /**
   * Refuses filtering or sorting by fields the caller may not read: the results would tell
   * their values. Checks each field along a dotted path, through groups, arrays and blocks.
   */
  private async checkQueryFields(
    config: CollectionConfig,
    guard: Guard,
    where: Where | undefined,
    sort: readonly string[] = [],
  ) {
    if (!guard.enforce) return
    const paths = [...wherePaths(where), ...sort.map((s) => s.replace(/^-/, ''))]
    if (paths.length === 0) return
    const read = await this.fieldChecker('read', guard, undefined, undefined)
    for (const path of paths) {
      let fields: readonly Field[] | undefined = config.fields
      for (const name of path.split('.')) {
        if (!fields) break
        const field: Field | undefined = fields.find((f) => f.name === name)
        if (!field) break
        if (field.hidden || (read && !(await read.allows(field))))
          throw new ForbiddenError(`You may not filter or sort by "${path}"`)
        fields =
          field.type === 'group' || field.type === 'array'
            ? field.fields
            : field.type === 'blocks'
              ? field.blocks.flatMap((b) => b.fields)
              : undefined
      }
    }
  }

  /** `checkGrant` for one document: a role limited to its own documents must own it. */
  private async checkDocumentGrant(
    guard: Guard,
    collection: string,
    operation: ApiKeyOperation,
    id: ID,
  ) {
    const own = await this.checkGrant(guard, { collection }, operation)
    if (own === true) return
    const matches = await this.db.count({
      collection,
      where: andWhere(own, { id: { equals: id } }),
    })
    if (matches === 0) throw deny(guard.user)
  }

  /** Runs afterRead hooks, populates relationships and removes what the caller may not see. */
  private async output(
    config: CollectionConfig | GlobalConfig,
    docs: RawDocument[],
    guard: Guard,
    options: ReadOptions,
  ): Promise<RawDocument[]> {
    const read = await this.fieldChecker('read', guard, undefined, undefined)
    const finish = async (target: CollectionConfig | GlobalConfig, doc: RawDocument) => {
      const hooked = await this.transform(
        target.hooks?.afterRead,
        'doc',
        this.hookArgs(target, guard),
        doc as Data,
      )
      return (await stripFields(target.fields, hooked, read)) as RawDocument
    }
    const drafts = readsDrafts(guard, options.draft)
    const load: Loader = async (target, ids) => {
      const where = await this.readWhere(target, guard, { id: { in: [...ids] } }).catch((error) => {
        if (error instanceof ForbiddenError || error instanceof UnauthorizedError) return null
        throw error
      })
      if (where === null) return []
      const found = await this.db.find({
        collection: target.slug,
        where: this.whereFor(target, draftWhere(target, drafts, where), options),
        sort: [],
        limit: 0,
        page: 1,
      })
      const docs = drafts ? await this.withDrafts(target, found.docs) : found.docs
      return Promise.all(
        docs.map((d) => finish(target, this.pick(target, d, options) as RawDocument)),
      )
    }
    const depth = Math.max(0, Math.min(MAX_DEPTH, Math.trunc(options.depth ?? DEFAULT_DEPTH)))
    // Pick the locale, populate (populated documents are finished by the loader), then finish.
    const localized = docs.map((d) => this.pick(config, d, options) as RawDocument)
    const populated = await populate(load, this.config.collections, config.fields, localized, depth)
    return Promise.all(populated.map((d) => finish(config, d)))
  }

  /** Creates a document: access, input filtering, hooks, validation, then afterChange. */
  private async createDocument(
    config: CollectionConfig,
    raw: Data,
    options: DepthOptions,
    hookGuard?: Guard,
  ): Promise<RawDocument> {
    const guard = guardOf(options)
    const collection = config.slug
    if (guard.enforce) {
      await this.checkGrant(guard, { collection }, 'create')
      if (config.drafts && raw.status === 'published')
        await this.checkGrant(guard, { collection }, 'publish')
      const allowed = await evaluateAccess(config.access?.create, {
        user: guard.user,
        context: guard.context,
        data: raw,
      })
      if (typeof allowed === 'object')
        throw new QueryError(`create access of "${collection}" must return a boolean`)
      if (!allowed) throw deny(guard.user)
      if (inFolders(this.config, collection))
        await this.folders.checkTarget(guard.user, collection, folderOf(collection, raw))
    }

    // A user without a password can't log in until they set one from an invitation link.
    const { input, password } = splitPassword(config, raw)
    const filtered = await filterInput(
      config.fields,
      input,
      await this.fieldChecker('update', guard, undefined, input),
    )
    this.roles.fillOwner(collection, filtered, guard.user ?? hookGuard?.user ?? null)
    const base = this.hookArgs(config, hookGuard ?? guard)
    let data = applyDefaults(
      config.fields,
      this.toMaps(config, filtered, {}, options),
      this.config.localization,
    )
    data = await this.transform(
      config.hooks?.beforeValidate,
      'data',
      { ...base, operation: 'create' },
      data,
    )
    let prepared = await this.prepare(
      config,
      generateSlugs(config.fields, data, this.config.localization),
      'create',
      undefined,
      options,
      hookGuard ?? guard,
    )
    prepared = await this.transform(
      config.hooks?.beforeChange,
      'data',
      { ...base, operation: 'create' },
      prepared,
    )
    if (password !== undefined) prepared.passwordHash = await hashPassword(password)
    if (collection === MEDIA_FOLDERS) await this.validateFolder(prepared, undefined)

    const now = new Date().toISOString()
    const doc = await this.db.create({
      collection,
      data: { ...prepared, createdAt: now, updatedAt: now },
    })
    if (collection === MEDIA_FOLDERS) this.folders.invalidate()
    await this.saveVersion(config, collectionParent(collection), doc.id, doc, guard)
    await this.notify(config.hooks?.afterChange, 'afterChange', collection, {
      ...base,
      doc,
      operation: 'create',
    })
    this.emitChange(config, 'create', doc)
    await this.audited(config, 'create', doc, undefined, hookGuard ?? guard)
    const [out] = await this.output(config, [doc], hookGuard ?? guard, { ...options, draft: true })
    return out as RawDocument
  }

  /** The locale for an operation; `undefined` without localization. Throws on unknown locales. */
  private localeOf(options: { locale?: string }): string | undefined {
    const localization = this.config.localization
    if (!localization) return undefined
    const locale = options.locale ?? localization.defaultLocale
    if (locale !== ALL_LOCALES && !localization.locales.includes(locale)) {
      throw new QueryError(
        `Unknown locale "${locale}" (use one of: ${localization.locales.join(', ')}, ${ALL_LOCALES})`,
      )
    }
    return locale
  }

  /** Stored localized maps → the values of the requested locale. */
  private pick(
    config: CollectionConfig | GlobalConfig,
    doc: Data,
    options: { locale?: string; fallbackLocale?: boolean },
  ): Data {
    const localization = this.config.localization
    const locale = this.localeOf(options)
    if (!localization || locale === undefined) return doc
    const fallback = options.fallbackLocale ?? localization.fallback
    return pickLocale(config.fields, doc, locale, localization, fallback)
  }

  /** Input for one locale → stored localized maps, keeping the other locales from `current`. */
  private toMaps(
    config: CollectionConfig | GlobalConfig,
    input: Data,
    current: Data,
    options: { locale?: string },
  ): Data {
    const locale = this.localeOf(options)
    if (locale === undefined || locale === ALL_LOCALES) return input
    return toLocaleMaps(config.fields, input, current, locale)
  }

  /** Makes `where` match localized fields in the operation's locale. */
  private whereFor(
    config: CollectionConfig,
    where: Where | undefined,
    options: { locale?: string },
  ): Where | undefined {
    const locale = this.localeOf(options)
    const localization = this.config.localization
    if (locale === undefined || !localization) return where
    return localizeWhere(
      config.fields,
      where,
      locale === ALL_LOCALES ? localization.defaultLocale : locale,
      localization.locales,
    )
  }

  /** Drafts are kept as versions (instead of unpublishing) when both are enabled. */
  private separateDrafts(config: CollectionConfig | GlobalConfig): boolean {
    return config.drafts === true && versionLimit(config) !== undefined
  }

  /** Replaces published documents that have a newer draft with that draft. */
  private async withDrafts(
    config: CollectionConfig | GlobalConfig,
    docs: RawDocument[],
  ): Promise<RawDocument[]> {
    if (!this.separateDrafts(config)) return docs
    const published = docs.filter((d) => d.status === 'published').map((d) => d.id)
    const latest = await this.versions.latest(collectionParent(config.slug), published)
    return docs.map((doc) => {
      const version = latest.get(String(doc.id))
      return version && doc.status === 'published' && version.status === 'draft'
        ? draftOf(doc, version)
        : doc
    })
  }

  /** Sends webhook events for a change; `before` is the stored status before it, if any. */
  private emitChange(
    config: CollectionConfig | GlobalConfig,
    event: WebhookEvent,
    doc: Data,
    before?: unknown,
  ) {
    const isGlobal = !this.config.collections.includes(config as CollectionConfig)
    if (!isGlobal && INTERNAL_COLLECTIONS.has(config.slug)) return
    const body = isGlobal
      ? { ...snapshotOf(config.fields, doc), updatedAt: doc.updatedAt }
      : {
          id: doc.id,
          ...snapshotOf(config.fields, doc),
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        }
    const target = isGlobal
      ? { global: config.slug }
      : { collection: config.slug, id: doc.id as ID }
    this.webhooks.emit(event, target, body)
    if (event === 'draft' || event === 'delete' || !config.drafts) return
    const after = doc.status
    if (after === 'published' && before !== 'published') this.webhooks.emit('publish', target, body)
    if (after !== 'published' && before === 'published')
      this.webhooks.emit('unpublish', target, body)
  }

  /**
   * Writes the audit log entry for a change (`audit`): publishing, unpublishing and restoring
   * are told apart from other saves.
   */
  private async audited(
    config: CollectionConfig | GlobalConfig,
    event: 'create' | 'update' | 'draft' | 'delete',
    doc: Data,
    previous: Data | undefined,
    guard: Guard,
    mode: 'save' | 'unpublish' | 'restore' = 'save',
  ) {
    if (!this.audit.enabled) return
    let action: string = event
    // Who may use a folder: recorded as a change of permissions.
    if (
      config.slug === MEDIA_FOLDERS &&
      event === 'update' &&
      JSON.stringify(doc.permissions ?? null) !== JSON.stringify(previous?.permissions ?? null)
    )
      action = 'folder.permissions'
    else if (event === 'update' || event === 'draft') {
      const was = previous?.status
      if (mode === 'restore') action = 'restore'
      else if (config.drafts && doc.status === 'published' && was !== 'published')
        action = 'publish'
      else if (
        config.drafts &&
        event === 'update' &&
        doc.status !== 'published' &&
        was === 'published'
      )
        action = 'unpublish'
    }
    const global = !this.config.collections.includes(config as CollectionConfig)
    await this.audit.content(
      config,
      global,
      action,
      event === 'delete' ? undefined : doc,
      event === 'create' ? undefined : previous,
      guard.user,
      guard.context,
    )
  }

  /** Records a version after a save, when the collection or global keeps versions. */
  private async saveVersion(
    config: CollectionConfig | GlobalConfig,
    parent: string,
    id: ID,
    doc: Data,
    guard: Guard,
  ): Promise<void> {
    const max = versionLimit(config)
    if (max === undefined) return
    await this.versions.save({
      parent,
      doc: id,
      status: config.drafts ? ((doc.status as 'draft' | 'published') ?? 'draft') : null,
      snapshot: snapshotOf(config.fields, doc),
      author: guard.user?.id ?? null,
      max,
    })
  }

  private hookArgs(config: CollectionConfig | GlobalConfig, guard: Guard) {
    return {
      user: guard.user,
      cms: this as unknown as EasyCMS,
      slug: config.slug,
      context: guard.context,
    }
  }

  /**
   * Runs hooks that may replace a value, passed as `data` (before hooks) or `doc` (afterRead).
   * Returning `undefined` keeps the value; a throw cancels the operation.
   */
  private async transform(
    hooks: readonly ((args: never) => unknown)[] | undefined,
    key: 'data' | 'doc',
    args: Record<string, unknown>,
    value: Data,
  ): Promise<Data> {
    let current = value
    for (const hook of hooks ?? []) {
      const result = await (hook as (a: Record<string, unknown>) => unknown)({
        ...args,
        [key]: current,
      })
      if (result !== undefined && result !== null && typeof result === 'object')
        current = result as Data
    }
    return current
  }

  /** Runs hooks after the change is saved: failures are logged, never undo the save (NFR-REL-03). */
  private async notify(
    hooks: readonly ((args: never) => unknown)[] | undefined,
    name: string,
    slug: string,
    args: Record<string, unknown>,
  ) {
    for (const hook of hooks ?? []) {
      try {
        await (hook as (a: Record<string, unknown>) => unknown)(args)
      } catch (error) {
        this.logger.error(
          `${name} hook of "${slug}" failed: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
  }

  /** Writes resized copies with sharp, when installed and configured. */
  private async resizeImage(
    data: Uint8Array,
    mimeType: string,
    filename: string,
    sizes: readonly ImageSize[],
    stored: string[],
    storage: StorageAdapter = this.storage,
  ): Promise<
    Record<string, { filename: string; width: number; height: number; filesize: number }>
  > {
    if (
      sizes.length === 0 ||
      !['image/png', 'image/jpeg', 'image/webp', 'image/avif'].includes(mimeType)
    )
      return {}
    const sharp = await loadSharp()
    if (!sharp) {
      this.logger.warn(
        'upload.imageSizes is set but sharp is not installed; skipping resized copies',
      )
      return {}
    }
    const result: Record<
      string,
      { filename: string; width: number; height: number; filesize: number }
    > = {}
    for (const size of sizes) {
      const { data: out, info } = await sharp(data)
        .rotate()
        .resize({
          width: size.width,
          ...(size.height ? { height: size.height } : {}),
          fit: size.fit ?? 'cover',
          withoutEnlargement: true,
        })
        .toBuffer({ resolveWithObject: true })
      const key = sizeKey(filename, size.name)
      await storage.put(key, new Uint8Array(out), { contentType: mimeType })
      stored.push(key)
      result[size.name] = {
        filename: key,
        width: info.width,
        height: info.height,
        filesize: out.byteLength,
      }
    }
    return result
  }

  /** Validates, checks uniqueness and references. Returns clean data or throws `ValidationError`. */
  private async prepare(
    config: CollectionConfig | GlobalConfig,
    data: Data,
    operation: 'create' | 'update',
    selfId: ID | undefined,
    options: { locale?: string } = {},
    guard: Pick<Guard, 'user' | 'context'> = { user: null, context: NO_CONTEXT },
  ): Promise<Data> {
    const isDraft = config.drafts === true && (data.status ?? 'draft') === 'draft'
    const locale = this.localeOf(options)
    const result = await validateFields(config.fields, data, {
      operation,
      root: data,
      skipRequired: isDraft,
      localization: this.config.localization,
      ...(locale !== undefined && locale !== ALL_LOCALES ? { locale } : {}),
    })
    const errors: FieldError[] = [...result.errors]
    const clean: Data = { ...result.data }

    if (config.drafts) {
      const status = data.status ?? 'draft'
      if (status !== 'draft' && status !== 'published') {
        errors.push({ field: 'status', message: 'must be "draft" or "published"' })
      }
      clean.status = status
    }

    // With roles from the admin, any role in Settings → Roles.
    if (
      config.slug === USERS &&
      this.roles.enabled &&
      typeof clean.role === 'string' &&
      !(await this.roles.exists(clean.role))
    )
      errors.push({ field: 'role', message: `there is no role "${clean.role}"` })

    const isCollection = this.config.collections.includes(config as CollectionConfig)
    if (isCollection && errors.length === 0) {
      await this.makeSlugsUnique(config as CollectionConfig, clean, selfId)
      errors.push(...(await this.checkUnique(config as CollectionConfig, clean, selfId)))
    }
    errors.push(...(await this.checkReferences(result.references, guard)))
    if (errors.length === 0)
      errors.push(...(await this.checkFilterOptions(result.references, selfId, guard)))

    if (errors.length > 0) throw new ValidationError(config.slug, errors)
    return clean
  }

  /** Refuses changes that would leave no active admin (and lock everyone out). */
  private async guardLastAdmin(id: ID, before: Data, after: Data) {
    const wasAdmin = before.role === 'admin' && before.active !== false
    const staysAdmin = after.role === 'admin' && after.active !== false
    if (!wasAdmin || staysAdmin) return
    const others = await this.db.count({
      collection: USERS,
      where: {
        and: [
          { role: { equals: 'admin' } },
          { active: { not_equals: false } },
          { id: { not_equals: id } },
        ],
      },
    })
    if (others === 0) {
      throw new ValidationError(USERS, [
        { field: 'role', message: 'cannot remove the last active admin' },
      ])
    }
  }

  private async makeSlugsUnique(config: CollectionConfig, data: Data, selfId: ID | undefined) {
    for (const field of config.fields) {
      if (field.type !== 'slug') continue
      // Only among documents with the same value of `uniqueWithin` (e.g. the same parent).
      const scope: Where | undefined =
        field.uniqueWithin === undefined
          ? undefined
          : {
              and: uniqueWithinOf(field).map((name) => ({
                [name]: { equals: data[name] ?? null },
              })),
            }
      const unique = async (path: string, base: string) => {
        let candidate = base
        for (let n = 2; await this.isTaken(config.slug, path, candidate, selfId, scope); n++) {
          candidate = `${base}-${n}`
        }
        return candidate
      }
      const value = data[field.name]
      if (field.localized && value && typeof value === 'object') {
        // Unique per locale: each locale has its own column.
        const map = { ...(value as Data) }
        for (const [locale, slug] of Object.entries(map)) {
          if (typeof slug === 'string' && slug !== '')
            map[locale] = await unique(`${field.name}.${locale}`, slug)
        }
        data[field.name] = map
      } else if (typeof value === 'string' && value !== '') {
        data[field.name] = await unique(field.name, value)
      }
    }
  }

  private async checkUnique(
    config: CollectionConfig,
    data: Data,
    selfId: ID | undefined,
  ): Promise<FieldError[]> {
    const errors: FieldError[] = []
    for (const field of config.fields) {
      const value = data[field.name]
      if (!field.unique || field.type === 'slug' || value === null || value === undefined) continue
      const checks: [path: string, error: string, value: unknown][] =
        field.localized && typeof value === 'object'
          ? Object.entries(value as Data).map(([locale, v]) => [
              `${field.name}.${locale}`,
              locale === this.config.localization?.defaultLocale
                ? field.name
                : `${field.name}.${locale}`,
              v,
            ])
          : [[field.name, field.name, value]]
      // Only among documents with the same value of `uniqueWithin` (e.g. the same tenant).
      const scope: Where | undefined =
        field.uniqueWithin === undefined
          ? undefined
          : {
              and: uniqueWithinOf(field).map((name) => ({
                [name]: { equals: data[name] ?? null },
              })),
            }
      for (const [path, errorField, v] of checks) {
        if (v === null || v === undefined) continue
        if (await this.isTaken(config.slug, path, v, selfId, scope)) {
          errors.push({ field: errorField, message: 'must be unique' })
        }
      }
    }
    return errors
  }

  private async isTaken(
    collection: string,
    field: string,
    value: unknown,
    selfId: ID | undefined,
    scope?: Where,
  ) {
    const where: Where = {
      and: [
        { [field]: { equals: value } },
        ...(selfId === undefined ? [] : [{ id: { not_equals: selfId } }]),
        ...(scope ? [scope] : []),
      ],
    }
    return (await this.db.count({ collection, where })) > 0
  }

  /**
   * What folder keys are unique within for a call (`uniqueWithin` of the `key` field of media
   * folders, e.g. the tenant): the value a folder made by this call would get from its hooks.
   */
  private async folderScope(
    guard: Pick<Guard, 'user' | 'context'>,
  ): Promise<Record<string, unknown>> {
    return this.uniqueScope(MEDIA_FOLDERS, 'key', guard)
  }

  /**
   * Where a unique field's values must differ for a call (`uniqueWithin`, e.g. the tenant): the
   * value a document created by this call would get there from its hooks, as `{ [field]: value }`;
   * `{}` when the field is unique everywhere. For finding documents by such a field, e.g. a page
   * by its path in the current tenant.
   */
  async uniqueScope(
    collection: string,
    field: string,
    options: Pick<AccessOptions, 'user' | 'context'> = {},
  ): Promise<Record<string, unknown>> {
    const config = this.config.collections.find((c) => c.slug === collection)
    const target = config?.fields.find((f) => f.name === field)
    const within = target ? uniqueWithinOf(target) : []
    if (!config || within.length === 0) return {}
    const guard = {
      enforce: false,
      user: options.user ?? null,
      context: options.context ?? NO_CONTEXT,
    }
    // Hooks that need more than an empty document leave the scope unknown.
    const data = await this.transform(
      config.hooks?.beforeValidate,
      'data',
      { ...this.hookArgs(config, guard), operation: 'create' },
      {},
    ).catch(() => ({}) as Data)
    return Object.fromEntries(within.map((name) => [name, data[name] ?? null]))
  }

  /**
   * @internal The id of the media folder with this key (`folder` of upload fields), made when
   * needed; `null` when the call has no scope to make it in (e.g. all tenants) and none exists.
   */
  async keyedFolder(key: string, options: AccessOptions = {}): Promise<ID | null> {
    const scope = await this.folderScope(guardOf(options))
    const complete = Object.values(scope).every((v) => v !== null && v !== undefined)
    return this.folders.keyed(key, scope, complete)
  }

  /** Each reference is one its relationship's `filterOptions` allow. */
  private async checkFilterOptions(
    references: readonly Reference[],
    selfId: ID | undefined,
    guard: Pick<Guard, 'user' | 'context'>,
  ): Promise<FieldError[]> {
    const errors: FieldError[] = []
    const cms = this as unknown as EasyCMS
    const { user, context } = guard
    const allowed = new Map<FilterOptions, Where | true>()
    for (const ref of references) {
      const filter = ref.filterOptions
      if (!filter) continue
      if (!allowed.has(filter))
        allowed.set(filter, await filter({ id: selfId, user, cms, context }))
      const where = allowed.get(filter) as Where | true
      if (where === true) continue
      const target = this.config.collections.find((c) => c.slug === ref.collection)
      const localization = this.config.localization
      const scoped = target
        ? this.whereFor(target, where, localization ? { locale: localization.defaultLocale } : {})
        : where
      const count = await this.db.count({
        collection: ref.collection,
        where: { and: [{ id: { equals: ref.id } }, ...(scoped ? [scoped] : [])] },
      })
      if (count === 0)
        errors.push({ field: ref.field, message: 'is not one of the allowed choices' })
    }
    return errors
  }

  private async checkReferences(
    references: readonly Reference[],
    guard: Pick<Guard, 'user' | 'context'>,
  ): Promise<FieldError[]> {
    const byCollection = new Map<string, Reference[]>()
    for (const ref of references) {
      // `media` is checked once it exists (M5).
      if (!this.config.collections.some((c) => c.slug === ref.collection)) continue
      byCollection.set(ref.collection, [...(byCollection.get(ref.collection) ?? []), ref])
    }
    const errors: FieldError[] = []
    for (const [collection, refs] of byCollection) {
      const found = await this.db.findByIds({
        collection,
        ids: [...new Set(refs.map((r) => r.id))],
      })
      const byId = new Map(found.map((d) => [d.id, d]))
      for (const ref of refs) {
        const doc = byId.get(ref.id)
        if (!doc) {
          errors.push({ field: ref.field, message: `${collection} ${ref.id} does not exist` })
          continue
        }
        // An upload's `mimeTypes`: a gallery of images takes no PDF.
        const type = typeof doc.mimeType === 'string' ? doc.mimeType : ''
        if (ref.mimeTypes && !mimeAllowedBy(type, ref.mimeTypes)) {
          const images = ref.mimeTypes.every((t) => t.toLowerCase() === 'image/*')
          errors.push({
            field: ref.field,
            message: images
              ? `must be an image (${doc.filename ?? ref.id} is ${type || 'not one'})`
              : `must be ${ref.mimeTypes.join(', ')} (${doc.filename ?? ref.id} is ${type || 'unknown'})`,
          })
        }
        // `folderOnly`: a file from that folder or one inside it.
        if (
          ref.folderOnly &&
          this.folders.enabled &&
          !(await this.folders.inKeyed(
            ref.folderOnly,
            (doc.folder as ID | null | undefined) ?? null,
            await this.folderScope(guard),
          ))
        )
          errors.push({
            field: ref.field,
            message: `must be a file from the "${ref.folderOnly}" folder (${doc.filename ?? ref.id} is not)`,
          })
      }
    }
    return errors
  }
}

/** A document as live preview shows it, and the page to show it on. */
export interface LivePreview<T> {
  readonly doc: T
  /** From the collection's `preview` function; `null` without one. */
  readonly url: string | null
}

/** A published document shown with its newer draft's content. */
function draftOf(doc: RawDocument, version: Version): RawDocument {
  return {
    ...version.data,
    id: doc.id,
    createdAt: doc.createdAt,
    updatedAt: version.createdAt,
    status: 'draft',
  } as RawDocument
}

/** Restricts reads to published documents unless drafts were asked for. */
function draftWhere(
  config: CollectionConfig | GlobalConfig,
  draft: boolean | undefined,
  where: Where | undefined,
) {
  if (!config.drafts || draft) return where
  return andWhere(where, { status: { equals: 'published' } })
}

type SharpFactory = (input: Uint8Array) => {
  rotate(): ReturnType<SharpFactory>
  resize(options: Record<string, unknown>): ReturnType<SharpFactory>
  toBuffer(options: {
    resolveWithObject: true
  }): Promise<{ data: Uint8Array; info: { width: number; height: number } }>
}

let sharpModule: Promise<SharpFactory | undefined> | undefined
/** sharp is an optional peer dependency. */
function loadSharp(): Promise<SharpFactory | undefined> {
  sharpModule ??= import('sharp' as string).then(
    (mod: { default: SharpFactory }) => mod.default,
    () => undefined,
  )
  return sharpModule
}

/** The field paths a `where` filters by. */
function wherePaths(where: Where | undefined): string[] {
  if (!where) return []
  const out: string[] = []
  for (const [key, value] of Object.entries(where)) {
    if (key === 'and' || key === 'or') {
      for (const sub of (value ?? []) as readonly Where[]) out.push(...wherePaths(sub))
    } else out.push(key)
  }
  return out
}

const NO_CONTEXT: RequestContext = Object.freeze({})

function withoutContext(permissions: ApiKeyPermissions | undefined): ApiKeyPermissions {
  const { context: _context, ...rest } = permissions ?? {}
  return rest
}

/** `site@3` → `{ slug: 'site', scope: '3' }` (see `globalKey`). */
function splitGlobalKey(key: string): { slug: string; scope?: string } {
  const at = key.indexOf('@')
  return at < 0 ? { slug: key } : { slug: key.slice(0, at), scope: key.slice(at + 1) }
}

function guardOf(options: AccessOptions): Guard {
  return {
    enforce: options.overrideAccess === false,
    user: options.user ?? null,
    context: options.context ?? NO_CONTEXT,
  }
}

/**
 * Whether a read gets drafts: trusted calls and staff (API keys included) when they ask; never
 * visitors or site members (`auth.members`), whatever they ask, as the REST API promises.
 */
function readsDrafts(guard: Guard, draft: boolean | undefined): boolean {
  return draft === true && (!guard.enforce || (guard.user !== null && guard.user.member !== true))
}

function deny(user: AuthUser | null) {
  return user ? new ForbiddenError() : new UnauthorizedError()
}

/** Pulls `password` out of users input and checks it. */
function splitPassword(config: CollectionConfig, raw: Data): { input: Data; password?: string } {
  if (config.slug !== USERS || !Object.hasOwn(raw, 'password')) return { input: raw }
  const { password, ...input } = raw
  if (password === undefined || password === null || password === '') return { input }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(USERS, [
      { field: 'password', message: `must be at least ${MIN_PASSWORD_LENGTH} characters` },
    ])
  }
  return { input, password }
}

function asObject(data: unknown, name: string): Data {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new ValidationError(name, [{ field: '', message: 'data must be an object' }])
  }
  return data as Data
}

/** Collections whose documents are in media folders (`upload.folders`). */
function inFolders(config: ResolvedConfig, collection: string): boolean {
  return config.upload.folders && (collection === MEDIA || collection === MEDIA_FOLDERS)
}

/** The folder a file (`folder`) or folder (`parent`) is put in; `null`: the top level. */
function folderOf(collection: string, data: Record<string, unknown>): ID | null {
  const value = data[collection === MEDIA ? 'folder' : 'parent']
  return value === undefined || value === '' ? null : (value as ID | null)
}

const MAX_LINK = 7 * 24 * 60 * 60
/** How long a browser may take to start sending a file straight to the storage. */
const UPLOAD_URL_SECONDS = 15 * 60
/** How long after `createUpload` it may be completed (a large file can take a while). */
const UPLOAD_TICKET_SECONDS = 24 * 60 * 60
/** Enough of a file to tell its type, Office files included. */
const SNIFF_BYTES = 64 * 1024

/** What `createUpload` signs, for `completeUpload`. */
interface UploadTicket {
  key: string
  private: boolean
  name: string
  size: number
  type: string
  user: ID | null
  /** Unix seconds. */
  expires: number
  data: Record<string, unknown>
}
/** Files one request may move between public and private storage. */
const MAX_FILES_TO_MOVE = 200
/** The row of the globals table that holds when each of the config's `jobs` last ran. */
const JOB_RUNS = 'easy-cms:jobs'

/** `3600`, `'30m'`, `'1h'`, `'7d'` as seconds; at most 7 days. */
function durationSeconds(value: number | string): number {
  const match = typeof value === 'string' ? /^(\d+)\s*([smhd])$/.exec(value.trim()) : null
  const seconds =
    typeof value === 'number'
      ? value
      : match
        ? Number(match[1]) * { s: 1, m: 60, h: 3600, d: 86400 }[match[2] as 's' | 'm' | 'h' | 'd']
        : Number.NaN
  if (!Number.isFinite(seconds) || seconds <= 0)
    throw new QueryError(`expiresIn must be seconds or like '30m', '1h', '7d' (got ${value})`)
  if (seconds > MAX_LINK) throw new QueryError('expiresIn can be at most 7 days')
  return Math.floor(seconds)
}
