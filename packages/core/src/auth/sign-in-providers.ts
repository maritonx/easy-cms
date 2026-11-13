import { type AuthUser, type ID, isSystemAdmin } from '../access.js'
import { getSetting, setSetting } from '../admin-settings.js'
import { SESSIONS, USER_IDENTITIES, USERS } from '../builtins.js'
import { ForbiddenError, NotFoundError, ValidationError } from '../errors.js'
import type { IntegrationConfig } from '../integrations.js'
import type { EasyCMS } from '../local-api.js'
import { hash } from '../runtime/crypto.js'
import { RESERVED_PROVIDER_IDS } from '../validate-config.js'
import type { AuthProvider } from './providers.js'
import { SignInRules } from './sign-in-rules.js'

// Sign-in providers chosen in the admin (ADR-0066): connections of `sign-in` integrations an admin
// turns on, beside or instead of the config's `auth.providers`, which stay the default.

/** A connection of a sign-in integration. */
export interface SignInConnection {
  integration: string
  connection: ID
}

/** What admins changed (admin setting `sign-in`). */
export interface SignInSetting {
  /** Connections turned on, in the order they were. */
  on: SignInConnection[]
  /** Providers of the config turned off, by id. */
  off: string[]
}

/** A provider that signs people in now, and where it comes from. */
export interface ActiveProvider {
  provider: AuthProvider
  source: 'code' | SignInConnection
}

/** A connection's last sign-in test (admin setting `sign-in-tests`). */
interface SignInTest {
  at: string
  email: string | null
  /** The connection's values and app keys then: a change needs a new test. */
  hash: string
}

const SETTING = 'sign-in'
const TESTS = 'sign-in-tests'
/** Each server reads the admin's choice again after this long. */
const CACHE_MS = 30_000
const EMPTY: SignInSetting = { on: [], off: [] }

const keyOf = (c: SignInConnection) => `${c.integration}:${c.connection}`

/** The sign-in providers of a site: the config's and those turned on in the admin. */
export class SignInProviders {
  private cached: { at: number; active: ActiveProvider[] } | null = null
  /** Who may sign in: with a password, and by signing themselves up (#409). */
  readonly rules: SignInRules

  constructor(private readonly cms: EasyCMS) {
    this.rules = new SignInRules(cms)
  }

  /** The integrations that sign people in. */
  get definitions(): IntegrationConfig[] {
    return this.cms.config.integrations.filter((d) => d.signIn)
  }

  /** `auth.locked`: only the config's providers, and the admin can't change them. */
  get locked(): boolean {
    return this.cms.config.auth.locked
  }

  /** Whether anyone can sign in with a provider: in the config, or to turn on in the admin. */
  get possible(): boolean {
    return this.cms.config.auth.providers.length > 0 || this.definitions.length > 0
  }

  /** What admins changed; nothing with `auth.locked` or without sign-in integrations. */
  async setting(): Promise<SignInSetting> {
    if (this.locked) return EMPTY
    const saved = await getSetting<SignInSetting | null>(this.cms, SETTING).catch(() => undefined)
    if (!saved) return EMPTY
    return {
      on: Array.isArray(saved.on) ? saved.on : [],
      off: Array.isArray(saved.off) ? saved.off : [],
    }
  }

  /**
   * The providers that sign people in now: the config's that weren't turned off, then the
   * connections turned on (one with a config provider's id takes its place). Read again every
   * 30 seconds, so every server follows a change.
   */
  async active(): Promise<ActiveProvider[]> {
    const now = Date.now()
    if (this.cached && now - this.cached.at < CACHE_MS) return this.cached.active
    const setting = await this.setting()
    const list: ActiveProvider[] = this.cms.config.auth.providers
      .filter((p) => !setting.off.includes(p.id))
      .map((provider) => ({ provider, source: 'code' }))
    for (const on of setting.on) {
      try {
        const provider = await this.build(on)
        const at = list.findIndex((a) => a.provider.id === provider.id)
        const entry: ActiveProvider = { provider, source: on }
        if (at >= 0) list[at] = entry
        else list.push(entry)
      } catch (error) {
        this.cms.logger.error(
          `The sign-in provider ${keyOf(on)} turned on in the admin can't be used: ${(error as Error).message}`,
          { error },
        )
      }
    }
    this.cached = { at: now, active: list }
    return list
  }

  /** The providers that sign people in now. */
  async providers(): Promise<AuthProvider[]> {
    return (await this.active()).map((a) => a.provider)
  }

  /** A provider that signs people in now, by id. */
  async provider(id: string): Promise<AuthProvider | undefined> {
    return (await this.providers()).find((p) => p.id === id)
  }

  /** The provider a connection makes, whether it is on or not. */
  async build(c: SignInConnection): Promise<AuthProvider> {
    const def = this.definitions.find((d) => d.id === c.integration)
    if (!def?.signIn) throw new NotFoundError('integrations', c.integration)
    const connection = await this.cms.integrations.byId(c.integration, c.connection)
    if (!connection) throw new Error('that connection is gone')
    const provider = def.signIn.create(connection.values, {
      cms: this.cms,
      app: await this.cms.integrations.app(c.integration),
    })
    if (!/^[a-z0-9-]+$/.test(provider.id) || RESERVED_PROVIDER_IDS.has(provider.id))
      throw new Error(
        `"${provider.id}" can't be a provider's id: use lowercase letters, digits and -`,
      )
    return provider
  }

  /** The values a test is good for: the connection's and its app keys. */
  private async hashOf(c: SignInConnection): Promise<string> {
    const connection = await this.cms.integrations.byId(c.integration, c.connection)
    const app = await this.cms.integrations.app(c.integration)
    return hash('sha256', JSON.stringify([connection?.values ?? null, app]), 'base64url')
  }

  private async tests(): Promise<Record<string, SignInTest>> {
    return (
      (await getSetting<Record<string, SignInTest>>(this.cms, TESTS).catch(() => undefined)) ?? {}
    )
  }

  /** A connection's last passed test, if its values haven't changed since. */
  async tested(c: SignInConnection): Promise<{ at: string; email: string | null } | null> {
    const test = (await this.tests())[keyOf(c)]
    if (!test || test.hash !== (await this.hashOf(c))) return null
    return { at: test.at, email: test.email }
  }

  /** Records a passed test (`SingleSignOn` runs it). @internal */
  async passed(c: SignInConnection, email: string | null, user: AuthUser | null): Promise<void> {
    const tests = await this.tests()
    tests[keyOf(c)] = { at: new Date().toISOString(), email, hash: await this.hashOf(c) }
    await setSetting(this.cms, TESTS, tests)
    await this.cms.audit.record({
      action: 'sign-in.test',
      target: 'auth',
      user,
      detail: { integration: c.integration, connection: String(c.connection), email },
    })
  }

  /** Whether a connection is turned on for signing in. */
  async isOn(integration: string, connection?: ID): Promise<boolean> {
    return (await this.setting()).on.some(
      (o) =>
        o.integration === integration &&
        (connection === undefined || String(o.connection) === String(connection)),
    )
  }

  /** Refuses to change, remove or turn off a connection that signs people in. */
  async guard(integration: string, connection?: ID | 'env'): Promise<void> {
    if (connection === 'env') return
    if (!(await this.isOn(integration, connection))) return
    throw new ValidationError('connections', [
      {
        field: 'connection',
        message: 'This signs people in: turn it off for signing in first',
      },
    ])
  }

  /**
   * Turns a connection, or a provider of the config (`code`), on or off for signing in. A
   * connection is turned on only after a passed test with its current values. Refuses a change
   * after which no admin could sign in. Sessions started with a provider turned off end.
   * Audit-logged.
   */
  async set(
    user: AuthUser,
    change: (SignInConnection | { code: string }) & { on: boolean },
  ): Promise<{ setting: SignInSetting; sessionsEnded: number }> {
    if (!isSystemAdmin(user)) throw new ForbiddenError()
    if (this.locked)
      throw new ValidationError('sign-in', [
        { field: 'providers', message: 'are set in the code (auth.locked)' },
      ])
    const before = await this.setting()
    const next: SignInSetting = { on: [...before.on], off: [...before.off] }
    let detail: Record<string, unknown>
    if ('code' in change) {
      if (!this.cms.config.auth.providers.some((p) => p.id === change.code))
        throw new NotFoundError('auth providers', change.code)
      next.off = change.on
        ? next.off.filter((id) => id !== change.code)
        : [...new Set([...next.off, change.code])]
      detail = { provider: change.code, source: 'code', on: change.on }
    } else {
      const c: SignInConnection = { integration: change.integration, connection: change.connection }
      if (!this.definitions.some((d) => d.id === c.integration))
        throw new NotFoundError('integrations', c.integration)
      if (!(await this.cms.integrations.byId(c.integration, c.connection)))
        throw new NotFoundError('connections', c.connection)
      next.on = next.on.filter((o) => keyOf(o) !== keyOf(c))
      if (change.on) {
        if (!(await this.tested(c)))
          throw new ValidationError('sign-in', [
            { field: 'connection', message: 'needs a passed sign-in test first' },
          ])
        const provider = await this.build(c)
        const clash = await this.clash(next, c, provider.id)
        if (clash)
          throw new ValidationError('sign-in', [
            {
              field: 'connection',
              message: `uses the id "${provider.id}", like ${clash}: turn that one off first`,
            },
          ])
        next.on.push(c)
      }
      detail = { integration: c.integration, connection: String(c.connection), on: change.on }
    }
    const was = await this.idsOf(before)
    const will = await this.idsOf(next)
    if ((await this.adminsCanSignIn(was)) && !(await this.adminsCanSignIn(will)))
      throw new ValidationError('sign-in', [
        {
          field: 'providers',
          message:
            'No admin could sign in after this: an admin needs a password or an account linked to a provider that stays on',
        },
      ])
    await setSetting(this.cms, SETTING, next)
    this.cached = null
    const ended = await this.endSessions([...was].filter((id) => !will.has(id)))
    await this.cms.audit.record({
      action: 'sign-in.provider',
      target: 'auth',
      user,
      detail: { ...detail, sessionsEnded: ended },
    })
    return { setting: next, sessionsEnded: ended }
  }

  /**
   * Back to the config's providers and rules: forgets what admins turned on and off, and who they
   * let sign in (`easy-cms reset-sign-in`, for an admin who can't sign in). Audit-logged.
   */
  async reset(user: AuthUser | null): Promise<{ was: SignInSetting; rules: boolean }> {
    const was = await this.setting()
    const ids = await this.idsOf(was)
    await setSetting(this.cms, SETTING, null)
    this.cached = null
    const code = new Set(this.cms.config.auth.providers.map((p) => p.id))
    const ended = await this.endSessions([...ids].filter((id) => !code.has(id)))
    await this.cms.audit.record({
      action: 'sign-in.reset',
      target: 'auth',
      user,
      detail: { turnedOn: was.on.map(keyOf), turnedOff: was.off, sessionsEnded: ended },
    })
    const rules = await this.rules.reset(user)
    return { was, rules: Object.keys(rules.was).length > 0 }
  }

  /** Another connection on, other than `c`, with the same provider id. */
  private async clash(
    setting: SignInSetting,
    c: SignInConnection,
    id: string,
  ): Promise<string | null> {
    for (const other of setting.on) {
      if (keyOf(other) === keyOf(c)) continue
      const provider = await this.build(other).catch(() => null)
      if (provider?.id === id) return provider.name
    }
    return null
  }

  /** The provider ids a setting signs people in with. */
  private async idsOf(setting: SignInSetting): Promise<Set<string>> {
    const ids = new Set(
      this.cms.config.auth.providers.filter((p) => !setting.off.includes(p.id)).map((p) => p.id),
    )
    for (const on of setting.on) {
      const provider = await this.build(on).catch(() => null)
      if (provider) ids.add(provider.id)
    }
    return ids
  }

  /**
   * Whether an active admin can sign in: with a password, or with an account linked to one of
   * `providers`.
   */
  private async adminsCanSignIn(providers: Set<string>): Promise<boolean> {
    const { docs: admins } = await this.cms.db.find({
      collection: USERS,
      where: { role: { equals: 'admin' } },
      sort: [],
      limit: 0,
      page: 1,
    })
    const active = admins.filter((a) => a.active !== false)
    for (const a of active)
      if (a.passwordHash && (await this.cms.auth.sso.passwordAllowed(a))) return true
    if (providers.size === 0 || active.length === 0) return false
    const { totalDocs } = await this.cms.db.find({
      collection: USER_IDENTITIES,
      where: {
        and: [{ provider: { in: [...providers] } }, { user: { in: active.map((a) => a.id) } }],
      },
      sort: [],
      limit: 1,
      page: 1,
    })
    return totalDocs > 0
  }

  /** Ends the sessions started with these providers. */
  private async endSessions(providers: string[]): Promise<number> {
    if (providers.length === 0) return 0
    const { docs } = await this.cms.db.find({
      collection: SESSIONS,
      where: { method: { in: providers } },
      sort: [],
      limit: 0,
      page: 1,
    })
    for (const session of docs) await this.cms.db.delete({ collection: SESSIONS, id: session.id })
    return docs.length
  }
}
