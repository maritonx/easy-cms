import type { AuthUser, ID } from '../access.js'
import { stripFields } from '../access-control.js'
import {
  API_KEYS,
  type ApiKeyContext,
  type ApiKeyPermissions,
  isApiKey,
  parseApiKey,
  secretMatches,
} from '../api-keys.js'
import { LOGIN_ATTEMPTS, SESSIONS, USERS } from '../builtins.js'
import type { RawDocument } from '../database.js'
import {
  ForbiddenError,
  NotFoundError,
  QueryError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
} from '../errors.js'
import type { EasyCMS } from '../local-api.js'
import { DEFAULT_PASSWORD_EMAILS } from './emails.js'
import { fakeVerify, verifyPassword } from './password.js'
import {
  csrfToken,
  hashToken,
  newToken,
  type PasswordPurpose,
  passwordFingerprint,
  passwordTokenMatches,
  readPasswordToken,
  signPasswordToken,
  signToken,
  unsignToken,
} from './tokens.js'

export interface LoginArgs {
  readonly email: string
  readonly password: string
  /** Client IP, used together with the email for rate limiting. */
  readonly ip?: string | undefined
}

export interface Session {
  readonly user: AuthUser
  /** Signed session token, the value of the session cookie. */
  readonly token: string
  /** Send back in the `X-CSRF-Token` header on cookie-authenticated writes. */
  readonly csrfToken: string
  readonly expiresAt: string
}

const INVALID = 'Invalid email or password'
/** "Forgot password" requests per email (and IP) within `lockWindow`; more are ignored quietly. */
const RESET_REQUESTS = 3

/** Where a password link is opened from, and the language of its email. */
export interface PasswordLinkOptions {
  /** The request's origin: used for the link only in development, when `serverURL` is not set. */
  readonly origin?: string | undefined
  /** `en` or `th`. Default: `admin.locale`. */
  readonly locale?: string | undefined
}

/** Login, logout and session verification. Available as `cms.auth`. */
export class Auth {
  constructor(private readonly cms: EasyCMS) {}

  private get db() {
    return this.cms.db
  }

  private get config() {
    return this.cms.config
  }

  /** Checks credentials and starts a session. Throws `UnauthorizedError` or `TooManyRequestsError`. */
  async login(args: LoginArgs): Promise<Session> {
    const email = typeof args.email === 'string' ? args.email.trim().toLowerCase() : ''
    const password = typeof args.password === 'string' ? args.password : ''
    const key = `${email}|${args.ip ?? ''}`
    await this.checkRateLimit(key)

    const [user] = email
      ? (
          await this.db.find({
            collection: USERS,
            where: { email: { equals: email } },
            sort: [],
            limit: 1,
            page: 1,
          })
        ).docs
      : []
    const hash = typeof user?.passwordHash === 'string' ? user.passwordHash : undefined
    const valid =
      user && hash && password ? await verifyPassword(password, hash) : await fakeVerify(password)

    if (!user || !valid || user.active === false) {
      await this.recordFailure(key)
      throw new UnauthorizedError(INVALID)
    }
    await this.clearFailures(key)
    await this.deleteExpiredSessions(user.id)
    return this.startSession(user)
  }

  /** Creates the first admin. Only works while there are no users. */
  async registerFirstUser(args: {
    email: string
    password: string
    name?: string
  }): Promise<Session> {
    if (await this.hasUsers()) throw new ForbiddenError('An admin already exists')
    const user = await this.cms.create(USERS, {
      email: args.email,
      password: args.password,
      role: 'admin',
      active: true,
      ...(args.name ? { name: args.name } : {}),
    })
    const raw = (await this.db.findById({ collection: USERS, id: user.id })) as RawDocument
    return this.startSession(raw)
  }

  async hasUsers(): Promise<boolean> {
    return (await this.db.count({ collection: USERS })) > 0
  }

  /** Ends the session for a signed token. Unknown tokens are ignored. */
  async logout(signedToken: string): Promise<void> {
    const token = unsignToken(this.config.secret, signedToken)
    if (!token) return
    const session = await this.findSession(token)
    if (session) await this.db.delete({ collection: SESSIONS, id: session.id })
  }

  /**
   * Returns the user for a signed session token, or for an API key (`ecms_…`, with `apiKey` set
   * on the user), or `null` if it is invalid or expired.
   */
  async verify(signedToken: string | undefined | null): Promise<AuthUser | null> {
    if (!signedToken) return null
    if (isApiKey(signedToken)) return this.verifyApiKey(signedToken)
    const token = unsignToken(this.config.secret, signedToken)
    if (!token) return null
    const session = await this.findSession(token)
    if (!session) return null
    if (String(session.expiresAt) <= new Date().toISOString()) {
      await this.db.delete({ collection: SESSIONS, id: session.id })
      return null
    }
    const user = await this.db.findById({ collection: USERS, id: session.user as ID })
    if (!user || user.active === false) return null
    return this.toAuthUser(user)
  }

  /** The CSRF token clients must echo for a signed session token. */
  csrfFor(signedToken: string): string | undefined {
    const token = unsignToken(this.config.secret, signedToken)
    return token ? csrfToken(this.config.secret, token) : undefined
  }

  /** Starts a new session for a user, e.g. after they changed their own password. */
  async createSession(userId: ID): Promise<Session> {
    const user = await this.db.findById({ collection: USERS, id: userId })
    if (!user || user.active === false) throw new UnauthorizedError()
    return this.startSession(user)
  }

  /** Signs a user out everywhere. */
  async revokeSessions(userId: ID): Promise<void> {
    const sessions = await this.db.find({
      collection: SESSIONS,
      where: { user: { equals: userId } },
      sort: [],
      limit: 0,
      page: 1,
    })
    for (const session of sessions.docs)
      await this.db.delete({ collection: SESSIONS, id: session.id })
  }

  // --- Password links: forgotten passwords and invitations ------------------------------------

  /**
   * The origin password links point to: `serverURL`, or the request's origin in development. In
   * production the request's Host can't be trusted (a forged one would send the link elsewhere).
   */
  passwordLinkBase(origin?: string): string | null {
    const configured = this.config.serverURL
    if (configured) return configured.replace(/\/+$/, '')
    if (process.env.NODE_ENV !== 'production' && origin) return origin
    return null
  }

  /** Whether "forgot password" and invitations work: `email` is set and links have an origin. */
  canSendPasswordLinks(origin?: string): boolean {
    return this.config.email !== undefined && this.passwordLinkBase(origin) !== null
  }

  /**
   * Emails a link to set a new password, if an active account has this email. Always resolves the
   * same way, so callers can't tell whether the email has an account; extra requests within
   * `lockWindow` are ignored.
   */
  async requestPasswordReset(
    args: PasswordLinkOptions & { email: string; ip?: string | undefined },
  ) {
    const email = typeof args.email === 'string' ? args.email.trim().toLowerCase() : ''
    if (!email || !this.canSendPasswordLinks(args.origin)) return
    const key = `reset:${email}|${args.ip ?? ''}`
    const recent = await this.db.count({
      collection: LOGIN_ATTEMPTS,
      where: { key: { equals: key }, createdAt: { gt: this.windowStart() } },
    })
    if (recent >= RESET_REQUESTS) return
    await this.recordFailure(key)
    const user = await this.findByEmail(email)
    if (!user || user.active === false) return
    await this.mailPasswordLink(user, user.passwordHash ? 'reset' : 'invite', args)
  }

  /**
   * Emails a user a link to set their password: an invitation if they have none yet, else a
   * reset link. For admins (the REST API checks the role). Returns which one was sent.
   */
  async sendPasswordLink(userId: ID, options: PasswordLinkOptions = {}): Promise<PasswordPurpose> {
    if (!this.canSendPasswordLinks(options.origin))
      throw new QueryError(
        'Password links need `email` in the config, and `serverURL` in production',
      )
    const user = await this.db.findById({ collection: USERS, id: userId })
    if (!user) throw new NotFoundError(USERS, userId)
    if (user.active === false) throw new QueryError('This user is deactivated')
    const purpose = user.passwordHash ? 'reset' : 'invite'
    await this.mailPasswordLink(user, purpose, options)
    return purpose
  }

  /** The user and purpose of a valid, unused password link, or `null`. */
  async checkPasswordToken(
    token: string,
  ): Promise<{ user: AuthUser; purpose: PasswordPurpose } | null> {
    const found = await this.passwordTokenUser(token)
    return found ? { user: await this.toAuthUser(found.user), purpose: found.purpose } : null
  }

  /**
   * Sets the password from a link, ends every session of the account and starts one here.
   * Throws `ValidationError` when the link expired or was used, or the password is too short.
   */
  async resetPassword(args: {
    token: string
    password: string
    ip?: string | undefined
    locale?: string | undefined
  }): Promise<Session & { purpose: PasswordPurpose }> {
    const key = `reset-token|${args.ip ?? ''}`
    await this.checkRateLimit(key)
    const found = await this.passwordTokenUser(String(args.token ?? ''))
    if (!found) {
      await this.recordFailure(key)
      throw new ValidationError(USERS, [
        { field: 'token', message: 'This link has expired or was already used' },
      ])
    }
    // The Local API hashes the password and signs the account out everywhere.
    await this.cms.update(USERS, found.user.id as ID, { password: args.password })
    await this.clearFailures(key)
    const user = (await this.db.findById({ collection: USERS, id: found.user.id })) as RawDocument
    // Sign this browser in, then send the notice.
    const session = await this.startSession(user)
    if (found.purpose === 'reset') {
      const content = await (
        this.config.auth.emails.passwordChanged ?? DEFAULT_PASSWORD_EMAILS.passwordChanged
      )({
        user: await this.toAuthUser(user),
        locale: this.localeOf(args.locale),
      })
      await this.cms.sendEmail({ to: String(user.email), ...content })
    }
    return { ...session, purpose: found.purpose }
  }

  private async passwordTokenUser(
    token: string,
  ): Promise<{ user: RawDocument; purpose: PasswordPurpose } | null> {
    const claims = readPasswordToken(token)
    if (!claims || claims.expiresAt <= Date.now()) return null
    const id = /^\d+$/.test(claims.userId) ? Number(claims.userId) : claims.userId
    const user = await this.db.findById({ collection: USERS, id })
    if (!user || user.active === false) return null
    // The link is bound to the password it replaces: once that changes, the link is spent.
    const fingerprint = passwordFingerprint(user.passwordHash)
    if (!passwordTokenMatches(this.config.secret, token, fingerprint)) return null
    return { user, purpose: claims.purpose }
  }

  private async mailPasswordLink(
    user: RawDocument,
    purpose: PasswordPurpose,
    options: PasswordLinkOptions,
  ) {
    const base = this.passwordLinkBase(options.origin) as string
    const seconds =
      purpose === 'invite'
        ? this.config.auth.inviteExpiration
        : this.config.auth.resetPasswordExpiration
    const expiresAt = Date.now() + seconds * 1000
    const token = signPasswordToken(this.config.secret, {
      userId: String(user.id),
      purpose,
      expiresAt,
      fingerprint: passwordFingerprint(user.passwordHash),
    })
    const url = `${base}${this.config.admin.path}/reset-password?token=${encodeURIComponent(token)}`
    const write =
      purpose === 'invite'
        ? (this.config.auth.emails.invite ?? DEFAULT_PASSWORD_EMAILS.invite)
        : (this.config.auth.emails.resetPassword ?? DEFAULT_PASSWORD_EMAILS.resetPassword)
    const content = await write({
      user: await this.toAuthUser(user),
      url,
      locale: this.localeOf(options.locale),
      expiresAt: new Date(expiresAt),
    })
    await this.cms.sendEmail({ to: String(user.email), ...content })
  }

  private localeOf(locale: string | undefined): string {
    return locale === 'th' || locale === 'en' ? locale : this.config.admin.locale
  }

  private async findByEmail(email: string): Promise<RawDocument | undefined> {
    const { docs } = await this.db.find({
      collection: USERS,
      where: { email: { equals: email } },
      sort: [],
      limit: 1,
      page: 1,
    })
    return docs[0]
  }

  /** The owner of an API key, limited by the key; `null` when unknown, expired or disabled. */
  private async verifyApiKey(token: string): Promise<AuthUser | null> {
    if (!this.cms.config.collections.some((c) => c.slug === API_KEYS)) return null
    const parsed = parseApiKey(token)
    if (!parsed) return null
    const { docs } = await this.db.find({
      collection: API_KEYS,
      where: { prefix: { equals: parsed.prefix } },
      sort: [],
      limit: 1,
      page: 1,
    })
    const key = docs[0]
    if (!key || !secretMatches(parsed.secret, key.keyHash)) return null
    const now = new Date()
    if (typeof key.expiresAt === 'string' && key.expiresAt <= now.toISOString()) return null
    const owner = await this.db.findById({ collection: USERS, id: key.user as ID })
    if (!owner || owner.active === false) return null
    // At most one write a minute per key, so busy keys don't write on every request.
    const last = typeof key.lastUsedAt === 'string' ? Date.parse(key.lastUsedAt) : 0
    if (now.getTime() - last > 60_000) {
      const { id: _id, ...rest } = key
      await this.db.update({
        collection: API_KEYS,
        id: key.id,
        data: { ...rest, lastUsedAt: now.toISOString() },
      })
    }
    const apiKey: ApiKeyContext = {
      id: key.id,
      name: String(key.name ?? ''),
      permissions: (key.permissions ?? {}) as ApiKeyPermissions,
    }
    return { ...(await this.toAuthUser(owner)), apiKey }
  }

  // -------------------------------------------------------------------------

  private async startSession(user: RawDocument): Promise<Session> {
    const token = newToken()
    const now = new Date()
    const expiresAt = new Date(
      now.getTime() + this.config.auth.tokenExpiration * 1000,
    ).toISOString()
    await this.db.create({
      collection: SESSIONS,
      data: {
        tokenHash: hashToken(token),
        user: user.id,
        expiresAt,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    })
    return {
      user: await this.toAuthUser(user),
      token: signToken(this.config.secret, token),
      csrfToken: csrfToken(this.config.secret, token),
      expiresAt,
    }
  }

  private async findSession(token: string) {
    const result = await this.db.find({
      collection: SESSIONS,
      where: { tokenHash: { equals: hashToken(token) } },
      sort: [],
      limit: 1,
      page: 1,
    })
    return result.docs[0]
  }

  private async toAuthUser(user: RawDocument): Promise<AuthUser> {
    const fields = this.cms.collection(USERS).fields
    return (await stripFields(fields, user)) as unknown as AuthUser
  }

  private async deleteExpiredSessions(userId: ID) {
    const expired = await this.db.find({
      collection: SESSIONS,
      where: { user: { equals: userId }, expiresAt: { lte: new Date().toISOString() } },
      sort: [],
      limit: 0,
      page: 1,
    })
    for (const session of expired.docs)
      await this.db.delete({ collection: SESSIONS, id: session.id })
  }

  private windowStart() {
    return new Date(Date.now() - this.config.auth.lockWindow * 1000).toISOString()
  }

  private async checkRateLimit(key: string) {
    const recent = await this.db.count({
      collection: LOGIN_ATTEMPTS,
      where: { key: { equals: key }, createdAt: { gt: this.windowStart() } },
    })
    if (recent >= this.config.auth.maxLoginAttempts) {
      throw new TooManyRequestsError('Too many failed login attempts. Try again later.')
    }
  }

  private async recordFailure(key: string) {
    const now = new Date().toISOString()
    await this.db.create({
      collection: LOGIN_ATTEMPTS,
      data: { key, createdAt: now, updatedAt: now },
    })
    // Old attempts for this key no longer count; remove them.
    const old = await this.db.find({
      collection: LOGIN_ATTEMPTS,
      where: { key: { equals: key }, createdAt: { lte: this.windowStart() } },
      sort: [],
      limit: 0,
      page: 1,
    })
    for (const attempt of old.docs)
      await this.db.delete({ collection: LOGIN_ATTEMPTS, id: attempt.id })
  }

  private async clearFailures(key: string) {
    const attempts = await this.db.find({
      collection: LOGIN_ATTEMPTS,
      where: { key: { equals: key } },
      sort: [],
      limit: 0,
      page: 1,
    })
    for (const attempt of attempts.docs)
      await this.db.delete({ collection: LOGIN_ATTEMPTS, id: attempt.id })
  }
}
