import { createHmac, timingSafeEqual } from 'node:crypto'
import { UnauthorizedError } from './errors.js'
import type { WebhookPayload } from './webhooks.js'

/** How old a delivery's timestamp may be, by default, before `verifyWebhook` refuses it. */
const TOLERANCE_SECONDS = 5 * 60

/**
 * `x-easy-cms-signature-v2` of one attempt: `v1=<hex HMAC-SHA256 of "<delivery>.<timestamp>.<body>">`.
 * The timestamp (`x-easy-cms-timestamp`, Unix seconds) is the attempt's, so a captured request
 * can't be replayed later, and the delivery id can't be paired with another body.
 */
export function signWebhook(
  secret: string,
  delivery: string,
  timestamp: number,
  body: string,
): string {
  return `v1=${createHmac('sha256', secret).update(`${delivery}.${timestamp}.${body}`).digest('hex')}`
}

export interface VerifyWebhookOptions {
  /** How far the timestamp may be from now, in seconds. Default 300. */
  readonly toleranceSeconds?: number
  /** Now, for tests. */
  readonly now?: Date
}

type HeaderSource = Headers | Readonly<Record<string, string | readonly string[] | undefined>>

function header(headers: HeaderSource, name: string): string | undefined {
  if (headers instanceof Headers) return headers.get(name) ?? undefined
  const value = Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1]
  return Array.isArray(value) ? value[0] : (value as string | undefined)
}

function equal(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

/**
 * Checks a webhook from Easy CMS and returns its payload: the signature (with `secret`, or any of
 * several while one is replaced) over the delivery id, the timestamp and the raw body, and a
 * timestamp within `toleranceSeconds` of now. Throws `UnauthorizedError` otherwise. Pass the body
 * exactly as received, before parsing it. Also skip deliveries already handled
 * (`x-easy-cms-delivery`): a replay within the tolerance has a valid signature.
 */
export function verifyWebhook(
  body: string,
  headers: HeaderSource,
  secret: string | readonly string[],
  options: VerifyWebhookOptions = {},
): WebhookPayload {
  const delivery = header(headers, 'x-easy-cms-delivery')
  const timestamp = header(headers, 'x-easy-cms-timestamp')
  const signatures = header(headers, 'x-easy-cms-signature-v2')
  if (!delivery || !timestamp || !signatures)
    throw new UnauthorizedError('Webhook signature missing')
  const seconds = Number(timestamp)
  const now = (options.now ?? new Date()).getTime() / 1000
  if (
    !/^\d+$/.test(timestamp) ||
    Math.abs(now - seconds) > (options.toleranceSeconds ?? TOLERANCE_SECONDS)
  )
    throw new UnauthorizedError('Webhook timestamp too old or in the future')
  const sent = signatures.split(/[\s,]+/).filter((s) => s.startsWith('v1='))
  const valid = [secret]
    .flat()
    .some((s) => sent.some((given) => equal(given, signWebhook(s, delivery, seconds, body))))
  if (!valid) throw new UnauthorizedError('Webhook signature does not match')
  return JSON.parse(body) as WebhookPayload
}
