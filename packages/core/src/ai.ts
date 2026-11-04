import type { AuthUser, ID } from './access.js'
import { AI_USAGE, CONNECTIONS, MEDIA } from './builtins.js'
import type { ResolvedConfig } from './config.js'
import { ForbiddenError, QueryError, TooManyRequestsError, ValidationError } from './errors.js'
import type { Field, Label } from './fields.js'
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

/** Easy CMS's own AI features, there with `ai` (#358). */
export const CORE_AI_FEATURES: readonly AiFeatureConfig[] = [
  {
    id: 'alt-text',
    label: { en: 'Alt text', th: 'เขียน alt text' },
    description: {
      en: 'Describes an image in the media library',
      th: 'บรรยายรูปในคลังสื่อ',
    },
  },
  {
    id: 'translate',
    label: { en: 'Translation', th: 'แปลภาษา' },
    description: {
      en: 'Translates localized text, textarea and rich text fields from another locale',
      th: 'แปลช่องข้อความ, textarea และ rich text ที่มีหลายภาษา จากอีกภาษาหนึ่ง',
    },
  },
]

/** What the admin needs to show AI buttons (`GET <api>/admin/ai/status`). */
export interface AiStatus {
  /** A provider is connected. */
  connected: boolean
  /** Features that are on. */
  features: string[]
  /** Requests the user made today, and may make. */
  used: number
  limit: number
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

  /** For the admin's AI buttons: whether they work, and how many requests are left today. */
  async status(user: AuthUser): Promise<AiStatus> {
    const enabled = await Promise.all(
      this.features.map(async (f) => ((await this.enabled(f.id)) ? f.id : null)),
    )
    return {
      connected: (await this.connections()).length > 0,
      features: enabled.filter((id): id is string => id !== null),
      ...(await this.remaining(user)),
    }
  }

  /** The language to write in, by name (`Thai`): the content locale being edited, else the default. */
  languageOf(locale: string | null | undefined): string {
    const code =
      locale ?? this.config.localization?.defaultLocale ?? this.config.admin.locale ?? 'en'
    try {
      return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code
    } catch {
      return code
    }
  }

  /**
   * Alt text for an image in the media library (`alt-text`), for the user to review before saving:
   * what it shows, in one sentence of at most 125 characters.
   */
  async altText(
    id: ID,
    options: { user: AuthUser; locale?: string | null; context?: Record<string, unknown> },
  ): Promise<{ alt: string }> {
    const access = await this.cms.documentPermissions(
      MEDIA,
      String(id),
      options.user,
      options.context ?? {},
    )
    if (!access.update) throw new ForbiddenError('You may not change this file')
    const result = await this.generate(
      {
        feature: 'alt-text',
        system: [
          'You write alt text for images on a website: one plain sentence saying what the image',
          'shows, for people who cannot see it. Do not start with "Image of" or "Picture of".',
          `At most 125 characters. Write it in ${this.languageOf(options.locale)}.`,
          'Answer with the alt text only, without quotes.',
        ].join(' '),
        prompt: 'Write the alt text for this image.',
        images: [{ media: id }],
        maxTokens: 200,
      },
      { user: options.user, about: { collection: MEDIA, id } },
    )
    return { alt: shorten(result.text.trim().replace(/^["'“]+|["'”]+$/g, ''), 125) }
  }

  /**
   * A localized field's value translated from another locale (`translate`), for the user to review
   * before saving: text and textarea as they are; rich text by its text only, so marks, links and
   * blocks stay where they were (a block's text and textarea fields are translated too).
   */
  async translate(args: {
    collection?: string
    global?: string
    id?: ID | null
    field: string
    from?: string | null
    to: string
    user: AuthUser
    context?: Record<string, unknown>
  }): Promise<{ value: unknown }> {
    const localization = this.config.localization
    const fail = (field: string, message: string): never => {
      throw new ValidationError(AI_USAGE, [{ field, message }])
    }
    if (!localization) fail('to', 'needs `localization` in the config')
    const locales = localization?.locales ?? []
    const from = args.from ?? localization?.defaultLocale ?? ''
    if (!locales.includes(args.to)) fail('to', `must be one of ${locales.join(', ')}`)
    if (!locales.includes(from) || from === args.to) fail('from', 'must be another locale')
    const container = args.collection
      ? this.config.collections.find((c) => c.slug === args.collection)
      : this.config.globals.find((g) => g.slug === args.global)
    if (!container) fail(args.collection ? 'collection' : 'global', 'is not known')
    const field = (container as { fields: readonly Field[] }).fields.find(
      (f) => 'name' in f && f.name === args.field,
    )
    if (
      !field ||
      !('localized' in field && field.localized) ||
      !['text', 'textarea', 'richText'].includes(field.type)
    )
      fail('field', 'must be a localized text, textarea or rich text field')
    const options = {
      locale: from,
      draft: true,
      depth: 0,
      fallbackLocale: false,
      user: args.user,
      overrideAccess: false,
      ...(args.context ? { context: args.context } : {}),
    } as const
    let source: Record<string, unknown> | null
    if (args.collection) {
      if (args.id === null || args.id === undefined) fail('id', 'is required')
      const id = args.id as ID
      const access = await this.cms.documentPermissions(
        args.collection,
        String(id),
        args.user,
        args.context ?? {},
      )
      if (!access.update) throw new ForbiddenError('You may not change this document')
      source = (await this.cms.findById(args.collection, id, options)) as Record<
        string,
        unknown
      > | null
    } else {
      const allowed = await this.cms.roles.allows(
        args.user,
        { global: args.global as string },
        'update',
      )
      if (allowed === false) throw new ForbiddenError('You may not change this global')
      source = (await this.cms.findGlobal(args.global as string, options)) as Record<
        string,
        unknown
      >
    }
    const value = source?.[args.field]
    const languages = `from ${this.languageOf(from)} into ${this.languageOf(args.to)}`
    const ask = async (strings: string[][]) => {
      const length = strings.flat().join('').length
      const result = await this.generate(
        {
          feature: 'translate',
          system: [
            `You translate website content ${languages}.`,
            'You get JSON {"paragraphs": [[...], ...]}: each paragraph is a list of pieces of one',
            'sentence or line, split where the formatting changes. Translate each paragraph as a',
            'whole, then split the translation into the same number of pieces, in the same order, so',
            'each piece keeps its formatting. Keep names, code, URLs and numbers as they are. Answer',
            'with the same shape: {"paragraphs": [[...], ...]}.',
          ].join(' '),
          prompt: JSON.stringify({ paragraphs: strings }),
          json: {
            type: 'object',
            properties: {
              paragraphs: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
            },
            required: ['paragraphs'],
          },
          maxTokens: Math.min(8192, Math.max(256, Math.ceil(length * 1.5) + 200)),
        },
        {
          user: args.user,
          ...(args.collection && args.id != null
            ? { about: { collection: args.collection, id: args.id } }
            : {}),
        },
      )
      const out = (result.json as { paragraphs?: unknown } | undefined)?.paragraphs
      const same =
        Array.isArray(out) &&
        out.length === strings.length &&
        out.every(
          (p, i) =>
            Array.isArray(p) &&
            p.length === strings[i]?.length &&
            p.every((s) => typeof s === 'string'),
        )
      if (!same) throw new QueryError('The translation lost its formatting; try again')
      return out as string[][]
    }
    if (field?.type === 'richText') {
      const pieces = richTextPieces(value, field)
      if (pieces.paragraphs.length === 0) fail('field', 'has nothing to translate yet')
      return { value: pieces.fill(await ask(pieces.paragraphs)) }
    }
    if (typeof value !== 'string' || !value.trim()) fail('field', 'has nothing to translate yet')
    const [[text]] = (await ask([[value as string]])) as [[string]]
    return { value: text }
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

type Node = { type?: string; text?: string; content?: Node[]; attrs?: Record<string, unknown> }

/**
 * Rich text's words for translation: per paragraph (a node holding text) its text pieces, split
 * where marks change; a block's text and textarea fields each a paragraph of one piece. `fill`
 * puts translated pieces back, in a copy, in the same places.
 */
function richTextPieces(value: unknown, field: Field) {
  const doc = structuredClone(value ?? null) as Node | null
  const blocks = 'blocks' in field ? (field.blocks ?? []) : []
  const slots: { set: (text: string) => void }[][] = []
  const paragraphs: string[][] = []
  const walk = (node: Node | undefined) => {
    if (!node || typeof node !== 'object') return
    if (node.type === 'block' && node.attrs) {
      const def = blocks.find((b) => b.slug === node.attrs?.blockType)
      const values = (node.attrs.fields ?? {}) as Record<string, unknown>
      for (const f of def?.fields ?? []) {
        if (!('name' in f) || (f.type !== 'text' && f.type !== 'textarea')) continue
        const text = values[f.name]
        if (typeof text !== 'string' || !text.trim()) continue
        paragraphs.push([text])
        slots.push([{ set: (t) => (values[f.name] = t) }])
      }
      return
    }
    const children = Array.isArray(node.content) ? node.content : []
    const texts = children.filter((c) => c?.type === 'text' && typeof c.text === 'string')
    if (texts.length > 0 && texts.some((c) => (c.text as string).trim())) {
      paragraphs.push(texts.map((c) => c.text as string))
      slots.push(texts.map((c) => ({ set: (t: string) => (c.text = t) })))
    }
    for (const child of children) if (child?.type !== 'text') walk(child)
  }
  walk(doc ?? undefined)
  return {
    paragraphs,
    fill(translated: string[][]) {
      translated.forEach((pieces, i) => {
        pieces.forEach((text, j) => {
          slots[i]?.[j]?.set(text)
        })
      })
      return doc
    },
  }
}

/** At most `max` characters, cut at a word when there is one. */
function shorten(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:]+$/, '')
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
