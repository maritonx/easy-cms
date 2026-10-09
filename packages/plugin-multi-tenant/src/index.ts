import type { EasyCMS, RequestContext } from '@easy-cms/core'
import { findTenant, type TenantRef, tenantList, tenantOfHost } from './shared.js'

export type { Member } from './members.js'
export {
  type MultiTenantOptions,
  type MultiTenantPluginTypes,
  multiTenantPlugin,
} from './plugin.js'
export { ALL, type Membership, type TenantContext, type TenantRef, tenantOf } from './shared.js'

/**
 * The tenant of a page of your site, by slug or by domain (`domains` of the tenant), e.g. from
 * the request's host. `null` when none matches.
 */
export async function findTenantFor(
  cms: EasyCMS,
  by: { readonly slug?: string; readonly host?: string },
  tenantsSlug = 'tenants',
): Promise<TenantRef | null> {
  const list = await tenantList(cms, tenantsSlug)
  return (by.slug ? findTenant(list, by.slug) : undefined) ?? tenantOfHost(list, by.host) ?? null
}

/**
 * The `context` for Local API calls that read one tenant's content, e.g.
 * `cms.find('posts', { overrideAccess: false, user: null, context: await tenantContext(cms, { host }) })`.
 * A tenant that doesn't exist gives a context that finds nothing.
 */
export async function tenantContext(
  cms: EasyCMS,
  by: { readonly slug?: string; readonly host?: string },
  tenantsSlug = 'tenants',
): Promise<RequestContext> {
  const tenant = await findTenantFor(cms, by, tenantsSlug)
  return { tenant: tenant?.id ?? null, allTenants: false }
}
