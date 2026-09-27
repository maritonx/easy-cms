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

/** Cookie value: `<token>.<signature>`, so forged cookies are rejected without a database lookup. */
export function signToken(secret: string, token: string): string {
  return `${token}.${hmac(secret, `session:${token}`)}`
}

/** Returns the token if the signature is valid. */
export function unsignToken(secret: string, value: string): string | undefined {
  const dot = value.lastIndexOf('.')
  if (dot <= 0) return undefined
  const token = value.slice(0, dot)
  return safeEqual(value.slice(dot + 1), hmac(secret, `session:${token}`)) ? token : undefined
}

/** CSRF token bound to the session: the client echoes it in a header. */
export function csrfToken(secret: string, token: string): string {
  return hmac(secret, `csrf:${token}`)
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
export function signPreviewToken(secret: string, target: PreviewTarget, expiresAt: number): string {
  const payload = Buffer.from(
    JSON.stringify(
      'global' in target
        ? { g: target.global, e: expiresAt }
        : { c: target.collection, i: target.id, e: expiresAt },
    ),
  ).toString('base64url')
  return `${payload}.${hmac(secret, `preview:${payload}`)}`
}

/** The target of a valid, unexpired preview token, or `null`. */
export function verifyPreviewToken(
  secret: string,
  token: string,
  now = Date.now(),
): (PreviewTarget & { expiresAt: number }) | null {
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const payload = token.slice(0, dot)
  if (!safeEqual(token.slice(dot + 1), hmac(secret, `preview:${payload}`))) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (typeof data.e !== 'number' || data.e <= now) return null
    if (typeof data.g === 'string') return { global: data.g, expiresAt: data.e }
    if (typeof data.c === 'string' && typeof data.i === 'string')
      return { collection: data.c, id: data.i, expiresAt: data.e }
    return null
  } catch {
    return null
  }
}
