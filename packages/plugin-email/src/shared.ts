import type { EmailMessage } from '@easy-cms/core'

/** The addresses of a field, as a list. */
export const list = (value: string | readonly string[] | undefined): string[] =>
  value === undefined ? [] : [value].flat()

/** `Name <address>` as its parts. */
export function parseAddress(value: string): { email: string; name?: string } {
  const match = /^\s*(.*?)\s*<([^<>]+)>\s*$/.exec(value)
  if (!match) return { email: value.trim() }
  const name = (match[1] ?? '').replace(/^"|"$/g, '').trim()
  return { email: (match[2] ?? '').trim(), ...(name ? { name } : {}) }
}

/** A provider's answer as JSON, or `{}`. */
export async function json(response: Response): Promise<Record<string, unknown>> {
  try {
    const body = (await response.json()) as unknown
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** The message's error from a provider's answer. */
export function failure(provider: string, response: Response, body: Record<string, unknown>) {
  const text = body.message ?? body.Message ?? body.error ?? body.code
  return new Error(`${provider}: ${typeof text === 'string' ? text : `HTTP ${response.status}`}`)
}

/** What every provider sends: the body without the empty parts. */
export type Outgoing = EmailMessage & { readonly from: string }

/** The webhook's JSON body. */
export function parseBody(body: string): unknown {
  try {
    return JSON.parse(body) as unknown
  } catch {
    throw new Error('the body is not JSON')
  }
}
