import { type AuthUser, type Config, type EasyCMS, sharedEasyCMS } from '@easy-cms/core'
import { getRequestHeader, type H3Event } from 'h3'

/**
 * Returns the Easy CMS instance for this server, creating it on first use. A config that changed
 * (dev HMR) closes the old instance and makes a new one.
 */
export function getEasyCMS(config: Config): Promise<EasyCMS> {
  return sharedEasyCMS(config) as Promise<EasyCMS>
}

/** The logged-in Easy CMS user for a request (session cookie or Bearer token), or `null`. */
export async function getEasyCMSUser(config: Config, event: H3Event): Promise<AuthUser | null> {
  const cms = await getEasyCMS(config)
  return cms.auth.userFromHeaders({ get: (name) => getRequestHeader(event, name) })
}
