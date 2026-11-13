import { type AuthUser, type ID, isSystemAdmin } from '../access.js'
import { getSetting, setSetting } from '../admin-settings.js'
import { SESSIONS, USER_IDENTITIES, USERS } from '../builtins.js'
import type { RawDocument } from '../database.js'
import type { FieldError } from '../errors.js'
import { ForbiddenError, ValidationError } from '../errors.js'
import type { EasyCMS } from '../local-api.js'

// Who may sign in, set in the admin (#409, ADR-0068): who uses a password, and who gets an account
// the first time they sign in with a provider. The config's `auth.password` and
// `auth.providerSignUp` stay the default; `auth.locked` keeps them.

/** Who signs in with a password now. */
export interface PasswordPolicyNow {
  kind: 'everyone' | 'admins' | 'breakGlass'
  /** Break-glass accounts by email (the config's `auth.password: { breakGlass }`). */
  emails: string[]
  /** Break-glass accounts by id (chosen in the admin). */
  ids: string[]
}

/** People from these email domains get an account with `role` the first time they sign in. */
export interface SignUpRule {
  domains: string[]
  role: string
}

/** The rules that apply now, and where each comes from. */
export interface SignInRulesNow {
  password: PasswordPolicyNow
  passwordSource: 'code' | 'admin'
  signUp: SignUpRule | null
  signUpSource: 'code' | 'admin'
}

/** Who uses a password, as an admin sets it: break-glass accounts by user id. */
export type PasswordRule = 'everyone' | 'admins' | { breakGlass: ID[] }

/** A change from the admin; `'code'` goes back to the config's value. */
export interface SignInRulesChange {
  password?: PasswordRule | 'code'
  signUp?: SignUpRule | null | 'code'
}

/** What a change does to people: accounts that can no longer use a password, sessions ended. */
export interface SignInRulesImpact {
  passwordLost: number
  sessionsEnded: number
}

/** Stored as admin setting `sign-in-rules`: only what differs from the config. */
interface Stored {
  password?: 'everyone' | 'admins' | { breakGlass: string[] }
  signUp?: SignUpRule | null
}

const SETTING = 'sign-in-rules'
/** Each server reads the admin's rules again after this long. */
const CACHE_MS = 30_000

/**
 * Email domains anyone can get an address at: signing up "everyone from gmail.com" lets the whole
 * world in. Not every free provider, the usual mistakes.
 */
export const PUBLIC_EMAIL_DOMAINS: readonly string[] = [
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'gmx.net',
  'yandex.com',
  'yandex.ru',
  'mail.ru',
  'qq.com',
  '163.com',
  'zoho.com',
]

const DOMAIN = /^[a-z0-9.-]+\.[a-z]{2,}$/

/** Whether `user` may sign in with a password under `policy`. */
export function passwordAllowedBy(
  policy: PasswordPolicyNow,
  user: { readonly [key: string]: unknown },
): boolean {
  if (policy.kind === 'everyone') return true
  if (policy.kind === 'admins') return user.role === 'admin'
  return (
    (typeof user.email === 'string' && policy.emails.includes(user.email.toLowerCase())) ||
    (user.id !== undefined && user.id !== null && policy.ids.includes(String(user.id)))
  )
}

/** The policy as text, to see it change between starts and saves. */
export function policyName(policy: PasswordPolicyNow): string {
  if (policy.kind !== 'breakGlass') return policy.kind
  // The config's form stays as it was before #409, so an upgrade doesn't look like a change.
  const emails = [...policy.emails].sort().join(',')
  return policy.ids.length
    ? `breakGlass:${emails};ids:${[...policy.ids].sort().join(',')}`
    : `breakGlass:${emails}`
}

/** The sign-in rules of a site: the config's, or what an admin set instead. */
export class SignInRules {
  private cached: { at: number; now: SignInRulesNow } | null = null

  constructor(private readonly cms: EasyCMS) {}

  /** `auth.locked`: the config's rules, and the admin can't change them. */
  get locked(): boolean {
    return this.cms.config.auth.locked
  }

  /** The config's password policy. */
  codePassword(): PasswordPolicyNow {
    const policy = this.cms.config.auth.password
    if (policy === true) return { kind: 'everyone', emails: [], ids: [] }
    if (policy === false) return { kind: 'admins', emails: [], ids: [] }
    return { kind: 'breakGlass', emails: [...policy.breakGlass], ids: [] }
  }

  /** The config's sign-up rule. */
  codeSignUp(): SignUpRule | null {
    const { domains, role } = this.cms.config.auth.providerSignUp
    return domains.length > 0
      ? { domains: domains.map((d) => d.toLowerCase()), role: role ?? this.defaultRole() }
      : null
  }

  /** What admins changed; nothing with `auth.locked`. */
  private async stored(): Promise<Stored> {
    if (this.locked) return {}
    const saved = await getSetting<Stored | null>(this.cms, SETTING).catch(() => undefined)
    return saved && typeof saved === 'object' ? saved : {}
  }

  /** The rules that apply now. Read again every 30 seconds, so every server follows a change. */
  async current(fresh = false): Promise<SignInRulesNow> {
    const now = Date.now()
    if (!fresh && this.cached && now - this.cached.at < CACHE_MS) return this.cached.now
    const stored = await this.stored()
    const value: SignInRulesNow = {
      password:
        stored.password === undefined ? this.codePassword() : this.passwordOf(stored.password),
      passwordSource: stored.password === undefined ? 'code' : 'admin',
      signUp: stored.signUp === undefined ? this.codeSignUp() : stored.signUp,
      signUpSource: stored.signUp === undefined ? 'code' : 'admin',
    }
    this.cached = { at: now, now: value }
    return value
  }

  /** The break-glass accounts an admin chose, for Settings → Single sign-on. */
  async breakGlassAccounts(): Promise<{ id: ID; email: string; role: string }[]> {
    const { password } = await this.current()
    if (password.kind !== 'breakGlass') return []
    const or = [
      ...(password.emails.length ? [{ email: { in: password.emails } }] : []),
      ...(password.ids.length ? [{ id: { in: password.ids } }] : []),
    ]
    const { docs } = await this.cms.db.find({
      collection: USERS,
      where: { or },
      sort: ['email'],
      limit: 0,
      page: 1,
    })
    return docs.map((u) => ({ id: u.id, email: String(u.email ?? ''), role: String(u.role ?? '') }))
  }

  /** Accounts an admin may choose for break-glass: admins with a password, and those chosen. */
  async breakGlassCandidates(): Promise<{ id: ID; email: string; role: string }[]> {
    const { docs } = await this.cms.db.find({
      collection: USERS,
      where: { and: [{ role: { equals: 'admin' } }, { active: { not_equals: false } }] },
      sort: ['email'],
      limit: 0,
      page: 1,
    })
    const out = docs
      .filter((u) => !!u.passwordHash)
      .map((u) => ({ id: u.id, email: String(u.email ?? ''), role: String(u.role ?? '') }))
    for (const chosen of await this.breakGlassAccounts())
      if (!out.some((u) => String(u.id) === String(chosen.id))) out.push(chosen)
    return out
  }

  /**
   * Problems with the config's rules that the admin refuses to save, said at start and in
   * Settings → Single sign-on (errors from 2.0).
   */
  async warnings(): Promise<string[]> {
    const signUp = this.codeSignUp()
    if (!signUp) return []
    const out: string[] = []
    const open = signUp.domains.filter((d) => PUBLIC_EMAIL_DOMAINS.includes(d))
    if (open.length)
      out.push(
        `auth.providerSignUp.domains: anyone can get an address at ${open.join(', ')}, so anyone can sign up. Invite people instead.`,
      )
    if (await this.managesUsers(signUp.role))
      out.push(
        `auth.providerSignUp.role: "${signUp.role}" can change other accounts, too much for people who sign themselves up.`,
      )
    return out
  }

  /**
   * Changes the rules (system admins only). Refuses a change after which no admin, or the admin
   * making it, could sign in. With `dryRun`, only says what it would do. Ends the password sessions
   * of accounts that may no longer use one. Audit-logged.
   */
  async set(
    user: AuthUser,
    change: SignInRulesChange,
    options: { dryRun?: boolean } = {},
  ): Promise<SignInRulesImpact> {
    if (!isSystemAdmin(user) || user.apiKey) throw new ForbiddenError()
    if (this.locked)
      throw new ValidationError('sign-in', [
        { field: 'rules', message: 'are set in the code (auth.locked)' },
      ])
    const before = await this.stored()
    const next: Stored = { ...before }
    const errors: FieldError[] = []
    if (change.password !== undefined) {
      if (change.password === 'code') delete next.password
      else {
        const password = await this.checkPassword(change.password, errors)
        if (password) next.password = password
      }
    }
    if (change.signUp !== undefined) {
      if (change.signUp === 'code') delete next.signUp
      else {
        const signUp = await this.checkSignUp(change.signUp, errors)
        if (signUp !== undefined) next.signUp = signUp
      }
    }
    if (errors.length) throw new ValidationError('sign-in', errors)
    // The same as the config: not kept, so a later change in the code takes effect.
    if (next.password !== undefined && this.sameAsCode(next.password)) delete next.password
    if (next.signUp !== undefined && sameSignUp(next.signUp, this.codeSignUp())) delete next.signUp

    const was = (await this.current(true)).password
    const will = next.password === undefined ? this.codePassword() : this.passwordOf(next.password)
    if (policyName(was) !== policyName(will)) await this.guard(user, was, will)
    const impact = await this.impact(was, will)
    if (options.dryRun) return impact

    await setSetting(this.cms, SETTING, Object.keys(next).length ? next : null)
    this.cached = null
    await this.cms.audit.record({
      action: 'sign-in.rules',
      target: 'auth',
      user,
      detail: {
        ...(change.password !== undefined
          ? { password: { from: policyName(was), to: policyName(will) } }
          : {}),
        ...(change.signUp !== undefined
          ? {
              signUp: {
                from: before.signUp === undefined ? this.codeSignUp() : before.signUp,
                to: next.signUp === undefined ? this.codeSignUp() : next.signUp,
              },
            }
          : {}),
      },
    })
    const sessionsEnded = await this.cms.auth.applyPasswordPolicy(user)
    return { ...impact, sessionsEnded }
  }

  /** Back to the config's rules (`easy-cms reset-sign-in`). Audit-logged. @internal */
  async reset(user: AuthUser | null): Promise<{ was: Stored; sessionsEnded: number }> {
    const was = await this.stored()
    if (Object.keys(was).length === 0) return { was, sessionsEnded: 0 }
    await setSetting(this.cms, SETTING, null)
    this.cached = null
    await this.cms.audit.record({
      action: 'sign-in.rules',
      target: 'auth',
      user,
      detail: { reset: true, was },
    })
    return { was, sessionsEnded: await this.cms.auth.applyPasswordPolicy(user) }
  }

  /**
   * Refuses to delete, deactivate or demote the last admin on the break-glass list an admin
   * chose, or to take their password: nobody could get in when the provider is down.
   * @internal
   */
  async guardUser(id: ID, before: RawDocument, after: RawDocument | null): Promise<void> {
    const stored = (await this.stored()).password
    if (typeof stored !== 'object') return
    const ids = stored.breakGlass
    const counts = (u: RawDocument | null) =>
      !!u && u.role === 'admin' && u.active !== false && !!u.passwordHash
    if (!ids.includes(String(id)) || !counts(before) || counts(after)) return
    const others = await this.cms.db.find({
      collection: USERS,
      where: {
        and: [
          { id: { in: ids.filter((other) => other !== String(id)) } },
          { role: { equals: 'admin' } },
          { active: { not_equals: false } },
        ],
      },
      sort: [],
      limit: 0,
      page: 1,
    })
    if (others.docs.some((u) => !!u.passwordHash)) return
    throw new ValidationError(USERS, [
      {
        field: 'role',
        message:
          'is the last admin who can sign in with a password when the provider is down: add another break-glass account first',
      },
    ])
  }

  // -------------------------------------------------------------------------

  private passwordOf(stored: NonNullable<Stored['password']>): PasswordPolicyNow {
    if (stored === 'everyone' || stored === 'admins') return { kind: stored, emails: [], ids: [] }
    return { kind: 'breakGlass', emails: [], ids: stored.breakGlass.map(String) }
  }

  private sameAsCode(stored: NonNullable<Stored['password']>): boolean {
    const code = this.codePassword()
    return typeof stored === 'string' && code.kind === stored
  }

  private async checkPassword(
    rule: PasswordRule,
    errors: FieldError[],
  ): Promise<Stored['password'] | undefined> {
    if (rule === 'everyone' || rule === 'admins') return rule
    if (
      typeof rule !== 'object' ||
      rule === null ||
      !Array.isArray(rule.breakGlass) ||
      rule.breakGlass.length === 0
    ) {
      errors.push({
        field: 'password',
        message: 'must be "everyone", "admins" or { breakGlass: [user ids] }',
      })
      return undefined
    }
    const ids = [...new Set(rule.breakGlass.map(String))]
    const { docs } = await this.cms.db.find({
      collection: USERS,
      where: { id: { in: ids } },
      sort: [],
      limit: 0,
      page: 1,
    })
    const byId = new Map(docs.map((u) => [String(u.id), u]))
    for (const id of ids) {
      const u = byId.get(id)
      if (!u) errors.push({ field: 'breakGlass', message: `no account ${id}` })
      else if (u.active === false)
        errors.push({ field: 'breakGlass', message: `${u.email} is deactivated` })
      else if (!u.passwordHash)
        errors.push({ field: 'breakGlass', message: `${u.email} has no password` })
    }
    if (errors.length === 0 && !docs.some((u) => u.role === 'admin'))
      errors.push({ field: 'breakGlass', message: 'needs at least one admin' })
    return errors.length ? undefined : { breakGlass: ids }
  }

  private async checkSignUp(
    rule: SignUpRule | null,
    errors: FieldError[],
  ): Promise<SignUpRule | null | undefined> {
    if (rule === null) return null
    if (typeof rule !== 'object' || !Array.isArray(rule.domains) || typeof rule.role !== 'string') {
      errors.push({ field: 'signUp', message: 'must be { domains, role } or null' })
      return undefined
    }
    const domains = [
      ...new Set(
        rule.domains.map((d) =>
          String(d ?? '')
            .trim()
            .toLowerCase()
            .replace(/^@/, ''),
        ),
      ),
    ].filter(Boolean)
    if (domains.length === 0) return null
    const bad = domains.filter((d) => !DOMAIN.test(d))
    if (bad.length)
      errors.push({ field: 'domains', message: `${bad.join(', ')}: not an email domain` })
    const open = domains.filter((d) => PUBLIC_EMAIL_DOMAINS.includes(d))
    if (open.length)
      errors.push({
        field: 'domains',
        message: `anyone can get an address at ${open.join(', ')}: invite people instead`,
      })
    if (rule.role === 'admin')
      errors.push({ field: 'role', message: 'can\'t be "admin": make admins in Settings → Users' })
    else if (!(await this.cms.roles.exists(rule.role)))
      errors.push({ field: 'role', message: `no role "${rule.role}"` })
    else if (await this.managesUsers(rule.role))
      errors.push({
        field: 'role',
        message: `"${rule.role}" can change other accounts: choose a role that can't`,
      })
    return errors.length ? undefined : { domains, role: rule.role }
  }

  /** Roles people who sign themselves up may get. */
  async signUpRoles(): Promise<{ key: string; name: string }[]> {
    const out: { key: string; name: string }[] = []
    for (const role of await this.cms.roles.options())
      if (!(await this.managesUsers(role.key))) out.push(role)
    return out
  }

  /** Whether a role may create, change or delete other accounts. */
  private async managesUsers(role: string): Promise<boolean> {
    if (role === 'admin') return true
    // Without RBAC, other roles change only their own account.
    if (!this.cms.roles.enabled) return false
    const user = { id: '', role, email: '' } as unknown as AuthUser
    for (const operation of ['create', 'update', 'delete'] as const)
      if ((await this.cms.roles.allows(user, { collection: USERS }, operation)) === true)
        return true
    return false
  }

  /** Refuses a password policy after which no admin, or `user`, could sign in. */
  private async guard(
    user: AuthUser,
    was: PasswordPolicyNow,
    will: PasswordPolicyNow,
  ): Promise<void> {
    const providers = new Set((await this.cms.signIn.providers()).map((p) => p.id))
    if (
      (await this.adminsCanSignIn(was, providers)) &&
      !(await this.adminsCanSignIn(will, providers))
    )
      throw new ValidationError('sign-in', [
        {
          field: 'password',
          message:
            'No admin could sign in after this: an admin needs a password or an account linked to a provider that is on',
        },
      ])
    const me = await this.cms.db.findById({ collection: USERS, id: user.id })
    if (me && !(await this.canSignIn(me, will, providers)))
      throw new ValidationError('sign-in', [
        {
          field: 'password',
          message:
            "You couldn't sign in after this: link a provider on your account page first, or keep yourself on the break-glass list",
        },
      ])
  }

  private async canSignIn(
    user: RawDocument,
    policy: PasswordPolicyNow,
    providers: Set<string>,
  ): Promise<boolean> {
    if (user.active === false) return false
    if (user.passwordHash && passwordAllowedBy(policy, user)) return true
    if (providers.size === 0) return false
    const { totalDocs } = await this.cms.db.find({
      collection: USER_IDENTITIES,
      where: { and: [{ provider: { in: [...providers] } }, { user: { equals: user.id } }] },
      sort: [],
      limit: 1,
      page: 1,
    })
    return totalDocs > 0
  }

  private async adminsCanSignIn(
    policy: PasswordPolicyNow,
    providers: Set<string>,
  ): Promise<boolean> {
    const { docs } = await this.cms.db.find({
      collection: USERS,
      where: { and: [{ role: { equals: 'admin' } }, { active: { not_equals: false } }] },
      sort: [],
      limit: 0,
      page: 1,
    })
    for (const admin of docs) if (await this.canSignIn(admin, policy, providers)) return true
    return false
  }

  /** Accounts that lose their password, and password sessions that end. */
  private async impact(
    was: PasswordPolicyNow,
    will: PasswordPolicyNow,
  ): Promise<SignInRulesImpact> {
    if (policyName(was) === policyName(will)) return { passwordLost: 0, sessionsEnded: 0 }
    const { docs: users } = await this.cms.db.find({
      collection: USERS,
      where: { active: { not_equals: false } },
      sort: [],
      limit: 0,
      page: 1,
    })
    const losing = users.filter(
      (u) => !!u.passwordHash && passwordAllowedBy(was, u) && !passwordAllowedBy(will, u),
    )
    const lost = new Set(users.filter((u) => !passwordAllowedBy(will, u)).map((u) => String(u.id)))
    const { docs: sessions } = await this.cms.db.find({
      collection: SESSIONS,
      sort: [],
      limit: 0,
      page: 1,
    })
    return {
      passwordLost: losing.length,
      sessionsEnded: sessions.filter((s) => byPassword(s) && lost.has(String(s.user))).length,
    }
  }

  private defaultRole(): string {
    const roles = this.cms.config.auth.roles
    return roles.includes('editor') ? 'editor' : (roles[roles.length - 1] as string)
  }
}

/** A session started with a password (or before sessions recorded how they started). */
export function byPassword(session: RawDocument): boolean {
  return session.method === 'password' || session.method === null || session.method === undefined
}

function sameSignUp(a: SignUpRule | null, b: SignUpRule | null): boolean {
  if (!a || !b) return a === b
  return a.role === b.role && [...a.domains].sort().join() === [...b.domains].sort().join()
}
