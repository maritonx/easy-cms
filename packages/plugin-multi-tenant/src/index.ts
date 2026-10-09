import type { EasyCMS, RequestContext } from '@easy-cms/core'
import { findTenant, type TenantRef, tenantList, tenantOfHost } from './shared.js'

export type { Member } from './members.js'
export {
  type MultiTenantPluginOptions,
  type MultiTenantPluginTypes,
  multiTenantPlugin,
} from './plugin.js'
export { ALL, type Membership, type TenantContext, type TenantRef, tenantOf } from './shared.js'

/** A tenant by its slug or one of its domains. */
export interface TenantLookup {
  readonly slug?: string
  readonly host?: string
  /** Slug of the tenants collection, when the plugin's `slugs.tenants` changed it. */
  readonly collection?: string
}

/**
 * The tenant of a page of your site, by slug or by domain (`domains` of the tenant), e.g. from
 * the request's host. `null` when none matches.
 */
export async function findTenantFor(cms: EasyCMS, by: TenantLookup): Promise<TenantRef | null> {
  const list = await tenantList(cms, by.collection ?? 'tenants')
  return (by.slug ? findTenant(list, by.slug) : undefined) ?? tenantOfHost(list, by.host) ?? null
}

/**
 * The `context` for Local API calls that read one tenant's content, e.g.
 * `cms.find('posts', { overrideAccess: false, user: null, context: await tenantContext(cms, { host }) })`.
 * A tenant that doesn't exist gives a context that finds nothing.
 */
export async function tenantContext(cms: EasyCMS, by: TenantLookup): Promise<RequestContext> {
  const tenant = await findTenantFor(cms, by)
  return { tenant: tenant?.id ?? null, allTenants: false }
}
