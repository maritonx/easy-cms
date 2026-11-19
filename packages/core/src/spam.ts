import { hmac, safeEqual } from './runtime/crypto.js'

/**
 * Spam protection for public forms (the form builder's, sign-up): a signed token that proves
 * the form was loaded a while ago, a hidden field bots fill in, IP rate-limit keys that keep no
 * IP, and Cloudflare Turnstile.
 */

/** Tokens older than this are refused: the page was left open for a day. */
const MAX_AGE = 24 * 3_600_000

const sign = (secret: string, value: string) => hmac(secret, value, 'base64url')

/** A token that proves the form `purpose` names was loaded at `now`: `<time>.<signature>`. */
export function formToken(secret: string, purpose: string, now = Date.now()): string {
  return `${now}.${sign(secret, `${purpose}:${now}`)}`
}

/**
 * Checks a token: `ok` when the form was loaded at least `minTime` ms ago (people take a few
 * seconds; bots don't) and less than a day ago.
 */
export function checkFormToken(
  secrets: string | readonly string[],
  purpose: string,
  token: unknown,
  minTime: number,
  now = Date.now(),
): 'ok' | 'invalid' | 'too-fast' | 'expired' {
  if (typeof token !== 'string') return 'invalid'
  const [time, signature] = token.split('.')
  const issued = Number(time)
  if (!Number.isFinite(issued) || !signature) return 'invalid'
  const genuine = [secrets]
    .flat()
    .some((secret) => safeEqual(sign(secret, `${purpose}:${issued}`), signature))
  if (!genuine) return 'invalid'
  if (now - issued < minTime) return 'too-fast'
  if (now - issued > MAX_AGE) return 'expired'
  return 'ok'
}

/**
 * Rate-limit keys for `subject` (e.g. an IP and a form) in the current and previous window of
 * `window` seconds. A hash with the window in it: no IP is kept, and keys from different
 * windows can't be linked.
 */
export function rateKeys(secret: string, subject: string, window: number, now = Date.now()) {
  const bucket = Math.floor(now / (window * 1000))
  const key = (b: number) => sign(secret, `${subject}:${b}`).slice(0, 32)
  return { current: key(bucket), previous: key(bucket - 1) }
}

/** The hidden field bots fill in: a common name the form doesn't use. */
export function honeypotName(names: readonly string[]): string {
  return ['website', 'homepage', 'url_address'].find((n) => !names.includes(n)) ?? 'hp_field'
}

/**
 * Why Turnstile keys can't work, if they can't: Cloudflare refuses every check, so each form or
 * sign-up fails with "verification failed" and nothing says why.
 */
export function turnstileKeyProblem(keys: {
  readonly siteKey: string
  readonly secretKey: string
}): string | undefined {
  if (keys.secretKey !== keys.secretKey.trim()) return 'secretKey has spaces around it'
  if (keys.secretKey === keys.siteKey)
    return 'secretKey is the site key: copy the Secret Key from the Turnstile widget in the Cloudflare dashboard'
  return undefined
}

/** Problems already logged: one line each, not one per visitor. */
const warned = new Set<string>()

/**
 * Checks a Cloudflare Turnstile response with Cloudflare. A wrong secret or Cloudflare out of reach
 * is the site's problem, not the visitor's: `warn` hears of it once.
 */
export async function verifyTurnstile(
  secretKey: string,
  response: unknown,
  ip: string | undefined,
  warn?: (message: string) => void,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  if (typeof response !== 'string' || !response) return false
  const body = new URLSearchParams({ secret: secretKey, response, ...(ip ? { remoteip: ip } : {}) })
  const once = (message: string) => {
    if (!warn || warned.has(message)) return
    warned.add(message)
    warn(message)
  }
  try {
    const result = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(10_000),
    })
    const json = (await result.json()) as { success?: boolean; 'error-codes'?: string[] }
    const codes = json['error-codes'] ?? []
    if (codes.includes('invalid-input-secret') || codes.includes('missing-input-secret'))
      once(
        'Cloudflare Turnstile refuses the secret key, so every check fails: copy the Secret Key from the Turnstile widget in the Cloudflare dashboard',
      )
    return json.success === true
  } catch (error) {
    once(`Could not reach Cloudflare Turnstile, so checks fail: ${(error as Error).message}`)
    return false
  }
}
