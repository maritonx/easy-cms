import { createHmac, timingSafeEqual } from 'node:crypto'

/** Tokens older than this are refused: the page was left open for a day. */
const MAX_AGE = 24 * 3_600_000

const sign = (secret: string, value: string) =>
  createHmac('sha256', secret).update(value).digest('base64url')

/** A token that proves the form was loaded at `now`: `<time>.<signature>`. */
export function formToken(secret: string, slug: string, now = Date.now()): string {
  return `${now}.${sign(secret, `easy-form:${slug}:${now}`)}`
}

/**
 * Checks a token: `ok` when the form was loaded at least `minTime` ms ago (people take a few
 * seconds; bots don't) and less than a day ago.
 */
export function checkToken(
  secret: string,
  slug: string,
  token: unknown,
  minTime: number,
  now = Date.now(),
): 'ok' | 'invalid' | 'too-fast' | 'expired' {
  if (typeof token !== 'string') return 'invalid'
  const [time, signature] = token.split('.')
  const issued = Number(time)
  if (!Number.isFinite(issued) || !signature) return 'invalid'
  const expected = Buffer.from(sign(secret, `easy-form:${slug}:${issued}`))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return 'invalid'
  if (now - issued < minTime) return 'too-fast'
  if (now - issued > MAX_AGE) return 'expired'
  return 'ok'
}

/**
 * The rate-limit keys for an IP address in the current and previous window. A hash with the
 * window in it: submissions keep no IP, and keys from different windows can't be linked.
 */
export function rateKeys(
  secret: string,
  ip: string,
  form: unknown,
  window: number,
  now = Date.now(),
) {
  const bucket = Math.floor(now / (window * 1000))
  const key = (b: number) => sign(secret, `easy-form-rate:${ip}:${String(form)}:${b}`).slice(0, 32)
  return { current: key(bucket), previous: key(bucket - 1) }
}

/** The hidden field bots fill in: a common name the form doesn't use. */
export function honeypotName(names: readonly string[]): string {
  return ['website', 'homepage', 'url_address'].find((n) => !names.includes(n)) ?? 'hp_field'
}

/** Checks a Cloudflare Turnstile response with Cloudflare. */
export async function verifyTurnstile(
  secretKey: string,
  response: unknown,
  ip: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  if (typeof response !== 'string' || !response) return false
  const body = new URLSearchParams({ secret: secretKey, response, ...(ip ? { remoteip: ip } : {}) })
  try {
    const result = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(10_000),
    })
    return ((await result.json()) as { success?: boolean }).success === true
  } catch {
    return false
  }
}
