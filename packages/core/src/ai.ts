import type { AuthUser, ID } from './access.js'
import { AI_USAGE, CONNECTIONS, MEDIA } from './builtins.js'
import type { ResolvedConfig } from './config.js'
import { QueryError, TooManyRequestsError, ValidationError } from './errors.js'
import type { Label } from './fields.js'
import type { IntegrationConnection, IntegrationTestResult } from './integrations.js'
import type { EasyCMS } from './local-api.js'
import { lastSlot } from './time-of-day.js'

// AI (#357): providers (a plugin's integrations) answer prompts for the admin's features. Core
// keeps the limits, the usage and which connection each feature uses.

/** What a provider is asked: the prompt, images as base64, and a JSON schema for the answer. */
export interface AiProviderRequest {
  readonly system?: string
  readonly prompt: string
  readonly images: readonly { readonly data: string; readonly mediaType: string }[]
  /** A JSON schema: the answer is JSON of this shape. */
  readonly json?: Readonly<Record<string, unknown>>
  readonly maxTokens: number
  readonly signal: AbortSignal
}

export interface AiProviderResult {
  readonly text: string
  readonly usage: { readonly input: number; readonly output: number }
}

/** A provider's refusal: `status` says whether to retry (429, 5xx) or the key is wrong (401, 403). */
export class AiProviderError extends Error {
  readonly status: number | undefined
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'AiProviderError'
    this.status = status
  }
}

/** A provider a plugin adds: its integration (fields, Test) and how it answers. */
export interface AiProvider {
  /** The id of the integration whose connections it answers with, e.g. `anthropic`. */
  readonly integration: string
  readonly generate: (
    values: Readonly<Record<string, string>>,
    request: AiProviderRequest,
  ) => Promise<AiProviderResult>
}

/** `ai` in the config, set by the AI plugin. */
export interface AiConfig {
  readonly providers: readonly AiProvider[]
  readonly limits?: {
    /** Requests a user makes a day (in `timeZone`). Admins can change it. Default 100. */
    readonly perUserPerDay?: number
    /** Per role, e.g. `{ editor: 50 }`; 0 keeps a role from using AI. Settings → Roles wins. */
    readonly roles?: Readonly<Record<string, number>>
  }
}

/** A feature that uses AI (`aiFeatures` in the config): admins turn it off or pick its connection. */
export interface AiFeatureConfig {
  /** Lowercase letters, digits and `-`, e.g. `alt-text`. */
  readonly id: string
  readonly label: Label
  readonly description?: Label
  /** On until an admin turns it off. Default true. */
  readonly default?: boolean
}

export interface AiImage {
  /** A media document: its smallest size at least 1024 pixels wide, or the file. */
  readonly media?: ID
  /** Or the image itself, as base64. */
  readonly data?: string
  readonly mediaType?: string
}

export interface AiRequest {
  /** The feature asking (`aiFeatures`): it must be on. */
  readonly feature: string
  readonly system?: string
  readonly prompt: string
  readonly images?: readonly AiImage[]
  /** A JSON schema: the answer is parsed into `json`. */
  readonly json?: Readonly<Record<string, unknown>>
  /** Default 1024. */
  readonly maxTokens?: number
}

export interface AiResult {
  readonly text: string
  readonly json?: unknown
  readonly usage: { readonly input: number; readonly output: number }
  /** The connection that answered, e.g. `anthropic:Main`. */
  readonly connection: string
}

/** What admins choose on the Integrations page (stored in `connections`). */
interface AiSettings {
  /** `<integration>:<name>`. */
  main?: string
  perUserPerDay?: number
  features?: Record<string, { enabled?: boolean; connection?: string }>
}

export interface AdminAi {
  main: string | null
  perUserPerDay: number
  /** The config's, for "back to the default". */
  defaultPerUserPerDay: number
  connections: { id: string; integration: string; name: string; label: Label }[]
  features: {
    id: string
    label: Label
    description?: Label
    enabled: boolean
    connection: string | null
  }[]
  /** This month, in `timeZone`. */
  usage: {
    byUser: { user: string; requests: number; input: number; output: number }[]
    byFeature: { feature: string; requests: number; input: number; output: number }[]
  }
}

type Data = Record<string, unknown>
const SETTINGS = 'ai'
const DEFAULT_LIMIT = 100
const TIMEOUT = 60_000
const MAX_IMAGE = 4 * 1024 * 1024
const KEEP = 90 * 24 * 3_600_000
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
/** Usage of the Test button: not a user's request. */
export const AI_TEST_FEATURE = 'test'

const ref = (integration: string, name: string) => `${integration}:${name}`

export class Ai {
  constructor(
    private readonly cms: EasyCMS,
    private readonly ai: AiConfig,
  ) {}

  private get config(): ResolvedConfig {
    return this.cms.config
  }
  private get defaultLimit() {
    return this.ai.limits?.perUserPerDay ?? DEFAULT_LIMIT
  }

  /** The features of the config. */
  get features(): readonly AiFeatureConfig[] {
    return this.config.aiFeatures
  }

  private async settingsRow(): Promise<Data | undefined> {
    const found = await this.cms.db.find({
      collection: CONNECTIONS,
      where: { and: [{ kind: { equals: 'settings' } }, { integration: { equals: SETTINGS } }] },
      sort: ['id'],
      limit: 1,
      page: 1,
    })
    return found.docs[0] as Data | undefined
  }
  private async settings(): Promise<AiSettings> {
    return ((await this.settingsRow())?.values ?? {}) as AiSettings
  }

  /** Every connection of every provider, in the providers' order. */
  private async connections(): Promise<(IntegrationConnection & { integration: string })[]> {
    const out: (IntegrationConnection & { integration: string })[] = []
    for (const provider of this.ai.providers)
      for (const conn of await this.cms.integrations.all(provider.integration))
        out.push({ ...conn, integration: provider.integration })
    return out
  }

  /** Whether a feature is on: admins' choice, else its `default`. */
  async enabled(feature: string): Promise<boolean> {
    const def = this.features.find((f) => f.id === feature)
    if (!def) return false
    return (await this.settings()).features?.[feature]?.enabled ?? def.default ?? true
  }

  /** Requests a user may make today: their role's, else everyone's. */
  async limitFor(user: AuthUser): Promise<number> {
    const role = typeof user.role === 'string' ? user.role : undefined
    if (role) {
      const fromRoles = await this.cms.roles.aiLimit(role)
      if (fromRoles !== undefined) return fromRoles
      const fromConfig = this.ai.limits?.roles?.[role]
      if (fromConfig !== undefined) return fromConfig
    }
    return (await this.settings()).perUserPerDay ?? this.defaultLimit
  }

  /** Requests the user made today (in `timeZone`) and how many are left. */
  async remaining(user: AuthUser, now = new Date()): Promise<{ used: number; limit: number }> {
    const since = lastSlot(now, '00:00', this.config.timeZone).toISOString()
    const used = await this.cms.db.count({
      collection: AI_USAGE,
      where: {
        and: [
          { user: { equals: String(user.id) } },
          { ok: { equals: true } },
          { createdAt: { gte: since } },
        ],
      },
    })
    return { used, limit: await this.limitFor(user) }
  }

  /**
   * Asks the feature's connection (or the main one). With `user`, the request counts toward their
   * daily limit; it is refused once they reach it. Usage is recorded, never the prompt.
   */
  async generate(
    request: AiRequest,
    options: { user?: AuthUser | null; about?: { collection: string; id: ID } } = {},
  ): Promise<AiResult> {
    const feature = this.features.find((f) => f.id === request.feature)
    if (!feature)
      throw new QueryError(
        `Unknown AI feature "${request.feature}": add it to \`aiFeatures\` in the config`,
      )
    if (!(await this.enabled(feature.id)))
      throw new QueryError(`The AI feature "${feature.id}" is turned off`)
    const user = options.user ?? null
    if (user) {
      const { used, limit } = await this.remaining(user)
      if (used >= limit)
        throw new TooManyRequestsError(
          limit === 0
            ? 'Your role may not use AI'
            : `You used AI ${limit} times today, the most allowed`,
        )
    }
    const conn = await this.connectionFor(feature.id)
    const images = await Promise.all((request.images ?? []).map((i) => this.image(i)))
    return this.ask(conn, {
      feature: feature.id,
      user,
      about: options.about,
      request: {
        ...(request.system ? { system: request.system } : {}),
        prompt: request.prompt,
        images,
        ...(request.json ? { json: request.json } : {}),
        maxTokens: request.maxTokens ?? 1024,
      },
    })
  }

  /**
   * The Test button of a provider's connection: a short prompt; its tokens count on the card,
   * not toward anyone's limit.
   */
  async test(
    integration: string,
    values: Readonly<Record<string, string>>,
    name?: string,
  ): Promise<IntegrationTestResult> {
    try {
      await this.ask(
        { integration, name: name ?? '', values, env: false },
        {
          feature: AI_TEST_FEATURE,
          user: null,
          markConnection: false,
          request: { prompt: 'Reply with the word OK.', images: [], maxTokens: 16 },
        },
      )
      return { ok: true, ...(values.model ? { account: values.model } : {}) }
    } catch (error) {
      return { ok: false, message: (error as Error).message }
    }
  }

  private async connectionFor(feature: string) {
    const settings = await this.settings()
    const wanted = settings.features?.[feature]?.connection ?? settings.main
    const all = await this.connections()
    const conn = (wanted && all.find((c) => ref(c.integration, c.name) === wanted)) || all[0]
    if (!conn)
      throw new QueryError('No AI provider is connected: connect one in Settings → Integrations')
    return conn
  }

  private async ask(
    conn: IntegrationConnection & { integration: string },
    args: {
      feature: string
      user: AuthUser | null
      about?: { collection: string; id: ID } | undefined
      markConnection?: boolean
      request: Omit<AiProviderRequest, 'signal'>
    },
  ): Promise<AiResult> {
    const provider = this.ai.providers.find((p) => p.integration === conn.integration)
    if (!provider) throw new QueryError(`No AI provider answers for "${conn.integration}"`)
    const record = (data: Data) =>
      this.cms.db.create({
        collection: AI_USAGE,
        data: {
          user: args.user ? String(args.user.id) : null,
          feature: args.feature,
          integration: conn.integration,
          connection: conn.name || null,
          input: 0,
          output: 0,
          error: null,
          about: args.about ? `${args.about.collection}:${args.about.id}` : null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ...data,
        },
      })
    let result: AiProviderResult
    try {
      result = await this.call(provider, conn.values, args.request)
    } catch (error) {
      const status = error instanceof AiProviderError ? error.status : undefined
      const message = (error as Error).message
      await record({ ok: false, error: message.slice(0, 500) })
      // A wrong or revoked key: the card and the dashboard say so (`integration.failed`).
      if ((status === 401 || status === 403) && args.markConnection !== false && conn.name)
        await this.cms.integrations.markError(conn.integration, message, conn.name)
      throw new QueryError(message)
    }
    await record({ ok: true, input: result.usage.input, output: result.usage.output })
    if (args.markConnection !== false && conn.name)
      await this.cms.integrations.markUsed(conn.integration, conn.name)
    let json: unknown
    if (args.request.json) {
      try {
        json = JSON.parse(stripFence(result.text))
      } catch {
        throw new QueryError('The AI answered with something other than JSON; try again')
      }
    }
    return {
      text: result.text,
      ...(args.request.json ? { json } : {}),
      usage: result.usage,
      connection: ref(conn.integration, conn.name),
    }
  }

  /** One try, and another after a second when the provider is busy or failing (429, 5xx). */
  private async call(
    provider: AiProvider,
    values: Readonly<Record<string, string>>,
    request: Omit<AiProviderRequest, 'signal'>,
  ): Promise<AiProviderResult> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await provider.generate(values, { ...request, signal: AbortSignal.timeout(TIMEOUT) })
      } catch (error) {
        const status = error instanceof AiProviderError ? error.status : undefined
        const busy = status === 429 || (status !== undefined && status >= 500)
        if (!busy || attempt > 0) {
          if ((error as Error).name === 'TimeoutError')
            throw new AiProviderError('The AI provider took longer than 60 seconds')
          throw error
        }
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }
  }

  /** An image as base64: given, or read from a media document. */
  private async image(image: AiImage): Promise<{ data: string; mediaType: string }> {
    if (image.data !== undefined) {
      if (!image.mediaType || !IMAGE_TYPES.has(image.mediaType))
        throw new ValidationError(AI_USAGE, [
          { field: 'images', message: 'must be JPEG, PNG, WebP or GIF' },
        ])
      return { data: image.data, mediaType: image.mediaType }
    }
    if (image.media === undefined)
      throw new ValidationError(AI_USAGE, [{ field: 'images', message: 'needs media or data' }])
    const doc = (await this.cms.db.findById({ collection: MEDIA, id: image.media })) as Data | null
    if (!doc) throw new ValidationError(AI_USAGE, [{ field: 'images', message: 'media not found' }])
    // The smallest size wide enough to read, else the file itself.
    const sizes = Object.values((doc.sizes ?? {}) as Record<string, Data>)
      .filter((s) => typeof s?.filename === 'string' && Number(s.width) >= 1024)
      .sort((a, b) => Number(a.width) - Number(b.width))
    const filename = String(sizes[0]?.filename ?? doc.filename)
    const mediaType = String(doc.mimeType ?? '')
    if (!IMAGE_TYPES.has(mediaType))
      throw new ValidationError(AI_USAGE, [
        { field: 'images', message: `${mediaType || 'this file'} is not an image AI can read` },
      ])
    const file = await this.cms.storageFor(doc.private === true).get(filename)
    if (!file) throw new ValidationError(AI_USAGE, [{ field: 'images', message: 'file not found' }])
    if (file.body.byteLength > MAX_IMAGE)
      throw new ValidationError(AI_USAGE, [
        { field: 'images', message: 'is larger than 4 MB; add an image size of about 1024 pixels' },
      ])
    return { data: Buffer.from(file.body).toString('base64'), mediaType }
  }

  // --- Admins ----------------------------------------------------------------------------------

  /** Settings → Integrations, AI: the main connection, the features, the limit and this month. */
  async overview(now = new Date()): Promise<AdminAi> {
    const settings = await this.settings()
    const conns = await this.connections()
    const labels = new Map(this.config.integrations.map((i) => [i.id, i.label]))
    const month = monthStart(now, this.config.timeZone).toISOString()
    const rows = (
      await this.cms.db.find({
        collection: AI_USAGE,
        where: { createdAt: { gte: month } },
        sort: ['id'],
        limit: 0,
        page: 1,
      })
    ).docs as Data[]
    const sum = (key: 'user' | 'feature') => {
      const totals = new Map<string, { requests: number; input: number; output: number }>()
      for (const row of rows) {
        if (key === 'user' && !row.user) continue
        const k = String(row[key])
        const t = totals.get(k) ?? { requests: 0, input: 0, output: 0 }
        t.requests++
        t.input += Number(row.input ?? 0)
        t.output += Number(row.output ?? 0)
        totals.set(k, t)
      }
      return [...totals].sort((a, b) => b[1].requests - a[1].requests)
    }
    const users = sum('user')
    const emails = new Map<string, string>()
    if (users.length > 0) {
      const found = await this.cms.db.findByIds({
        collection: 'users',
        ids: users.map(([id]) => (/^\d+$/.test(id) ? Number(id) : id)),
      })
      for (const u of found) emails.set(String(u.id), String(u.email ?? u.id))
    }
    return {
      main: settings.main ?? null,
      perUserPerDay: settings.perUserPerDay ?? this.defaultLimit,
      defaultPerUserPerDay: this.defaultLimit,
      connections: conns.map((c) => ({
        id: ref(c.integration, c.name),
        integration: c.integration,
        name: c.name,
        label: labels.get(c.integration) ?? c.integration,
      })),
      features: await Promise.all(
        this.features.map(async (f) => ({
          id: f.id,
          label: f.label,
          ...(f.description ? { description: f.description } : {}),
          enabled: await this.enabled(f.id),
          connection: settings.features?.[f.id]?.connection ?? null,
        })),
      ),
      usage: {
        byUser: users.map(([id, t]) => ({ user: emails.get(id) ?? id, ...t })),
        byFeature: sum('feature').map(([feature, t]) => ({ feature, ...t })),
      },
    }
  }

  /** Tokens and requests of each connection this month, for the cards. */
  async usageByConnection(now = new Date()) {
    const month = monthStart(now, this.config.timeZone).toISOString()
    const rows = (
      await this.cms.db.find({
        collection: AI_USAGE,
        where: { createdAt: { gte: month } },
        sort: ['id'],
        limit: 0,
        page: 1,
      })
    ).docs as Data[]
    const out = new Map<string, { requests: number; input: number; output: number }>()
    for (const row of rows) {
      const k = ref(String(row.integration), String(row.connection ?? ''))
      const t = out.get(k) ?? { requests: 0, input: 0, output: 0 }
      t.requests++
      t.input += Number(row.input ?? 0)
      t.output += Number(row.output ?? 0)
      out.set(k, t)
    }
    return out
  }

  /** Saves admins' choices; audit-logged. */
  async update(body: unknown, user: AuthUser): Promise<AdminAi> {
    const input = (body ?? {}) as Data
    const current = await this.settings()
    const conns = new Set((await this.connections()).map((c) => ref(c.integration, c.name)))
    const next: AiSettings = { ...current }
    const fail = (field: string, message: string): never => {
      throw new ValidationError(AI_USAGE, [{ field, message }])
    }
    if (input.main !== undefined) {
      if (input.main === null) delete next.main
      else if (typeof input.main === 'string' && conns.has(input.main)) next.main = input.main
      else fail('main', 'is not a connection')
    }
    if (input.perUserPerDay !== undefined) {
      if (input.perUserPerDay === null) delete next.perUserPerDay
      else if (Number.isInteger(input.perUserPerDay) && (input.perUserPerDay as number) >= 0)
        next.perUserPerDay = input.perUserPerDay as number
      else fail('perUserPerDay', 'must be a whole number, 0 or more')
    }
    if (input.features !== undefined) {
      if (typeof input.features !== 'object' || input.features === null)
        fail('features', 'must be an object')
      const features = { ...(current.features ?? {}) }
      for (const [id, raw] of Object.entries(input.features as Data)) {
        if (!this.features.some((f) => f.id === id)) fail('features', `unknown feature "${id}"`)
        const change = (raw ?? {}) as Data
        const entry = { ...(features[id] ?? {}) }
        if (typeof change.enabled === 'boolean') entry.enabled = change.enabled
        if (change.connection === null) delete entry.connection
        else if (change.connection !== undefined) {
          if (typeof change.connection !== 'string' || !conns.has(change.connection))
            fail('features', 'connection is not a connection')
          entry.connection = change.connection as string
        }
        features[id] = entry
      }
      next.features = features
    }
    const row = await this.settingsRow()
    const now = new Date().toISOString()
    if (row)
      await this.cms.db.update({
        collection: CONNECTIONS,
        id: row.id as ID,
        data: { ...row, values: next, updatedAt: now },
      })
    else
      await this.cms.db.create({
        collection: CONNECTIONS,
        data: {
          kind: 'settings',
          integration: SETTINGS,
          name: null,
          isDefault: false,
          values: next,
          secret: null,
          account: null,
          lastUsedAt: null,
          lastError: null,
          enabled: null,
          createdAt: now,
          updatedAt: now,
        },
      })
    await this.cms.audit.record({
      action: 'integration.ai',
      target: SETTINGS,
      user,
      detail: { ...next },
    })
    return this.overview()
  }

  /** Forgets usage older than 90 days (with the scheduled jobs). */
  async upkeep(now = new Date()) {
    const before = new Date(now.getTime() - KEEP).toISOString()
    for (;;) {
      const old = await this.cms.db.find({
        collection: AI_USAGE,
        where: { createdAt: { lt: before } },
        sort: ['id'],
        limit: 500,
        page: 1,
      })
      for (const row of old.docs) await this.cms.db.delete({ collection: AI_USAGE, id: row.id })
      if (old.docs.length < 500) return
    }
  }
}

/** Removes a Markdown code fence some models put around JSON. */
function stripFence(text: string): string {
  const trimmed = text.trim()
  const match = /^```(?:json)?\s*\n([\s\S]*?)\n?```$/.exec(trimmed)
  return match ? (match[1] as string) : trimmed
}

/** Midnight of the month's first day, in the time zone. */
function monthStart(now: Date, zone: string | undefined): Date {
  let day = lastSlot(now, '00:00', zone)
  const dayOf = (d: Date) =>
    Number(new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone: zone }).format(d))
  for (let i = 0; i < 31 && dayOf(day) > 1; i++)
    day = lastSlot(new Date(day.getTime() - 1), '00:00', zone)
  return day
}
