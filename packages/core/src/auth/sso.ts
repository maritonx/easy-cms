import { createHmac, randomBytes } from 'node:crypto'
import { type AuthUser, type ID, isSystemAdmin } from '../access.js'
import { USER_IDENTITIES, USERS } from '../builtins.js'
import type { RawDocument } from '../database.js'
import { ForbiddenError, NotFoundError, QueryError, ValidationError } from '../errors.js'
import type { EasyCMS } from '../local-api.js'
import type { Session } from './auth.js'
import type { AuthProvider, AuthProviderProfile } from './providers.js'
import { safeEqual } from './tokens.js'

/** The cookie that carries a sign-in through the provider and back. */
export const SSO_COOKIE = 'ecms-sso'
/** How long a sign-in may take at the provider. */
const PENDING_TTL = 10 * 60_000

/** A provider as the login page shows it (`GET <api>/users/init`). */
export interface SsoProviderRef {
  id: string
  name: string
  icon: string
}

/** Settings → SSO (`GET <api>/admin/sso`). */
export interface AdminSso {
  providers: (SsoProviderRef & {
    /** Give this to the provider as the redirect (callback) URL. */
    callbackURL: string | null
    details: Record<string, string>
  })[]
  /** Who may sign in with a password: everyone, or only admins. */
  password: 'everyone' | 'admins'
  /** Email domains whose people get an account when they first sign in. */
  signUp: { domains: string[]; role: string } | null
  /** Without `serverURL`, sign-in only works in development. */
  serverURL: boolean
}

/** An outside account a user signs in with (`GET <api>/auth/identities`). */
export interface UserIdentity {
  id: ID
  provider: string
  /** The provider's name, e.g. `Google`. */
  name: string
  email: string | null
  createdAt: string
  lastUsedAt: string | null
}

/** Why a sign-in did not work, as `?sso=` on the page it ends on. */
export type SsoOutcome =
  | 'linked'
  | 'cancelled'
  | 'expired'
  | 'failed'
  | 'no-account'
  | 'link-first'
  | 'unverified'
  | 'inactive'
  | 'taken'

interface Pending {
  /** Provider id. */
  p: string
  s: string
  v: string
  n: string
  /** The admin page to return to. */
  r: string
  /** Linking an account to this signed-in user, instead of signing in. */
  u?: string
  /** Expires at (ms). */
  e: number
}

const random = () => randomBytes(32).toString('base64url')

function sign(secret: string, payload: string) {
  return createHmac('sha256', secret).update(`sso:${payload}`).digest('base64url')
}

function seal(secret: string, pending: Pending): string {
  const payload = Buffer.from(JSON.stringify(pending)).toString('base64url')
  return `${payload}.${sign(secret, payload)}`
}

function unseal(secret: string, value: string | undefined): Pending | null {
  if (!value) return null
  const dot = value.lastIndexOf('.')
  if (dot <= 0) return null
  const payload = value.slice(0, dot)
  if (!safeEqual(value.slice(dot + 1), sign(secret, payload))) return null
  try {
    const pending = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Pending
    return typeof pending.e === 'number' && pending.e > Date.now() ? pending : null
  } catch {
    return null
  }
}

/** Single sign-on with `auth.providers`. Available as `cms.auth.sso`. */
export class SingleSignOn {
  constructor(private readonly cms: EasyCMS) {}

  private get config() {
    return this.cms.config
  }

  get enabled(): boolean {
    return this.config.auth.providers.length > 0
  }

  providers(): SsoProviderRef[] {
    return this.config.auth.providers.map((p) => ({
      id: p.id,
      name: p.name,
      icon: p.icon ?? 'key',
    }))
  }

  /** Whether a user may sign in with a password (`auth.password: false` leaves only admins). */
  passwordAllowed(user: { readonly [key: string]: unknown }): boolean {
    return this.config.auth.password || user.role === 'admin'
  }

  /** `<serverURL><api>/auth/<id>/callback`, or `null` without `serverURL` in production. */
  callbackURL(provider: string, origin?: string): string | null {
    const base = this.cms.auth.passwordLinkBase(origin)
    return base ? `${base}${this.config.routes.api}/auth/${provider}/callback` : null
  }

  /**
   * Starts signing in (or, with `user`, linking an account): the provider's URL to send the
   * browser to, and the sealed value of the cookie that must come back with it.
   */
  async start(
    providerId: string,
    options: { origin?: string; redirect?: string | null; user?: AuthUser },
  ): Promise<{ url: string; cookie: string }> {
    const provider = this.provider(providerId)
    const redirectUri = this.callbackURL(provider.id, options.origin)
    if (!redirectUri)
      throw new QueryError('Signing in with providers needs `serverURL` in production')
    const pending: Pending = {
      p: provider.id,
      s: random(),
      v: random(),
      n: random(),
      r: this.adminPage(options.redirect),
      ...(options.user ? { u: String(options.user.id) } : {}),
      e: Date.now() + PENDING_TTL,
    }
    const url = await provider.authorizationURL({
      redirectUri,
      state: pending.s,
      codeVerifier: pending.v,
      nonce: pending.n,
    })
    return { url: url.toString(), cookie: seal(this.config.secret, pending) }
  }

  /**
   * Finishes at `<api>/auth/<id>/callback`: checks the response, finds (or makes) the user and
   * starts a session. Returns where to send the browser; failures end on the login page (or the
   * account page, when linking) with `?sso=<outcome>`.
   */
  async finish(
    providerId: string,
    options: { url: URL; cookie: string | undefined; origin?: string; user: AuthUser | null },
  ): Promise<{ redirect: string; session?: Session }> {
    const admin = this.config.admin.path.replace(/\/+$/, '')
    const pending = unseal(this.config.secret, options.cookie)
    let email: string | null = null
    const back = async (page: 'login' | 'account', outcome: SsoOutcome) => {
      await this.cms.audit.record({
        action: 'sso.failed',
        target: 'auth',
        ...(page === 'login' ? { user: null, email } : {}),
        detail: { provider: providerId, outcome },
      })
      return { redirect: `${admin}/${page}?sso=${outcome}` } as const
    }
    const page = pending?.u ? 'account' : 'login'
    if (!pending || pending.p !== providerId) return await back(page, 'expired')
    const state = options.url.searchParams.get('state') ?? ''
    if (!safeEqual(state, pending.s)) return await back(page, 'expired')
    if (options.url.searchParams.has('error')) return await back(page, 'cancelled')

    const provider = this.provider(providerId)
    const redirectUri = this.callbackURL(provider.id, options.origin)
    let profile: AuthProviderProfile
    try {
      if (!redirectUri) throw new Error('no callback URL')
      profile = await provider.callback({
        redirectUri,
        state: pending.s,
        codeVerifier: pending.v,
        nonce: pending.n,
        url: options.url,
      })
    } catch (error) {
      this.cms.logger.warn(
        `Signing in with ${provider.name} failed: ${(error as Error).message || String(error)}`,
      )
      return await back(page, 'failed')
    }
    const subject = String(profile.subject)
    email = profile.email?.trim().toLowerCase() || null

    // Linking an account to the signed-in user.
    if (pending.u) {
      if (!options.user || String(options.user.id) !== pending.u)
        return await back('account', 'failed')
      const existing = await this.identity(provider.id, subject)
      if (existing && String(existing.user) !== pending.u) return await back('account', 'taken')
      if (!existing) await this.addIdentity(options.user.id, provider.id, subject, email)
      await this.cms.audit.record({
        action: 'sso.link',
        target: 'auth',
        user: options.user,
        detail: { provider: provider.id, email },
      })
      return { redirect: `${admin}/account?sso=linked` }
    }

    let user: RawDocument | null = null
    const identity = await this.identity(provider.id, subject)
    if (identity) {
      user = await this.cms.db.findById({ collection: USERS, id: identity.user as ID })
    } else {
      if (!email || !profile.emailVerified)
        return await back('login', email ? 'unverified' : 'no-account')
      user = await this.userByEmail(email)
      // Staff link a provider from their account page first, unless the provider is trusted to
      // sign them in by email (`linkByEmail`): an email someone else can get at the provider
      // shouldn't open an admin's account.
      if (user && !this.isMember(user) && provider.linkByEmail !== true)
        return await back('login', 'link-first')
      if (user && user.emailVerified === false) {
        // A sign-up still waiting for its email: the provider confirms the email now, and a
        // password chosen before that (maybe by someone else) goes.
        const { id, ...rest } = user
        user = (await this.cms.db.update({
          collection: USERS,
          id,
          data: { ...rest, emailVerified: true, passwordHash: null },
        })) as RawDocument
      }
      if (!user) user = await this.signUp(email, profile.name)
      if (!user) return await back('login', 'no-account')
      await this.addIdentity(user.id, provider.id, subject, email)
    }
    if (!user) return await back('login', 'no-account')
    if (user.active === false) return await back('login', 'inactive')
    const found = identity ?? (await this.identity(provider.id, subject))
    if (found) {
      const { id, ...rest } = found
      await this.cms.db.update({
        collection: USER_IDENTITIES,
        id,
        data: { ...rest, email, lastUsedAt: new Date().toISOString() },
      })
    }
    const session = await this.cms.auth.createSession(user.id)
    await this.cms.audit.record({
      action: 'sso.login',
      target: 'auth',
      user: session.user,
      detail: { provider: provider.id, email },
    })
    return { redirect: pending.r, session }
  }

  /** A user's outside accounts. */
  async identities(userId: ID): Promise<UserIdentity[]> {
    if (!this.enabled) return []
    const { docs } = await this.cms.db.find({
      collection: USER_IDENTITIES,
      where: { user: { equals: userId } },
      sort: ['id'],
      limit: 0,
      page: 1,
    })
    return docs.map((row) => ({
      id: row.id,
      provider: String(row.provider),
      name:
        this.config.auth.providers.find((p) => p.id === row.provider)?.name ?? String(row.provider),
      email: typeof row.email === 'string' ? row.email : null,
      createdAt: String(row.createdAt),
      lastUsedAt: typeof row.lastUsedAt === 'string' ? row.lastUsedAt : null,
    }))
  }

  /**
   * Unlinks an outside account: the user's own, or anyone's for admins. Refuses to unlink the
   * last way a user has to sign in.
   */
  async unlink(actor: AuthUser, identityId: ID): Promise<void> {
    if (!this.enabled) throw new NotFoundError(USER_IDENTITIES, identityId)
    const row = await this.cms.db.findById({ collection: USER_IDENTITIES, id: identityId })
    if (!row) throw new NotFoundError(USER_IDENTITIES, identityId)
    const own = String(row.user) === String(actor.id)
    if (!own && (!isSystemAdmin(actor) || actor.apiKey)) throw new ForbiddenError()
    const user = await this.cms.db.findById({ collection: USERS, id: row.user as ID })
    const others = (await this.identities(row.user as ID)).length - 1
    const password = !!user?.passwordHash && this.passwordAllowed(user)
    if (others === 0 && !password)
      throw new ValidationError(USER_IDENTITIES, [
        { field: 'provider', message: 'is the only way left to sign in to this account' },
      ])
    await this.cms.db.delete({ collection: USER_IDENTITIES, id: row.id })
    await this.cms.audit.record({
      action: 'sso.unlink',
      target: USERS,
      doc: row.user as ID,
      title: typeof user?.email === 'string' ? user.email : null,
      detail: { provider: String(row.provider), email: row.email ?? null },
    })
  }

  /** Forgets a deleted user's outside accounts. @internal */
  async forget(userId: ID): Promise<void> {
    if (!this.enabled) return
    for (const identity of await this.identities(userId))
      await this.cms.db.delete({ collection: USER_IDENTITIES, id: identity.id })
  }

  settings(origin?: string): AdminSso {
    const { providerSignUp } = this.config.auth
    return {
      providers: this.config.auth.providers.map((p) => ({
        id: p.id,
        name: p.name,
        icon: p.icon ?? 'key',
        callbackURL: this.callbackURL(p.id, origin),
        details: { ...(p.describe?.() ?? {}) },
      })),
      password: this.config.auth.password ? 'everyone' : 'admins',
      signUp:
        providerSignUp.domains.length > 0
          ? {
              domains: [...providerSignUp.domains],
              role: providerSignUp.role ?? this.defaultRole(),
            }
          : null,
      serverURL: !!this.config.serverURL,
    }
  }

  // -------------------------------------------------------------------------

  private provider(id: string): AuthProvider {
    const provider = this.config.auth.providers.find((p) => p.id === id)
    if (!provider) throw new NotFoundError('auth providers', id)
    return provider
  }

  /** Only pages of the admin: anything else (another site) goes to the admin's home. */
  private adminPage(redirect: string | null | undefined): string {
    const admin = this.config.admin.path.replace(/\/+$/, '')
    if (
      typeof redirect === 'string' &&
      (redirect === admin || redirect.startsWith(`${admin}/`)) &&
      !redirect.startsWith('//') &&
      !redirect.includes('\\')
    )
      return redirect
    return `${admin}/`
  }

  private async identity(provider: string, subject: string): Promise<RawDocument | undefined> {
    const { docs } = await this.cms.db.find({
      collection: USER_IDENTITIES,
      where: { and: [{ provider: { equals: provider } }, { subject: { equals: subject } }] },
      sort: [],
      limit: 1,
      page: 1,
    })
    return docs[0]
  }

  private async addIdentity(user: ID, provider: string, subject: string, email: string | null) {
    const now = new Date().toISOString()
    await this.cms.db.create({
      collection: USER_IDENTITIES,
      data: { user, provider, subject, email, lastUsedAt: now, createdAt: now, updatedAt: now },
    })
  }

  private async userByEmail(email: string): Promise<RawDocument | null> {
    const { docs } = await this.cms.db.find({
      collection: USERS,
      where: { email: { equals: email } },
      sort: [],
      limit: 1,
      page: 1,
    })
    return docs[0] ?? null
  }

  /** A new account for people from `providerSignUp.domains`. */
  private async signUp(email: string, name: string | undefined): Promise<RawDocument | null> {
    const { domains, role } = this.config.auth.providerSignUp
    const domain = email.slice(email.lastIndexOf('@') + 1)
    if (!domains.some((d) => d.toLowerCase() === domain)) return null
    const created = await this.cms.create(USERS, {
      email,
      role: role ?? this.defaultRole(),
      active: true,
      ...(name ? { name } : {}),
    })
    this.cms.logger.info(`${email} signed up with a provider`)
    return this.cms.db.findById({ collection: USERS, id: created.id as ID })
  }

  /** A site member (`auth.members`): matched by email, like any shop or site account. */
  private isMember(user: RawDocument): boolean {
    return (this.config.auth.members?.roles ?? []).includes(String(user.role))
  }

  private defaultRole(): string {
    const roles = this.config.auth.roles
    return roles.includes('editor') ? 'editor' : (roles[roles.length - 1] as string)
  }
}
