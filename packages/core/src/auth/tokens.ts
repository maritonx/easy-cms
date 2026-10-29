import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/** A new random session token (sent to the client, never stored). */
export function newToken(): string {
  return randomBytes(32).toString('base64url')
}

/** What the database stores instead of the token. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function hmac(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url')
}

/**
 * Secrets that verify: the current one first, then `previousSecrets` while one is replaced. New
 * values are always signed with the current one.
 */
export type Secrets = string | readonly string[]

/** The secrets of a config, the current one first. */
export function secretsOf(config: {
  readonly secret: string
  readonly previousSecrets?: readonly string[] | undefined
}): readonly string[] {
  return [config.secret, ...(config.previousSecrets ?? [])]
}

/** Whether `signature` is the HMAC of `value` with one of the secrets. */
export function signedWith(secrets: Secrets, value: string, signature: string): boolean {
  return [secrets].flat().some((secret) => safeEqual(signature, hmac(secret, value)))
}

/** Cookie value: `<token>.<signature>`, so forged cookies are rejected without a database lookup. */
export function signToken(secret: string, token: string): string {
  return `${token}.${hmac(secret, `session:${token}`)}`
}

/** Returns the token if the signature is valid. */
export function unsignToken(secrets: Secrets, value: string): string | undefined {
  const dot = value.lastIndexOf('.')
  if (dot <= 0) return undefined
  const token = value.slice(0, dot)
  return signedWith(secrets, `session:${token}`, value.slice(dot + 1)) ? token : undefined
}

/** CSRF token bound to the session: the client echoes it in a header. */
export function csrfToken(secret: string, token: string): string {
  return hmac(secret, `csrf:${token}`)
}

/** Whether `given` is the session's CSRF token with one of the secrets. */
export function csrfMatches(secrets: Secrets, token: string, given: string): boolean {
  return signedWith(secrets, `csrf:${token}`, given)
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

/** What a preview token opens: one document of a collection, or one global. */
export type PreviewTarget =
  | { readonly collection: string; readonly id: string }
  | { readonly global: string }

/**
 * Short-lived token that lets a page read one unpublished document (live preview on another
 * origin): `<payload>.<signature>`, the payload being base64url JSON with an expiry.
 */
export function signPreviewToken(
  secret: string,
  target: PreviewTarget,
  expiresAt: number,
  /** Who made it: the token reads with their access. */
  user?: string,
): string {
  const payload = Buffer.from(
    JSON.stringify({
      ...('global' in target ? { g: target.global } : { c: target.collection, i: target.id }),
      e: expiresAt,
      ...(user !== undefined ? { u: user } : {}),
    }),
  ).toString('base64url')
  return `${payload}.${hmac(secret, `preview:${payload}`)}`
}

/** The target of a valid, unexpired preview token, or `null`. */
export function verifyPreviewToken(
  secrets: Secrets,
  token: string,
  now = Date.now(),
): (PreviewTarget & { expiresAt: number; user?: string }) | null {
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const payload = token.slice(0, dot)
  if (!signedWith(secrets, `preview:${payload}`, token.slice(dot + 1))) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (typeof data.e !== 'number' || data.e <= now) return null
    const user = typeof data.u === 'string' ? { user: data.u } : {}
    if (typeof data.g === 'string') return { global: data.g, expiresAt: data.e, ...user }
    if (typeof data.c === 'string' && typeof data.i === 'string')
      return { collection: data.c, id: data.i, expiresAt: data.e, ...user }
    return null
  } catch {
    return null
  }
}

/**
 * Why a link was sent: a forgotten password, an invitation to a new account, or (`verify`) to
 * confirm the email of an account made by signing up.
 */
export type PasswordPurpose = 'reset' | 'invite' | 'verify'

/**
 * What ties a password link to the password it replaces: a link stops working once the password
 * changes, so each link works once without being stored.
 */
export function passwordFingerprint(passwordHash: unknown): string {
  return createHash('sha256')
    .update(typeof passwordHash === 'string' ? passwordHash : 'no-password')
    .digest('base64url')
    .slice(0, 22)
}

/** A link token to set a user's password: `<payload>.<signature>`, the payload base64url JSON. */
export function signPasswordToken(
  secret: string,
  args: { userId: string; purpose: PasswordPurpose; expiresAt: number; fingerprint: string },
): string {
  const payload = Buffer.from(
    JSON.stringify({ u: args.userId, p: args.purpose, e: args.expiresAt }),
  ).toString('base64url')
  return `${payload}.${hmac(secret, `password:${payload}:${args.fingerprint}`)}`
}

/** The token's claims, before the signature is checked against the user's current password. */
export function readPasswordToken(
  token: string,
): { userId: string; purpose: PasswordPurpose; expiresAt: number; payload: string } | null {
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const payload = token.slice(0, dot)
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (typeof data.u !== 'string' || typeof data.e !== 'number') return null
    if (data.p !== 'reset' && data.p !== 'invite' && data.p !== 'verify') return null
    return { userId: data.u, purpose: data.p, expiresAt: data.e, payload }
  } catch {
    return null
  }
}

/** Whether the token's signature matches the user's current password (and the secret). */
export function passwordTokenMatches(
  secrets: Secrets,
  token: string,
  fingerprint: string,
): boolean {
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return false
  const payload = token.slice(0, dot)
  return signedWith(secrets, `password:${payload}:${fingerprint}`, token.slice(dot + 1))
}
