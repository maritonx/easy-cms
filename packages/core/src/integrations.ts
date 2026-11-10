import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto'
import type { AuthUser, ID } from './access.js'
import { secretsOf, signedWith, signValue } from './auth/tokens.js'
import { CONNECTIONS } from './builtins.js'
import type { ResolvedConfig } from './config.js'
import type { EmailAdapter } from './email.js'
import type { EmailEvent, EmailWebhookRequest } from './email-providers.js'
import { ForbiddenError, NotFoundError, QueryError, ValidationError } from './errors.js'
import type { Label } from './fields.js'
import type { EasyCMS } from './local-api.js'

// Integrations (#311): plugins declare outside providers (`integrations` in the config), and
// admins connect accounts to them on the Integrations page. Secrets are encrypted at rest.

export type IntegrationCategory =
  | 'social'
  | 'ai'
  | 'notifications'
  | 'automation'
  | 'backups'
  | 'email'

/**
 * A provider's logo: SVG paths, e.g. from simple-icons. Without `fill`, a path takes `color` (the
 * brand's), or the text color where that wouldn't show on the admin's background.
 */
export interface IntegrationLogo {
  readonly paths: readonly { readonly d: string; readonly fill?: string }[]
  /** Default `0 0 24 24`. */
  readonly viewBox?: string
  /** `#rrggbb`. */
  readonly color?: string
}

/** A value to fill when connecting (`kind: 'fields'`). */
export interface IntegrationField {
  readonly name: string
  readonly label?: Label
  readonly description?: Label
  /** `multiselect`: ticked options, kept as `a,b,c`. */
  readonly type?: 'text' | 'url' | 'textarea' | 'select' | 'multiselect'
  /** For `select` and `multiselect`: values, or `{ value, label }`. */
  readonly options?: readonly (string | { readonly value: string; readonly label: Label })[]
  /**
   * Choices from the provider for this field (#356): a Find button beside it runs this with the
   * values typed so far, e.g. the chats a Telegram bot was written to.
   */
  readonly lookup?: (
    values: Readonly<Record<string, string>>,
    args: { cms: EasyCMS },
  ) =>
    | Promise<readonly { value: string; label: string }[]>
    | readonly { value: string; label: string }[]
  readonly placeholder?: string
  readonly required?: boolean
  /** Encrypted at rest and never sent back to the admin (shown as `••••1234`). */
  readonly secret?: boolean
}

export interface IntegrationTestResult {
  readonly ok: boolean
  /** The account it reaches, e.g. a Page's or a bot's name. */
  readonly account?: string
  /** Why it failed. */
  readonly message?: string
}

/** What `exchange` gets back from the provider: one account, or several to choose from. */
export interface IntegrationOAuthResult {
  readonly values?: Readonly<Record<string, string>>
  readonly account?: string
  readonly accounts?: readonly {
    readonly id: string
    readonly name: string
    readonly values: Readonly<Record<string, string>>
  }[]
}

/**
 * Where an integration keeps backups (Settings → Backups): files by name in the connected account.
 * Throw an error with `permanent: true` when trying again won't help (a revoked token).
 */
export interface BackupDestination {
  /** Stores a file; may return a link that opens it at the provider. */
  put(name: string, data: Uint8Array): Promise<{ link?: string } | undefined>
  get(name: string): Promise<Uint8Array | null>
  delete(name: string): Promise<void>
}

/** An outside provider a plugin connects to (`integrations` in the config). */
export interface IntegrationConfig {
  /** Lowercase letters, digits and `-`, e.g. `telegram`. */
  readonly id: string
  readonly label: Label
  readonly category: IntegrationCategory
  readonly description?: Label
  /** Its logo (#363), or the name of an admin icon (`ADMIN_ICONS`). Without one: its first letter. */
  readonly icon?: string | IntegrationLogo
  /** A link to its guide. */
  readonly docs?: string
  /** The plugin it comes from, e.g. `@easy-cms/plugin-notify`. */
  readonly plugin?: string
  /** `fields`: values to paste (a token, a URL); `oauth`: a Connect button. */
  readonly kind: 'fields' | 'oauth'
  readonly fields?: readonly IntegrationField[]
  /**
   * Environment variables by field: set, they win over the admin. With all of `fields`, the
   * provider has an "Environment" connection that can't be changed in the admin.
   */
  readonly env?: Readonly<Record<string, string>>
  /** For `kind: 'oauth'`: the provider's sign-in page, and turning its code into tokens. */
  readonly oauth?: {
    /**
     * The app's own keys at the provider (a client id and secret), entered once in the admin
     * (secrets encrypted) or set in the environment, which wins. Passed as `app` below.
     */
    readonly app?: {
      readonly fields: readonly IntegrationField[]
      readonly env?: Readonly<Record<string, string>>
    }
    readonly authorizeUrl: (args: {
      redirectUri: string
      state: string
      app: Readonly<Record<string, string>>
    }) => string
    readonly exchange: (args: {
      code: string
      redirectUri: string
      app: Readonly<Record<string, string>>
    }) => Promise<IntegrationOAuthResult> | IntegrationOAuthResult
  }
  /** Checks the values without posting anything; `name` is the connection's. */
  readonly test?: (
    values: Readonly<Record<string, string>>,
    args: { cms: EasyCMS; name?: string; app: Readonly<Record<string, string>> },
  ) => Promise<IntegrationTestResult> | IntegrationTestResult
  /**
   * Asked before the first connection (#357), e.g. that text sent to an AI provider leaves the
   * site: an admin accepts it, and who did is audit-logged.
   */
  readonly consent?: { readonly text: Label; readonly policy?: string }
  /** A place backups can go (category `backups`): its connections are offered in Settings → Backups. */
  readonly backups?: (
    values: Readonly<Record<string, string>>,
    /** `app`: the OAuth app's keys, e.g. to refresh a token. */
    args: { cms: EasyCMS; app: Readonly<Record<string, string>> },
  ) => BackupDestination | Promise<BackupDestination>
  /**
   * Sends email (category `email`, usually from `defineEmailProvider`): an admin can choose a
   * connection to send the site's email instead of the config's `email`.
   */
  readonly email?: {
    readonly create: (
      values: Readonly<Record<string, string>>,
      args: { cms: EasyCMS },
    ) => EmailAdapter
    /** Delivery events from the provider's webhook; throw when the request isn't its own. */
    readonly events?: (
      request: EmailWebhookRequest,
      values: Readonly<Record<string, string>>,
    ) => readonly EmailEvent[] | Promise<readonly EmailEvent[]>
    /** How to add the webhook at the provider. */
    readonly webhookSetup?: Label
  }
}

/** A connection as plugins read it: its values, secrets decrypted. */
export interface IntegrationConnection {
  readonly name: string
  readonly values: Readonly<Record<string, string>>
  /** From environment variables. */
  readonly env: boolean
}

type Data = Record<string, unknown>
const ENV_NAME = 'Environment'
/** OAuth and account choices live this long. */
const PENDING_MS = 10 * 60 * 1000

// --- Encryption ---------------------------------------------------------------------------------

const keyOf = (secret: string) =>
  Buffer.from(hkdfSync('sha256', secret, '', 'easy-cms:connections', 32))
const keyId = (key: Buffer) => createHash('sha256').update(key).digest('hex').slice(0, 12)

/** AES-256-GCM with a key derived from the secret; the result names the key it used. */
export function encryptValues(secret: string, values: Readonly<Record<string, string>>): string {
  const key = keyOf(secret)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(JSON.stringify(values), 'utf8'), cipher.final()])
  const box = {
    k: keyId(key),
    iv: iv.toString('base64'),
    t: cipher.getAuthTag().toString('base64'),
    d: data.toString('base64'),
  }
  return Buffer.from(JSON.stringify(box)).toString('base64url')
}

/** The values, and whether they were encrypted with an older secret. */
export function decryptValues(
  secrets: readonly string[],
  sealed: string,
): { values: Record<string, string>; old: boolean } {
  const box = JSON.parse(Buffer.from(sealed, 'base64url').toString('utf8')) as Record<
    string,
    string
  >
  for (const [i, secret] of secrets.entries()) {
    const key = keyOf(secret)
    if (keyId(key) !== box.k) continue
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(String(box.iv), 'base64'))
    decipher.setAuthTag(Buffer.from(String(box.t), 'base64'))
    const text = Buffer.concat([
      decipher.update(Buffer.from(String(box.d), 'base64')),
      decipher.final(),
    ]).toString('utf8')
    return { values: JSON.parse(text) as Record<string, string>, old: i > 0 }
  }
  throw new Error('A connection was encrypted with a secret that is no longer configured')
}

const keyIdOf = (sealed: unknown) => {
  try {
    return (JSON.parse(Buffer.from(String(sealed), 'base64url').toString('utf8')) as { k?: string })
      .k
  } catch {
    return undefined
  }
}

// --- Signed OAuth state -------------------------------------------------------------------------

function signState(secret: string, payload: Data): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${signValue(secret, `integration:${body}`)}`
}
function readState(secrets: readonly string[], state: string): Data | null {
  const [body, signature] = state.split('.')
  if (!body || !signature || !signedWith(secrets, `integration:${body}`, signature)) return null
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Data
  return typeof payload.exp === 'number' && payload.exp > Date.now() ? payload : null
}

// --- Admin's view -------------------------------------------------------------------------------

export interface AdminConnection {
  id: ID | 'env'
  name: string
  isDefault: boolean
  env: boolean
  account: string | null
  lastUsedAt: string | null
  lastError: string | null
  /** Plain values; secrets as `••••1234`. */
  values: Record<string, string>
  /** AI providers (#357): requests and tokens this month. */
  usage?: { requests: number; input: number; output: number }
  /** Email providers: it sends the site's email. */
  active?: boolean
  /** Email providers with a webhook: where the provider posts delivery events. */
  webhookUrl?: string
}

/** A field as the admin gets it: without its functions. */
export type AdminIntegrationField = Omit<IntegrationField, 'lookup'> & { findable?: true }

export interface AdminIntegration {
  id: string
  label: Label
  category: IntegrationCategory
  description?: Label
  icon?: string | IntegrationLogo
  docs?: string
  plugin?: string
  kind: 'fields' | 'oauth'
  fields: AdminIntegrationField[]
  enabled: boolean
  /** Fields set in the environment. */
  envFields: string[]
  testable: boolean
  connections: AdminConnection[]
  /** Asked before the first connection; `consented` says who accepted it. */
  consent?: { text: Label; policy?: string }
  consented?: { at: string; by: string } | null
  /**
   * OAuth: the app's keys at the provider, set before connecting. `values` has secrets masked;
   * `redirectUri` is what the provider's console needs.
   */
  app?: {
    fields: AdminIntegrationField[]
    envFields: string[]
    values: Record<string, string>
    complete: boolean
    redirectUri: string
  }
  /** Email providers: how to add the webhook at the provider, when it has one. */
  email?: { webhook: boolean; webhookSetup?: Label }
}

/** What the code configures: shown, not changed, on the Integrations page. */
export interface ConfiguredService {
  id: string
  kind: 'email' | 'storage' | 'search' | 'sign-in' | 'payments'
  name: string
}

/** Official plugins, offered when they aren't installed. */
export const OFFICIAL_PLUGINS: readonly {
  name: string
  category: IntegrationCategory | 'payments'
  description: Label
  docs: string
}[] = [
  {
    name: '@easy-cms/plugin-social',
    category: 'social',
    description: {
      en: 'Post to Facebook, LINE, X and webhooks from the admin',
      th: 'โพสต์ไป Facebook, LINE, X และ webhook จาก admin',
    },
    docs: 'https://easycms.dev/docs/social',
  },
  {
    name: '@easy-cms/plugin-notify',
    category: 'notifications',
    description: { en: 'Telegram notifications for admins', th: 'แจ้งเตือนผู้ดูแลทาง Telegram' },
    docs: 'https://easycms.dev/docs/notifications',
  },
  {
    name: '@easy-cms/plugin-ai',
    category: 'ai',
    description: {
      en: 'Claude, GPT and Gemini for alt text, SEO and translation',
      th: 'Claude, GPT และ Gemini สำหรับ alt text, SEO และแปลภาษา',
    },
    docs: 'https://easycms.dev/docs/ai',
  },
  {
    name: '@easy-cms/plugin-backups',
    category: 'backups',
    description: {
      en: 'Backups to Google Drive, Cloudflare R2, Backblaze B2 or S3',
      th: 'backup ไป Google Drive, Cloudflare R2, Backblaze B2 หรือ S3',
    },
    docs: 'https://easycms.dev/docs/backups#destinations',
  },
  {
    name: '@easy-cms/plugin-email',
    category: 'email',
    description: {
      en: 'Send with Resend, Postmark or Brevo, chosen in the admin, with bounces kept off',
      th: 'ส่งอีเมลด้วย Resend, Postmark หรือ Brevo เลือกในหน้า admin และกันที่อยู่ที่ตีกลับ',
    },
    docs: 'https://easycms.dev/docs/email#providers',
  },
  {
    name: '@easy-cms/plugin-ecommerce',
    category: 'payments',
    description: { en: 'A shop with Stripe payments', th: 'ร้านค้าพร้อมชำระเงินผ่าน Stripe' },
    docs: 'https://easycms.dev/docs/ecommerce',
  },
]

const mask = (value: string) => (value.length > 4 ? `••••${value.slice(-4)}` : '••••')

/** The connections of plugins' integrations: kept, read and tested by Easy CMS. */
export class Integrations {
  constructor(private readonly cms: EasyCMS) {}

  private get config(): ResolvedConfig {
    return this.cms.config
  }
  private get secrets() {
    return secretsOf(this.config)
  }

  /** The integrations plugins declared. */
  get definitions(): readonly IntegrationConfig[] {
    return this.config.integrations
  }

  private definition(id: string): IntegrationConfig {
    const found = this.definitions.find((d) => d.id === id)
    if (!found) throw new NotFoundError('integrations', id)
    return found
  }

  private async rows(id: string, kind: string): Promise<Data[]> {
    const found = await this.cms.db.find({
      collection: CONNECTIONS,
      where: { and: [{ integration: { equals: id } }, { kind: { equals: kind } }] },
      sort: ['id'],
      limit: 0,
      page: 1,
    })
    return found.docs as Data[]
  }

  /** The values of the fields set in the environment. */
  private envValues(def: IntegrationConfig): Record<string, string> {
    const out: Record<string, string> = {}
    for (const [field, name] of Object.entries(def.env ?? {})) {
      const value = process.env[name]
      if (value) out[field] = value
    }
    return out
  }
  /** The OAuth app's keys: the environment's, else what an admin entered. */
  private async appValues(def: IntegrationConfig): Promise<Record<string, string>> {
    const app = def.oauth?.app
    if (!app) return {}
    const [row] = await this.rows(def.id, 'integration')
    const stored = ((row?.values as Data | null)?.app ?? {}) as Record<string, string>
    let secret: Record<string, string> = {}
    if (row?.secret) {
      try {
        secret = decryptValues(this.secrets, String(row.secret)).values
      } catch {
        secret = {}
      }
    }
    const out: Record<string, string> = { ...stored, ...secret }
    for (const [field, name] of Object.entries(app.env ?? {})) {
      const value = process.env[name]
      if (value) out[field] = value
    }
    return out
  }
  /** The OAuth app's keys for a plugin (the environment's win), e.g. to refresh a token. */
  async app(id: string): Promise<Record<string, string>> {
    return this.appValues(this.definition(id))
  }

  /** Whether the OAuth app's required keys are all there. */
  private appComplete(def: IntegrationConfig, values: Record<string, string>): boolean {
    return (def.oauth?.app?.fields ?? []).every((f) => !f.required || !!values[f.name])
  }

  /**
   * Saves the OAuth app's keys: empty secrets keep the ones saved; those set in the
   * environment can't be changed here. Audit-logged.
   */
  async setApp(id: string, body: unknown, user: AuthUser) {
    const def = this.definition(id)
    const app = def.oauth?.app
    if (!app) throw new QueryError(`${id} has no app keys`)
    const input = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
    const given = (input.values ?? {}) as Record<string, unknown>
    const env = new Set(
      Object.entries(app.env ?? {})
        .filter(([, name]) => process.env[name])
        .map(([field]) => field),
    )
    const [row] = await this.rows(id, 'integration')
    const before = await this.appValues(def)
    const plain: Record<string, string> = {}
    const secret: Record<string, string> = {}
    const errors: { field: string; message: string }[] = []
    for (const field of app.fields) {
      if (env.has(field.name)) continue
      const raw = typeof given[field.name] === 'string' ? (given[field.name] as string).trim() : ''
      const value = raw || (field.secret ? (before[field.name] ?? '') : '')
      if (field.required && !value) errors.push({ field: field.name, message: 'is required' })
      if (value) (field.secret ? secret : plain)[field.name] = value
    }
    if (errors.length) throw new ValidationError('connections', errors)
    await this.saveIntegration(id, {
      values: { ...((row?.values ?? {}) as Data), app: plain },
      secret: Object.keys(secret).length ? encryptValues(this.config.secret, secret) : null,
    })
    await this.audit(user, 'app', id)
    return { saved: true }
  }

  /** Every field is in the environment: an "Environment" connection. */
  private envComplete(def: IntegrationConfig): boolean {
    const env = this.envValues(def)
    const fields = def.fields ?? []
    return (
      fields.length > 0 &&
      fields.every((f) => env[f.name] || !f.required) &&
      Object.keys(env).length > 0
    )
  }

  private async enabled(id: string): Promise<boolean> {
    const [row] = await this.rows(id, 'integration')
    return row ? row.enabled !== false : true
  }

  private decrypt(row: Data): Record<string, string> {
    const plain = (row.values ?? {}) as Record<string, string>
    if (!row.secret) return { ...plain }
    const { values, old } = decryptValues(this.secrets, String(row.secret))
    // Encrypted with an older secret: again with the current one.
    if (old) void this.reseal(row, values)
    return { ...plain, ...values }
  }
  private async reseal(row: Data, secrets: Record<string, string>) {
    await this.cms.db.update({
      collection: CONNECTIONS,
      id: row.id as ID,
      data: { ...row, secret: encryptValues(this.config.secret, secrets) },
    })
  }

  /** Splits values into the plain ones and the secret ones (encrypted). */
  private seal(def: IntegrationConfig, values: Record<string, string>) {
    const secretNames = new Set((def.fields ?? []).filter((f) => f.secret).map((f) => f.name))
    const plain: Record<string, string> = {}
    const secret: Record<string, string> = {}
    for (const [name, value] of Object.entries(values))
      (secretNames.has(name) || def.kind === 'oauth' ? secret : plain)[name] = value
    return {
      values: plain,
      secret: Object.keys(secret).length ? encryptValues(this.config.secret, secret) : null,
    }
  }

  /**
   * A connection for a plugin: the default one, or the one named; `null` when there is none
   * or the integration is turned off. Values from the environment win.
   */
  async get(id: string, options: { name?: string } = {}): Promise<IntegrationConnection | null> {
    const def = this.definition(id)
    if (!(await this.enabled(id))) return null
    const env = this.envValues(def)
    if (this.envComplete(def) && (!options.name || options.name === ENV_NAME))
      return { name: ENV_NAME, values: env, env: true }
    const rows = await this.rows(id, 'connection')
    const row = options.name
      ? rows.find((r) => r.name === options.name)
      : (rows.find((r) => r.isDefault === true) ?? rows[0])
    if (!row) return null
    return { name: String(row.name), values: { ...this.decrypt(row), ...env }, env: false }
  }

  /**
   * Every connection of an integration (the environment's first), e.g. to notify each chat;
   * none when it is turned off.
   */
  async all(id: string): Promise<IntegrationConnection[]> {
    const def = this.definition(id)
    if (!(await this.enabled(id))) return []
    const env = this.envValues(def)
    const out: IntegrationConnection[] = this.envComplete(def)
      ? [{ name: ENV_NAME, values: env, env: true }]
      : []
    for (const row of await this.rows(id, 'connection'))
      out.push({ name: String(row.name), values: { ...this.decrypt(row), ...env }, env: false })
    return out
  }

  /** A connection by its id (`env`: the environment's), values decrypted; `null` when gone or off. */
  async byId(id: string, cid: ID | 'env'): Promise<IntegrationConnection | null> {
    const def = this.definition(id)
    if (!(await this.enabled(id))) return null
    const env = this.envValues(def)
    if (cid === 'env')
      return this.envComplete(def) ? { name: ENV_NAME, values: env, env: true } : null
    const row = (await this.rows(id, 'connection')).find((r) => String(r.id) === String(cid))
    if (!row) return null
    return { name: String(row.name), values: { ...this.decrypt(row), ...env }, env: false }
  }

  /** Every connection with its id (`env` for the environment's), values decrypted. */
  async connectionsOf(id: string): Promise<(IntegrationConnection & { id: ID | 'env' })[]> {
    const def = this.definition(id)
    const env = this.envValues(def)
    const out: (IntegrationConnection & { id: ID | 'env' })[] = this.envComplete(def)
      ? [{ id: 'env', name: ENV_NAME, values: env, env: true }]
      : []
    for (const row of await this.rows(id, 'connection')) {
      try {
        out.push({
          id: row.id as ID,
          name: String(row.name),
          values: { ...this.decrypt(row), ...env },
          env: false,
        })
      } catch {
        // Sealed with a secret that is gone: it can't be used.
      }
    }
    return out
  }

  /** The connection was used: its card says when, and an earlier error is gone. */
  async markUsed(id: string, name?: string) {
    await this.mark(id, name, { lastUsedAt: new Date().toISOString(), lastError: null })
  }
  /** It failed: the card and the dashboard's "needs attention" say why. */
  async markError(id: string, message: string, name?: string) {
    await this.mark(id, name, { lastError: message.slice(0, 500) })
    this.cms.systemEvent('integration.failed', {
      integration: id,
      name: name ?? null,
      error: message,
    })
  }
  private async mark(id: string, name: string | undefined, patch: Data) {
    const rows = await this.rows(id, 'connection')
    const row = name
      ? rows.find((r) => r.name === name)
      : (rows.find((r) => r.isDefault === true) ?? rows[0])
    if (!row) return
    await this.cms.db.update({
      collection: CONNECTIONS,
      id: row.id as ID,
      data: { ...row, ...patch, updatedAt: new Date().toISOString() },
    })
  }

  // --- The admin's page ------------------------------------------------------------------------

  async overview(redirectBase = ''): Promise<{
    integrations: AdminIntegration[]
    configured: ConfiguredService[]
    catalog: typeof OFFICIAL_PLUGINS
    staleSecrets: number
    /** With email providers: the one in use (`null`: the config's `email`, named by `code`). */
    email?: { active: { integration: string; connection: ID | 'env' } | null; code: string | null }
  }> {
    const integrations: AdminIntegration[] = []
    const usage = (await this.cms.ai?.usageByConnection()) ?? new Map()
    const aiProviders = new Set(this.config.ai?.providers.map((p) => p.integration) ?? [])
    const current = keyId(keyOf(this.config.secret))
    const activeEmail = await this.cms.emailProviders.active()
    let stale = 0
    for (const def of this.definitions) {
      const rows = await this.rows(def.id, 'connection')
      const env = this.envValues(def)
      const connections: AdminConnection[] = rows.map((row) => {
        if (row.secret && keyIdOf(row.secret) !== current) stale++
        const secretNames = (def.fields ?? []).filter((f) => f.secret).map((f) => f.name)
        let values: Record<string, string> = { ...((row.values ?? {}) as Record<string, string>) }
        try {
          const all = this.decrypt(row)
          for (const name of secretNames) if (all[name]) values[name] = mask(all[name])
        } catch {
          values = { ...values }
        }
        return {
          id: row.id as ID,
          name: String(row.name),
          isDefault: row.isDefault === true,
          env: false,
          account: (row.account as string | null) ?? null,
          lastUsedAt: (row.lastUsedAt as string | null) ?? null,
          lastError: (row.lastError as string | null) ?? null,
          values,
        }
      })
      if (this.envComplete(def)) {
        for (const c of connections) c.isDefault = false
        connections.unshift({
          id: 'env',
          name: ENV_NAME,
          isDefault: true,
          env: true,
          account: null,
          lastUsedAt: null,
          lastError: null,
          values: Object.fromEntries(
            Object.entries(env).map(([k, v]) =>
              (def.fields ?? []).find((f) => f.name === k)?.secret ? [k, mask(v)] : [k, v],
            ),
          ),
        })
      }
      integrations.push({
        id: def.id,
        label: def.label,
        category: def.category,
        ...(def.description ? { description: def.description } : {}),
        ...(def.icon ? { icon: def.icon } : {}),
        ...(def.docs ? { docs: def.docs } : {}),
        ...(def.plugin ? { plugin: def.plugin } : {}),
        kind: def.kind,
        // Functions don't travel: `findable` says a field has a Find button.
        fields: (def.fields ?? []).map(({ lookup, ...field }) => ({
          ...field,
          ...(lookup ? { findable: true } : {}),
        })),
        enabled: await this.enabled(def.id),
        envFields: Object.keys(env),
        testable: typeof def.test === 'function',
        connections: aiProviders.has(def.id)
          ? connections.map((c) => ({
              ...c,
              usage: usage.get(`${def.id}:${c.name}`) ?? { requests: 0, input: 0, output: 0 },
            }))
          : connections,
        ...(def.consent ? { consent: def.consent, consented: await this.consented(def.id) } : {}),
        ...(def.oauth?.app ? { app: await this.adminApp(def, redirectBase) } : {}),
        ...(def.email
          ? {
              email: {
                webhook: typeof def.email.events === 'function',
                ...(def.email.webhookSetup ? { webhookSetup: def.email.webhookSetup } : {}),
              },
            }
          : {}),
      })
      if (def.email) {
        const card = integrations[integrations.length - 1] as AdminIntegration
        for (const c of card.connections) {
          c.active =
            activeEmail?.integration === def.id && String(activeEmail.connection) === String(c.id)
          if (def.email.events)
            c.webhookUrl = this.cms.emailProviders.webhookUrl(redirectBase, def.id, c.id)
        }
      }
    }
    const installed = new Set(this.config.installedPlugins.map((p) => p.name))
    return {
      integrations,
      configured: this.configured(),
      catalog: OFFICIAL_PLUGINS.filter((p) => !installed.has(p.name)),
      staleSecrets: stale,
      ...(this.definitions.some((d) => d.email)
        ? {
            email: {
              active: activeEmail,
              code: this.config.email ? (this.config.email.name ?? 'custom') : null,
            },
          }
        : {}),
    }
  }

  /** The OAuth app's keys as the admin shows them: secrets masked. */
  private async adminApp(def: IntegrationConfig, redirectBase: string) {
    const app = def.oauth?.app
    const values = await this.appValues(def)
    const fields = app?.fields ?? []
    return {
      fields: fields.map(({ lookup: _lookup, ...field }) => field),
      envFields: Object.entries(app?.env ?? {})
        .filter(([, name]) => process.env[name])
        .map(([field]) => field),
      values: Object.fromEntries(
        Object.entries(values).map(([k, v]) =>
          fields.find((f) => f.name === k)?.secret ? [k, mask(v)] : [k, v],
        ),
      ),
      complete: this.appComplete(def, values),
      redirectUri: `${redirectBase}/${def.id}/callback`,
    }
  }

  /** The adapters the config sets: email, storage, search, sign-in, payments. */
  private configured(): ConfiguredService[] {
    const out: ConfiguredService[] = []
    const { config } = this
    // With email providers, the config's is shown among them, as the default.
    if (config.email && !this.definitions.some((d) => d.email))
      out.push({ id: 'email', kind: 'email', name: config.email.name ?? 'email' })
    out.push({ id: 'storage', kind: 'storage', name: config.upload.storage?.name ?? 'disk' })
    if (config.search)
      out.push({ id: 'search', kind: 'search', name: config.search.name ?? 'search' })
    for (const provider of config.auth.providers ?? [])
      out.push({ id: `sign-in:${provider.id}`, kind: 'sign-in', name: provider.id })
    if (config.installedPlugins.some((p) => p.name === '@easy-cms/plugin-ecommerce'))
      out.push({ id: 'payments', kind: 'payments', name: 'Stripe' })
    return out
  }

  private async audit(user: AuthUser, action: string, id: string, detail: Data = {}) {
    await this.cms.audit.record({ action: `integration.${action}`, target: id, user, detail })
  }

  private checkFields(def: IntegrationConfig, values: Record<string, string>, partial: boolean) {
    const errors = (def.fields ?? [])
      .filter((f) => f.required && !partial && !values[f.name])
      .map((f) => ({ field: f.name, message: 'is required' }))
    if (errors.length) throw new ValidationError(CONNECTIONS, errors)
  }
  private cleanValues(def: IntegrationConfig, raw: unknown): Record<string, string> {
    const input = (raw && typeof raw === 'object' ? raw : {}) as Data
    const out: Record<string, string> = {}
    for (const field of def.fields ?? []) {
      const raw = input[field.name]
      // Ticked options arrive as a list.
      const value = Array.isArray(raw) ? raw.filter((v) => typeof v === 'string').join(',') : raw
      if (typeof value === 'string' && value.trim() !== '') out[field.name] = value.trim()
    }
    return out
  }
  private async uniqueName(id: string, name: string, self?: ID) {
    const trimmed = name.trim()
    if (!trimmed || trimmed.length > 60)
      throw new ValidationError(CONNECTIONS, [
        { field: 'name', message: 'must be 1 to 60 characters' },
      ])
    if (
      trimmed === ENV_NAME ||
      (await this.rows(id, 'connection')).some((r) => r.name === trimmed && r.id !== self)
    )
      throw new ValidationError(CONNECTIONS, [
        { field: 'name', message: `there is already a connection named "${trimmed}"` },
      ])
    return trimmed
  }

  private async create(
    def: IntegrationConfig,
    name: string,
    values: Record<string, string>,
    account: string | null,
  ) {
    const existing = await this.rows(def.id, 'connection')
    const now = new Date().toISOString()
    return (await this.cms.db.create({
      collection: CONNECTIONS,
      data: {
        kind: 'connection',
        integration: def.id,
        name,
        isDefault: existing.length === 0,
        ...this.seal(def, values),
        account,
        lastUsedAt: null,
        lastError: null,
        enabled: null,
        createdAt: now,
        updatedAt: now,
      },
    })) as Data
  }

  /** Connects with pasted values (`kind: 'fields'`); tested first when the plugin can. */
  async connect(id: string, body: unknown, user: AuthUser) {
    const def = this.definition(id)
    if (def.kind !== 'fields') throw new QueryError(`${id} connects with its Connect button`)
    await this.checkConsent(def)
    const input = (body ?? {}) as Data
    const name = await this.uniqueName(id, String(input.name ?? ''))
    const values = this.cleanValues(def, input.values)
    this.checkFields(def, values, false)
    const result = def.test
      ? await def.test(values, { cms: this.cms, name, app: await this.appValues(def) })
      : null
    if (result && !result.ok)
      throw new ValidationError(CONNECTIONS, [
        { field: 'values', message: result.message ?? 'the provider refused these values' },
      ])
    const row = await this.create(def, name, values, result?.account ?? null)
    await this.audit(user, 'connect', id, { name })
    return { id: row.id as ID }
  }

  private async row(id: string, cid: ID): Promise<Data> {
    const row = (await this.cms.db.findById({ collection: CONNECTIONS, id: cid })) as Data | null
    if (!row || row.integration !== id || row.kind !== 'connection')
      throw new NotFoundError(CONNECTIONS, cid)
    return row
  }

  /** A new name or values (secrets left empty are kept), or the default. */
  async update(id: string, cid: ID, body: unknown, user: AuthUser) {
    const def = this.definition(id)
    const row = await this.row(id, cid)
    const input = (body ?? {}) as Data
    const next: Data = { ...row, updatedAt: new Date().toISOString() }
    if (input.name !== undefined) next.name = await this.uniqueName(id, String(input.name), cid)
    if (input.values !== undefined) {
      const values = { ...this.decrypt(row), ...this.cleanValues(def, input.values) }
      this.checkFields(def, values, false)
      Object.assign(next, this.seal(def, values), { lastError: null })
    }
    if (input.isDefault === true) {
      for (const other of await this.rows(id, 'connection'))
        if (other.id !== cid && other.isDefault === true)
          await this.cms.db.update({
            collection: CONNECTIONS,
            id: other.id as ID,
            data: { ...other, isDefault: false },
          })
      next.isDefault = true
    }
    await this.cms.db.update({ collection: CONNECTIONS, id: cid, data: next })
    await this.audit(user, input.isDefault === true ? 'default' : 'update', id, { name: next.name })
    return { ok: true }
  }

  /** Removes the connection and its secrets; the oldest left becomes the default. */
  async disconnect(id: string, cid: ID, user: AuthUser) {
    const row = await this.row(id, cid)
    await this.cms.emailProviders.guard(id, cid)
    await this.cms.db.delete({ collection: CONNECTIONS, id: cid })
    if (row.isDefault === true) {
      const [oldest] = await this.rows(id, 'connection')
      if (oldest)
        await this.cms.db.update({
          collection: CONNECTIONS,
          id: oldest.id as ID,
          data: { ...oldest, isDefault: true },
        })
    }
    await this.audit(user, 'disconnect', id, { name: row.name })
    return { deleted: 1 }
  }

  /** Turns the integration on or off; its connections are kept. */
  async setEnabled(id: string, enabled: boolean, user: AuthUser) {
    this.definition(id)
    if (!enabled) await this.cms.emailProviders.guard(id)
    await this.saveIntegration(id, { enabled })
    await this.audit(user, enabled ? 'enable' : 'disable', id)
    return { enabled }
  }

  /** Who accepted the integration's `consent`, and when; `null` before anyone did. */
  private async consented(id: string): Promise<{ at: string; by: string } | null> {
    const [row] = await this.rows(id, 'integration')
    const consent = ((row?.values ?? {}) as Data).consent as { at: string; by: string } | undefined
    return consent ?? null
  }
  private async checkConsent(def: IntegrationConfig) {
    if (def.consent && !(await this.consented(def.id)))
      throw new ValidationError(CONNECTIONS, [
        { field: 'consent', message: 'must be accepted before connecting' },
      ])
  }

  /** An admin accepts the integration's `consent`; audit-logged. */
  async consent(id: string, user: AuthUser) {
    const def = this.definition(id)
    if (!def.consent) throw new QueryError(`${id} asks for no consent`)
    const [row] = await this.rows(id, 'integration')
    const consent = { at: new Date().toISOString(), by: String(user.email ?? user.id) }
    await this.saveIntegration(id, { values: { ...((row?.values ?? {}) as Data), consent } })
    await this.audit(user, 'consent', id)
    return { consented: consent }
  }

  /** The integration's own row (on or off, consent), made when first needed. */
  private async saveIntegration(id: string, patch: Data) {
    const [row] = await this.rows(id, 'integration')
    const now = new Date().toISOString()
    if (row)
      await this.cms.db.update({
        collection: CONNECTIONS,
        id: row.id as ID,
        data: { ...row, ...patch, updatedAt: now },
      })
    else
      await this.cms.db.create({
        collection: CONNECTIONS,
        data: {
          kind: 'integration',
          integration: id,
          name: null,
          isDefault: false,
          values: null,
          secret: null,
          account: null,
          lastUsedAt: null,
          lastError: null,
          enabled: null,
          createdAt: now,
          updatedAt: now,
          ...patch,
        },
      })
  }

  /** Checks a connection's values with the provider; the card shows the result. */
  async test(id: string, cid: ID | 'env') {
    const def = this.definition(id)
    if (!def.test) throw new QueryError(`${id} can't be tested`)
    const values =
      cid === 'env'
        ? this.envValues(def)
        : { ...this.decrypt(await this.row(id, cid)), ...this.envValues(def) }
    const name = cid === 'env' ? ENV_NAME : String((await this.row(id, cid)).name)
    let result: IntegrationTestResult
    try {
      result = await def.test(values, { cms: this.cms, name, app: await this.appValues(def) })
    } catch (error) {
      result = { ok: false, message: (error as Error).message }
    }
    if (cid !== 'env') {
      const row = await this.row(id, cid)
      await this.cms.db.update({
        collection: CONNECTIONS,
        id: cid,
        data: {
          ...row,
          ...(result.ok
            ? { lastError: null, ...(result.account ? { account: result.account } : {}) }
            : { lastError: result.message ?? 'Test failed' }),
          updatedAt: new Date().toISOString(),
        },
      })
      if (!result.ok)
        this.cms.systemEvent('integration.failed', {
          integration: id,
          name: row.name ?? null,
          error: result.message ?? 'Test failed',
        })
    }
    return result
  }

  /**
   * A field's choices from the provider, with the values typed (and, editing a connection, its
   * stored secrets for the fields left empty).
   */
  async lookup(id: string, fieldName: string, body: unknown) {
    const def = this.definition(id)
    const field = (def.fields ?? []).find((f) => f.name === fieldName)
    if (!field?.lookup) throw new QueryError(`${id}.${fieldName} has nothing to look up`)
    const input = (body ?? {}) as Data
    const stored =
      input.connection !== undefined && input.connection !== null
        ? this.decrypt(await this.row(id, input.connection as ID))
        : {}
    const values = { ...stored, ...this.envValues(def), ...this.cleanValues(def, input.values) }
    try {
      return { choices: [...(await field.lookup(values, { cms: this.cms }))].slice(0, 100) }
    } catch (error) {
      throw new ValidationError(CONNECTIONS, [
        { field: fieldName, message: (error as Error).message },
      ])
    }
  }

  // --- OAuth -----------------------------------------------------------------------------------

  /** The provider's sign-in page to send the admin to. */
  async authorize(
    id: string,
    user: AuthUser,
    redirectUri: string,
    name: string,
  ): Promise<{ url: string }> {
    const def = this.definition(id)
    if (def.kind !== 'oauth' || !def.oauth)
      throw new QueryError(`${id} connects with pasted values`)
    await this.checkConsent(def)
    const app = await this.appValues(def)
    if (!this.appComplete(def, app))
      throw new QueryError(`Enter the app's keys for ${String(def.label)} first`)
    const state = signState(this.config.secret, {
      i: id,
      u: String(user.id),
      n: name,
      exp: Date.now() + PENDING_MS,
    })
    return { url: def.oauth.authorizeUrl({ redirectUri, state, app }) }
  }

  /**
   * Back from the provider: one account is connected at once; several wait (encrypted, 10
   * minutes) for the admin to choose. Returns where the admin goes next.
   */
  async callback(id: string, code: string, stateText: string, redirectUri: string, user: AuthUser) {
    const def = this.definition(id)
    const state = readState(this.secrets, stateText)
    if (!state || state.i !== id || state.u !== String(user.id) || !def.oauth)
      throw new ForbiddenError(
        'This connection link has expired: start again from the Integrations page',
      )
    const result = await def.oauth.exchange({ code, redirectUri, app: await this.appValues(def) })
    const name = typeof state.n === 'string' && state.n ? state.n : String(def.label)
    if (result.accounts && result.accounts.length > 0) {
      if (result.accounts.length === 1) {
        const [account] = result.accounts
        await this.create(
          def,
          await this.uniqueName(id, name),
          { ...account!.values },
          account!.name,
        )
        await this.audit(user, 'connect', id, { name })
        return { connected: true as const }
      }
      const now = new Date().toISOString()
      const pending = (await this.cms.db.create({
        collection: CONNECTIONS,
        data: {
          kind: 'pending',
          integration: id,
          name,
          isDefault: false,
          values: {
            user: String(user.id),
            expires: String(Date.now() + PENDING_MS),
            accounts: JSON.stringify(result.accounts.map((a) => ({ id: a.id, name: a.name }))),
          },
          secret: encryptValues(
            this.config.secret,
            Object.fromEntries(result.accounts.map((a) => [a.id, JSON.stringify(a.values)])),
          ),
          account: null,
          lastUsedAt: null,
          lastError: null,
          enabled: null,
          createdAt: now,
          updatedAt: now,
        },
      })) as Data
      return { pending: pending.id as ID }
    }
    await this.create(
      def,
      await this.uniqueName(id, name),
      { ...(result.values ?? {}) },
      result.account ?? null,
    )
    await this.audit(user, 'connect', id, { name })
    return { connected: true as const }
  }

  /** The accounts waiting to be chosen from, by name only. */
  async pending(id: string, pid: ID, user: AuthUser) {
    const row = await this.pendingRow(id, pid, user)
    const values = row.values as Record<string, string>
    return {
      name: String(row.name),
      accounts: JSON.parse(values.accounts ?? '[]') as { id: string; name: string }[],
    }
  }
  private async pendingRow(id: string, pid: ID, user: AuthUser) {
    const row = (await this.cms.db.findById({ collection: CONNECTIONS, id: pid })) as Data | null
    const values = (row?.values ?? {}) as Record<string, string>
    if (
      !row ||
      row.kind !== 'pending' ||
      row.integration !== id ||
      values.user !== String(user.id) ||
      Number(values.expires) < Date.now()
    )
      throw new NotFoundError(CONNECTIONS, pid)
    return row
  }

  /** Connects the account chosen. */
  async choose(id: string, pid: ID, accountId: string, user: AuthUser) {
    const def = this.definition(id)
    const row = await this.pendingRow(id, pid, user)
    const secrets = decryptValues(this.secrets, String(row.secret)).values
    const chosen = secrets[accountId]
    const accounts = JSON.parse(
      String((row.values as Record<string, string>).accounts ?? '[]'),
    ) as { id: string; name: string }[]
    const account = accounts.find((a) => a.id === accountId)
    if (!chosen || !account) throw new NotFoundError('accounts', accountId)
    await this.cms.db.delete({ collection: CONNECTIONS, id: pid })
    const name = await this.uniqueName(id, String(row.name))
    const created = await this.create(
      def,
      name,
      JSON.parse(chosen) as Record<string, string>,
      account.name,
    )
    await this.audit(user, 'connect', id, { name })
    return { id: created.id as ID }
  }

  // --- Rotating the secret ---------------------------------------------------------------------

  /** Encrypts again, with the current secret, every connection still on an older one. */
  async rotate(): Promise<{ resealed: number }> {
    const current = keyId(keyOf(this.config.secret))
    const found = await this.cms.db.find({
      collection: CONNECTIONS,
      limit: 0,
      page: 1,
      sort: ['id'],
    })
    let resealed = 0
    for (const row of found.docs as Data[]) {
      if (!row.secret || keyIdOf(row.secret) === current) continue
      const { values } = decryptValues(this.secrets, String(row.secret))
      await this.reseal(row, values)
      resealed++
    }
    return { resealed }
  }

  /** Connections whose test or last use failed, for the dashboard's "needs attention". */
  async broken(): Promise<{ integration: string; name: string; error: string }[]> {
    const found = await this.cms.db.find({
      collection: CONNECTIONS,
      where: { and: [{ kind: { equals: 'connection' } }, { lastError: { exists: true } }] },
      limit: 0,
      page: 1,
      sort: ['id'],
    })
    return (found.docs as Data[])
      .filter((r) => this.definitions.some((d) => d.id === r.integration))
      .map((r) => ({
        integration: String(r.integration),
        name: String(r.name),
        error: String(r.lastError),
      }))
  }
}
