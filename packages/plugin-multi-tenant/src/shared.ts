import type { AuthUser, EasyCMS, ID, RequestContext, Where } from '@easy-cms/core'

/** The field each tenant document has. */
export const TENANT_FIELD = 'tenant'
/** The users' field listing their tenants and their role in each. */
export const MEMBERSHIPS_FIELD = 'tenants'
/** "All tenants" in the switcher, the header or the cookie. */
export const ALL = '*'

/**
 * What a request knows about tenants, in its `context`:
 * - `tenant`: the id of the tenant it works in, `null` for none (or all of them);
 * - `allTenants`: it may see every tenant (users who have access to all of them, and
 *   anonymous reads with `publicReads: 'all'`).
 */
export interface TenantContext {
  readonly tenant: ID | null
  readonly allTenants: boolean
}

export const tenantOf = (context: RequestContext | undefined): TenantContext => ({
  tenant: (context?.tenant as ID | null | undefined) ?? null,
  allTenants: context?.allTenants === true,
})

/** One row of a user's `tenants`. */
export interface Membership {
  readonly tenant: ID
  readonly role: string
}

/** A user's tenants and roles (`tenants` on users), as stored. */
export function membershipsOf(user: AuthUser | Record<string, unknown> | null): Membership[] {
  const rows = (user as Record<string, unknown> | null)?.[MEMBERSHIPS_FIELD]
  if (!Array.isArray(rows)) return []
  return rows.flatMap((row) => {
    const r = row as Record<string, unknown>
    const tenant = r.tenant && typeof r.tenant === 'object' ? (r.tenant as { id: ID }).id : r.tenant
    return tenant === null || tenant === undefined
      ? []
      : [{ tenant: tenant as ID, role: typeof r.role === 'string' ? r.role : 'editor' }]
  })
}

/** Matches no document: for reads that name no tenant. */
export const NOTHING: Where = {
  and: [{ [TENANT_FIELD]: { exists: true } }, { [TENANT_FIELD]: { exists: false } }],
}

export const sameId = (a: unknown, b: unknown) =>
  a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b)

/** A tenant as `onRequest` and the helpers know it. */
export interface TenantRef {
  readonly id: ID
  readonly name: string
  readonly slug: string
  readonly domains: readonly string[]
}

const CACHE = Symbol.for('easy-cms.multi-tenant.tenants')
const TTL = 10_000

/** Every tenant, kept for 10 seconds per instance (and dropped when one changes). */
export async function tenantList(cms: EasyCMS, slug: string): Promise<TenantRef[]> {
  const holder = cms as unknown as { [CACHE]?: { at: number; list: Promise<TenantRef[]> } }
  const cached = holder[CACHE]
  if (cached && Date.now() - cached.at < TTL) return cached.list
  const list = cms.find(slug, { limit: 0, depth: 0, sort: 'name' }).then(({ docs }) =>
    docs.map((doc) => ({
      id: doc.id,
      name: String(doc.name ?? doc.slug ?? doc.id),
      slug: String(doc.slug ?? ''),
      domains: Array.isArray(doc.domains)
        ? doc.domains
            .map((d) => String((d as { domain?: unknown }).domain ?? '').toLowerCase())
            .filter(Boolean)
        : [],
    })),
  )
  holder[CACHE] = { at: Date.now(), list }
  list.catch(() => {
    if (holder[CACHE]?.list === list) delete holder[CACHE]
  })
  return list
}

export function forgetTenants(cms: EasyCMS) {
  delete (cms as unknown as { [CACHE]?: unknown })[CACHE]
}

/** `example.com:3000` → `example.com`. */
export const hostName = (host: string | null | undefined) =>
  (host ?? '').trim().toLowerCase().replace(/:\d+$/, '')

/** The tenant named by an id or slug. */
export const findTenant = (list: readonly TenantRef[], value: string | null | undefined) =>
  value ? list.find((t) => String(t.id) === value || t.slug === value) : undefined

/** The tenant whose `domains` has this host. */
export const tenantOfHost = (list: readonly TenantRef[], host: string | null | undefined) => {
  const name = hostName(host)
  return name ? list.find((t) => t.domains.includes(name)) : undefined
}
