/** The session cookie the REST API sets at login. */
export const SESSION_COOKIE = 'ecms-session'

/**
 * Over HTTPS the cookies' names get the `__Host-` prefix: browsers then keep them to this exact
 * host (no `Domain`, `Path=/`, `Secure`), so a subdomain can't set one.
 */
export const hostCookie = (name: string): string => `__Host-${name}`

/** A cookie's value from a `Cookie` header: the `__Host-` one first, then the plain name. */
export function cookieValue(header: string | null | undefined, name: string): string | undefined {
  if (!header) return undefined
  let plain: string | undefined
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq <= 0) continue
    const key = part.slice(0, eq).trim()
    if (key !== name && key !== hostCookie(name)) continue
    const value = decodeURIComponent(part.slice(eq + 1).trim())
    if (key !== name) return value
    plain ??= value
  }
  return plain
}
