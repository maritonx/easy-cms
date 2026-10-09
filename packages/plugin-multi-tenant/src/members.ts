import {
  type AuthUser,
  type EasyCMS,
  type Endpoint,
  ForbiddenError,
  type ID,
  NotFoundError,
  type RequestContext,
  ValidationError,
} from '@easy-cms/core'
import { MEMBERSHIPS_FIELD, membershipsOf, sameId, tenantOf } from './shared.js'

type Data = Record<string, unknown>

interface Options {
  readonly tenantsSlug: string
  readonly superUser: (user: AuthUser | null, context: RequestContext | undefined) => boolean
}

/** A member as the Members page shows them. */
export interface Member {
  readonly id: ID
  readonly email: string
  readonly name: string | null
  readonly role: string
}

/**
 * Members of the tenant a request works in: list, add by email (inviting new people), change a
 * role, remove. For admins of that tenant, and users with access to all tenants once they chose
 * one. Users themselves stay: an account may belong to several tenants.
 */
export function membersEndpoints(options: Options): Endpoint[] {
  const tenantFor = (user: AuthUser | null, context: RequestContext): ID => {
    const { tenant } = tenantOf(context)
    if (!user) throw new ForbiddenError('Log in first')
    if (tenant === null) throw new ForbiddenError('Choose a tenant first')
    if (user.role !== 'admin' && !options.superUser(user, context))
      throw new ForbiddenError('Only admins of this tenant manage its members')
    return tenant
  }
  const roleOf = async (cms: EasyCMS, value: unknown) => {
    const roles = await cms.roles.options()
    const role = typeof value === 'string' ? value : ''
    if (!roles.some((r) => r.key === role))
      throw new ValidationError('users', [{ field: 'role', message: `there is no role "${role}"` }])
    return role
  }
  const member = (doc: Data, tenant: ID): Member => ({
    id: doc.id as ID,
    email: String(doc.email ?? ''),
    name: typeof doc.name === 'string' ? doc.name : null,
    role: membershipsOf(doc).find((m) => sameId(m.tenant, tenant))?.role ?? '',
  })
  const rows = (doc: Data) => ((doc[MEMBERSHIPS_FIELD] ?? []) as Data[]).map((row) => ({ ...row }))
  const findMember = async (cms: EasyCMS, id: string, tenant: ID) => {
    const doc = (await cms.findById('users', /^\d+$/.test(id) ? Number(id) : id, {
      depth: 0,
    })) as Data | null
    if (!doc || !membershipsOf(doc).some((m) => sameId(m.tenant, tenant)))
      throw new NotFoundError('members', id)
    return doc
  }

  return [
    {
      path: '/tenant-members',
      method: 'get',
      handler: async ({ user, context, cms }) => {
        const tenant = tenantFor(user, context)
        const { docs } = await cms.find('users', {
          where: { [`${MEMBERSHIPS_FIELD}.tenant`]: { equals: tenant } },
          sort: 'email',
          limit: 0,
          depth: 0,
        })
        return {
          members: docs.map((doc) => member(doc as Data, tenant)),
          roles: await cms.roles.options(),
          invites: cms.auth.canSendPasswordLinks(),
        }
      },
    },
    {
      path: '/tenant-members',
      method: 'post',
      handler: async ({ user, context, cms, json, url }) => {
        const tenant = tenantFor(user, context)
        const body = await json()
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
        if (!/^[^\s@]+@[^\s@]+$/.test(email))
          throw new ValidationError('users', [
            { field: 'email', message: 'is not an email address' },
          ])
        const role = await roleOf(cms, body.role)
        const { docs } = await cms.find('users', {
          where: { email: { equals: email } },
          limit: 1,
          depth: 0,
        })
        const existing = docs[0] as Data | undefined
        if (existing) {
          const list = rows(existing).filter((row) => !sameId(row.tenant, tenant))
          const doc = await cms.update(
            'users',
            existing.id as ID,
            { [MEMBERSHIPS_FIELD]: [...list, { tenant, role }] } as never,
            { depth: 0 },
          )
          return { member: member(doc as Data, tenant), invited: false }
        }
        // Someone new: an account in this tenant only, and an email to set a password.
        const doc = (await cms.create(
          'users',
          { email, [MEMBERSHIPS_FIELD]: [{ tenant, role }] } as never,
          { depth: 0 },
        )) as Data
        let invited = false
        if (cms.auth.canSendPasswordLinks(url.origin)) {
          await cms.auth.sendPasswordLink(doc.id as ID, { origin: url.origin })
          invited = true
        }
        return Response.json({ member: member(doc, tenant), invited }, { status: 201 })
      },
    },
    {
      path: '/tenant-members/:id',
      method: 'patch',
      handler: async ({ user, context, cms, json, params }) => {
        const tenant = tenantFor(user, context)
        const doc = await findMember(cms, params.id as string, tenant)
        const role = await roleOf(cms, (await json()).role)
        const list = rows(doc).map((row) => (sameId(row.tenant, tenant) ? { ...row, role } : row))
        const updated = await cms.update(
          'users',
          doc.id as ID,
          { [MEMBERSHIPS_FIELD]: list } as never,
          { depth: 0 },
        )
        return { member: member(updated as Data, tenant) }
      },
    },
    {
      path: '/tenant-members/:id',
      method: 'delete',
      handler: async ({ user, context, cms, params }) => {
        const tenant = tenantFor(user, context)
        const doc = await findMember(cms, params.id as string, tenant)
        if (sameId(doc.id, user?.id))
          throw new ValidationError('users', [
            { field: 'id', message: "you can't remove yourself from a tenant" },
          ])
        const list = rows(doc).filter((row) => !sameId(row.tenant, tenant))
        await cms.update('users', doc.id as ID, { [MEMBERSHIPS_FIELD]: list } as never, {
          depth: 0,
        })
        return { removed: true }
      },
    },
  ]
}
