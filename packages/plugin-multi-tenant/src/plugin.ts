import {
  type Access,
  type AccessArgs,
  type AuthUser,
  type BeforeChangeHook,
  type BeforeValidateHook,
  type CliCommand,
  type CollectionAccess,
  type CollectionConfig,
  type Config,
  definePlugin,
  type EasyCMS,
  type Endpoint,
  type Field,
  type GlobalConfig,
  type ID,
  isLoggedIn,
  MEDIA,
  MEDIA_FOLDERS,
  type OnRequest,
  type RequestContext,
  type TypedPlugin,
  ValidationError,
  type Where,
} from '@easy-cms/core'
import { INFO } from './info.js'
import { membersEndpoints } from './members.js'
import {
  ALL,
  findTenant,
  forgetTenants,
  MEMBERSHIPS_FIELD,
  type Membership,
  membershipsOf,
  NOTHING,
  sameId,
  TENANT_FIELD,
  type TenantRef,
  tenantList,
  tenantOf,
  tenantOfHost,
} from './shared.js'

export interface MultiTenantOptions<S extends string = string, T extends string = string> {
  /**
   * Collections whose documents belong to one tenant, by slug, e.g. `['posts', 'pages',
   * 'media']`. With `media` and `upload.folders`, the media folders too. Others are shared.
   */
  readonly collections: readonly S[]
  /** Globals with a value per tenant, e.g. `['site-settings']`. Others are shared. */
  readonly globals?: readonly string[]
  /**
   * Shared collections and globals (not listed above) that the people of a tenant, its admins
   * included, may change. A change applies to every tenant. Default: none; only users with
   * access to all tenants change shared data.
   */
  readonly editShared?: readonly string[]
  /** Slug of the tenants collection. Default `tenants`. */
  readonly tenantsSlug?: T
  /**
   * Users who see and manage every tenant and the whole system. Default: users whose own role
   * is `admin`.
   */
  readonly userHasAccessToAllTenants?: (user: AuthUser) => boolean
  /**
   * Reads that name no tenant (no header, `?tenant=`, cookie or matching domain): `none`
   * (default) finds nothing; `all` finds every tenant's published documents.
   */
  readonly publicReads?: 'none' | 'all'
  /** Request header naming the tenant, by slug or id. Default `x-easy-cms-tenant`. */
  readonly header?: string
  /** Cookie in which the admin keeps the chosen tenant. Default `ecms-tenant`. */
  readonly cookie?: string
}

type Data = Record<string, unknown>
type Op = 'read' | 'create' | 'update' | 'delete'

type TenantFieldType<T extends string> = {
  readonly name: 'tenant'
  readonly type: 'relationship'
  readonly to: T
}

/** What `multiTenantPlugin(options)` adds, for the types the Local API infers from the config. */
export type MultiTenantPluginTypes<S extends string, T extends string = 'tenants'> = {
  readonly fields: { readonly [K in S]: readonly [TenantFieldType<T>] } & {
    readonly users: readonly [
      {
        readonly name: 'tenants'
        readonly type: 'array'
        readonly fields: readonly [
          {
            readonly name: 'tenant'
            readonly type: 'relationship'
            readonly to: T
            readonly required: true
          },
          { readonly name: 'role'; readonly type: 'text'; readonly required: true },
        ]
      },
    ]
  }
  readonly collections: readonly [
    {
      readonly slug: T
      readonly fields: readonly [
        { readonly name: 'name'; readonly type: 'text'; readonly required: true },
        { readonly name: 'slug'; readonly type: 'slug' },
        {
          readonly name: 'domains'
          readonly type: 'array'
          readonly fields: readonly [
            { readonly name: 'domain'; readonly type: 'text'; readonly required: true },
          ]
        },
      ]
    },
  ]
}

/** Access of the built-in collections, which the plugin narrows (they are added after plugins). */
const BUILTIN_ACCESS: Record<string, Partial<Record<Op, Access>>> = {
  [MEDIA]: { read: () => true, create: isLoggedIn, update: isLoggedIn, delete: isLoggedIn },
  [MEDIA_FOLDERS]: { read: isLoggedIn, create: isLoggedIn, update: isLoggedIn, delete: isLoggedIn },
}

function readCookie(header: string | null, name: string): string | undefined {
  for (const part of header?.split(';') ?? []) {
    const eq = part.indexOf('=')
    if (eq > 0 && part.slice(0, eq).trim() === name)
      return decodeURIComponent(part.slice(eq + 1).trim())
  }
  return undefined
}

/**
 * Several sites or clients in one CMS: a `tenants` collection, a `tenant` on the documents of
 * the collections you name, members with a role in each tenant, a tenant switcher in the admin,
 * and globals with a value per tenant. Requests name their tenant with a header, `?tenant=`,
 * the admin's cookie or the domain.
 */
export function multiTenantPlugin<const S extends string, const T extends string = 'tenants'>(
  options: MultiTenantOptions<S, T>,
): TypedPlugin<MultiTenantPluginTypes<S, T>> {
  return definePlugin<MultiTenantPluginTypes<S, T>>((config: Config): Config => {
    const tenantsSlug: string = options.tenantsSlug ?? 'tenants'
    const header = (options.header ?? 'x-easy-cms-tenant').toLowerCase()
    const cookie = options.cookie ?? 'ecms-tenant'
    const publicReads = options.publicReads ?? 'none'
    const isSuper = options.userHasAccessToAllTenants ?? ((user: AuthUser) => user.role === 'admin')

    const scoped = new Set<string>(options.collections)
    if (scoped.has(MEDIA) && config.upload?.folders === true) scoped.add(MEDIA_FOLDERS)
    const declared = new Set((config.collections ?? []).map((c) => c.slug))
    const missing = [...scoped].filter(
      (s) => !declared.has(s) && s !== MEDIA && s !== MEDIA_FOLDERS,
    )
    if (missing.length)
      throw new Error(
        `multiTenantPlugin: no collection ${missing.map((s) => `"${s}"`).join(', ')} in the config (add plugins that make collections before this one)`,
      )
    if (scoped.has(tenantsSlug) || scoped.has('users'))
      throw new Error(`multiTenantPlugin: "${tenantsSlug}" and "users" can't belong to a tenant`)
    const perTenant = new Set(options.globals ?? [])
    const unknownGlobals = [...perTenant].filter(
      (g) => !(config.globals ?? []).some((global) => global.slug === g),
    )
    if (unknownGlobals.length)
      throw new Error(
        `multiTenantPlugin: no global ${unknownGlobals.map((g) => `"${g}"`).join(', ')} in the config`,
      )

    /**
     * Has access to all tenants and to the system: staff only. Site members and visitors never
     * are, even when they read every tenant (`publicReads: 'all'`).
     */
    const superUser = (user: AuthUser | null, _context?: RequestContext) =>
      !!user && user.member !== true && user.scoped !== true && isSuper(user)
    /** May read every tenant: users with access to all, or reads with `publicReads: 'all'`. */
    const everywhere = (user: AuthUser | null, context: RequestContext | undefined) =>
      tenantOf(context).allTenants || superUser(user, context)

    /** Shared data: the people of one tenant change it only where `editShared` says so. */
    const editShared = new Set(options.editShared ?? [])
    const sharedWrite =
      (slug: string, original: Access | undefined): Access =>
      async (args) =>
        args.user?.scoped === true && !editShared.has(slug) ? false : (original ?? isLoggedIn)(args)

    /** What the tenant adds to an access rule. */
    const tenantFilter = (args: AccessArgs, op: Op): boolean | Where => {
      const { tenant } = tenantOf(args.context)
      // Writing without a tenant takes access to all tenants; reading every tenant doesn't.
      if (op === 'create') return tenant !== null || superUser(args.user, args.context)
      if (tenant !== null) return { [TENANT_FIELD]: { equals: tenant } }
      if (op === 'read') return everywhere(args.user, args.context) ? true : NOTHING
      return superUser(args.user, args.context)
    }
    const narrow =
      (original: Access | undefined, op: Op): Access =>
      async (args) => {
        const base = await (original ?? isLoggedIn)(args)
        if (base === false) return false
        const filter = tenantFilter(args, op)
        if (filter === false) return false
        if (filter === true) return base
        return base === true ? filter : { and: [base, filter] }
      }

    /** Relationships to tenant documents offer (and accept) the current tenant's only. */
    const withTenantFilters = (fields: readonly Field[]): Field[] =>
      fields.map((field) => {
        if (field.type === 'group' || field.type === 'array')
          return { ...field, fields: withTenantFilters(field.fields) }
        if (field.type === 'blocks')
          return {
            ...field,
            blocks: field.blocks.map((b) => ({ ...b, fields: withTenantFilters(b.fields) })),
          }
        const target =
          field.type === 'relationship' ? field.to : field.type === 'upload' ? MEDIA : null
        if (
          (field.type !== 'relationship' && field.type !== 'upload') ||
          !target ||
          !scoped.has(target)
        )
          return field
        const own = field.filterOptions
        return {
          ...field,
          filterOptions: async (args) => {
            const base = own ? await own(args) : true
            const { tenant } = tenantOf(args.context)
            if (tenant === null) return base
            const mine: Where = { [TENANT_FIELD]: { equals: tenant } }
            return base === true ? mine : { and: [base, mine] }
          },
        }
      })

    const tenantField: Field = {
      name: TENANT_FIELD,
      type: 'relationship',
      to: tenantsSlug,
      index: true,
      position: 'sidebar',
      label: { en: 'Tenant', th: 'Tenant' },
      // Set from the tenant the request works in; only users with access to all tenants choose.
      access: { update: ({ user, context }) => superUser(user, context) },
      admin: {
        // New documents start in the chosen tenant.
        defaultValue: ({ context }) => tenantOf(context).tenant ?? undefined,
        // A column while every tenant is shown.
        column: ({ user, context }) =>
          superUser(user, context) && tenantOf(context).tenant === null,
        allowCreate: false,
      },
    }

    /**
     * A new document gets the tenant the request works in; without one (e.g. a plugin's own
     * write), the tenant of the first tenant document it points to (a form's submission, a
     * page's redirect).
     */
    const fillTenant =
      (fields: readonly Field[]): BeforeValidateHook =>
      async ({ data, operation, context, cms }) => {
        if (operation !== 'create' || (data[TENANT_FIELD] ?? null) !== null) return data
        const { tenant } = tenantOf(context)
        if (tenant !== null) return { ...data, [TENANT_FIELD]: tenant }
        for (const field of fields) {
          const target =
            field.type === 'relationship' ? field.to : field.type === 'upload' ? MEDIA : null
          if (!target || !scoped.has(target) || field.name === TENANT_FIELD) continue
          const value = [data[field.name]].flat()[0]
          const id = value && typeof value === 'object' ? (value as { id?: ID }).id : value
          if (id === null || id === undefined) continue
          if (!cms.config.collections.some((c) => c.slug === target)) continue
          const doc = await cms.findById(target, id as ID, { depth: 0, draft: true })
          const owner = (doc as Data | null)?.[TENANT_FIELD]
          if (owner !== null && owner !== undefined) return { ...data, [TENANT_FIELD]: owner }
        }
        return data
      }
    const checkTenant =
      (slug: string): BeforeChangeHook =>
      ({ data, operation, originalDoc, context, user }) => {
        const value = (data[TENANT_FIELD] ?? null) as ID | null
        const { tenant } = tenantOf(context)
        // Trusted calls without a user or a tenant (imports, `tenants:assign`) choose freely.
        if (!user && tenant === null) return data
        const fail = (message: string) => {
          throw new ValidationError(slug, [{ field: TENANT_FIELD, message }])
        }
        if (value === null) fail('is required: choose a tenant')
        if (superUser(user, context)) return data
        if (!sameId(value, tenant)) fail('must be the tenant you work in')
        const before = (originalDoc?.[TENANT_FIELD] ?? null) as ID | null
        if (operation === 'update' && before !== null && !sameId(before, value))
          fail("can't move to another tenant")
        return data
      }

    /** A tenant collection: the field, unique values per tenant, narrowed access and the checks. */
    const scopeCollection = (c: CollectionConfig, builtin?: Partial<Record<Op, Access>>) => {
      const fields = withTenantFilters(
        c.fields.map((f) =>
          f.unique || f.type === 'slug'
            ? {
                ...f,
                uniqueWithin: [
                  ...new Set([
                    ...(f.uniqueWithin === undefined ? [] : [f.uniqueWithin].flat()),
                    TENANT_FIELD,
                  ]),
                ],
              }
            : f,
        ),
      )
      const access = { ...builtin, ...c.access }
      return {
        ...c,
        fields: fields.some((f) => f.name === TENANT_FIELD) ? fields : [...fields, tenantField],
        access: {
          read: narrow(access.read, 'read'),
          create: narrow(access.create, 'create'),
          update: narrow(access.update, 'update'),
          delete: narrow(access.delete, 'delete'),
        },
        hooks: {
          ...c.hooks,
          beforeValidate: [fillTenant(c.fields), ...(c.hooks?.beforeValidate ?? [])],
          beforeChange: [...(c.hooks?.beforeChange ?? []), checkTenant(c.slug)],
        },
      } satisfies CollectionConfig
    }

    // Users: their tenants and roles; members of a tenant see each other.
    const memberships: Field = {
      name: MEMBERSHIPS_FIELD,
      type: 'array',
      label: { en: 'Tenants', th: 'Tenant' },
      access: { update: ({ user, context }) => superUser(user, context) },
      fields: [
        { name: 'tenant', type: 'relationship', to: tenantsSlug, required: true },
        {
          name: 'role',
          type: 'text',
          required: true,
          defaultValue: 'editor',
          label: { en: 'Role', th: 'บทบาท' },
        },
      ],
    }
    const usersAccess = (custom?: CollectionAccess): CollectionAccess => {
      const and = (own: Access | undefined, mine: Access): Access =>
        own
          ? async (args) => {
              const a = await own(args)
              if (a === false) return false
              const b = await mine(args)
              if (b === false) return false
              if (a === true) return b
              return b === true ? a : { and: [a, b] }
            }
          : mine
      const self = (user: AuthUser): Where => ({ id: { equals: user.id } })
      return {
        read: and(custom?.read, ({ user, context }) => {
          if (!user) return false
          // Site members (customers) see themselves only, whatever tenant they name.
          if (user.member === true) return self(user)
          if (superUser(user, context)) return true
          const { tenant } = tenantOf(context)
          return tenant === null
            ? self(user)
            : { or: [self(user), { [`${MEMBERSHIPS_FIELD}.tenant`]: { equals: tenant } }] }
        }),
        // Members are added through Members (`/tenant-members`), not by creating users.
        create: and(custom?.create, ({ user, context }) => superUser(user, context)),
        update: and(custom?.update, ({ user, context }) =>
          !user ? false : superUser(user, context) ? true : self(user),
        ),
        delete: and(custom?.delete, ({ user, context }) => superUser(user, context)),
      }
    }

    const tenantsAccess: CollectionAccess = {
      read: ({ user, context }) => {
        if (!user) return false
        if (superUser(user, context)) return true
        const ids = membershipsOf(user).map((m) => m.tenant)
        return ids.length ? { id: { in: ids } } : false
      },
      create: ({ user, context }) => superUser(user, context),
      update: ({ user, context }) => superUser(user, context),
      delete: ({ user, context }) => superUser(user, context),
    }
    const tenantsCollection: CollectionConfig = {
      slug: tenantsSlug,
      labels: { singular: { en: 'Tenant', th: 'Tenant' }, plural: { en: 'Tenants', th: 'Tenant' } },
      icon: 'building',
      useAsTitle: 'name',
      admin: {
        group: 'settings.people',
        // Deleting a tenant deletes its content: its name is typed, and what goes is shown.
        confirmDelete: { typeTitle: true, impact: '/tenant-impact' },
      },
      access: tenantsAccess,
      hooks: {
        afterChange: [({ cms }) => forgetTenants(cms)],
        afterDelete: [
          async ({ cms, id }) => {
            forgetTenants(cms)
            await removeTenant(cms, id, [...scoped])
          },
        ],
      },
      fields: [
        { name: 'name', type: 'text', required: true, label: { en: 'Name', th: 'ชื่อ' } },
        { name: 'slug', type: 'slug', from: 'name', label: { en: 'Slug', th: 'Slug' } },
        {
          name: 'domains',
          type: 'array',
          label: { en: 'Domains', th: 'โดเมน' },
          fields: [
            {
              name: 'domain',
              type: 'text',
              required: true,
              label: { en: 'Domain, e.g. example.com', th: 'โดเมน เช่น example.com' },
            },
          ],
        },
      ],
    }

    // The collections, in the config's order: tenants first, the others scoped or filtered.
    const collections: CollectionConfig[] = []
    const ownTenants = (config.collections ?? []).find((c) => c.slug === tenantsSlug)
    collections.push(
      ownTenants
        ? {
            ...tenantsCollection,
            ...ownTenants,
            fields: [...tenantsCollection.fields, ...ownTenants.fields],
            access: tenantsAccess,
            hooks: {
              ...ownTenants.hooks,
              afterChange: [
                ...(tenantsCollection.hooks?.afterChange ?? []),
                ...(ownTenants.hooks?.afterChange ?? []),
              ],
              afterDelete: [
                ...(tenantsCollection.hooks?.afterDelete ?? []),
                ...(ownTenants.hooks?.afterDelete ?? []),
              ],
            },
          }
        : tenantsCollection,
    )
    let hasUsers = false
    for (const c of config.collections ?? []) {
      if (c.slug === tenantsSlug) continue
      if (c.slug === 'users') {
        hasUsers = true
        collections.push({
          ...c,
          fields: [...withTenantFilters(c.fields), memberships],
          access: { ...c.access, ...usersAccess(c.access) },
        })
      } else if (scoped.has(c.slug)) collections.push(scopeCollection(c, BUILTIN_ACCESS[c.slug]))
      else
        collections.push({
          ...c,
          fields: withTenantFilters(c.fields),
          access: {
            ...c.access,
            create: sharedWrite(c.slug, c.access?.create),
            update: sharedWrite(c.slug, c.access?.update),
            delete: sharedWrite(c.slug, c.access?.delete),
          },
        })
    }
    if (!hasUsers) collections.push({ slug: 'users', fields: [memberships], access: usersAccess() })
    // The built-in media library (added after plugins) takes these as its own.
    for (const builtin of [MEDIA, MEDIA_FOLDERS]) {
      if (scoped.has(builtin) && !declared.has(builtin))
        collections.push(
          scopeCollection(
            {
              slug: builtin,
              // The built-in `key` of folders: unique per tenant (merged into the built-in field).
              fields:
                builtin === MEDIA_FOLDERS ? [{ name: 'key', type: 'text', unique: true }] : [],
            },
            BUILTIN_ACCESS[builtin],
          ),
        )
    }

    const globals: GlobalConfig[] = (config.globals ?? []).map((g) => {
      const filtered = { ...g, fields: withTenantFilters(g.fields) }
      if (!perTenant.has(g.slug))
        return {
          ...filtered,
          access: { ...g.access, update: sharedWrite(g.slug, g.access?.update) },
        }
      return {
        ...filtered,
        // One value per tenant; none when the request has no tenant.
        scope: ({ context }) => {
          const { tenant } = tenantOf(context)
          return tenant === null ? null : String(tenant)
        },
      }
    })

    // The tenant of each request, and the user's role in it.
    const previous = config.onRequest
    const onRequest: OnRequest = async (args) => {
      const before = previous ? await previous(args) : undefined
      const user = before?.user !== undefined ? before.user : args.user
      const context = { ...before?.context }
      const list = await tenantList(args.cms, tenantsSlug)
      const asked =
        args.headers.get(header) ??
        args.url?.searchParams.get('tenant') ??
        readCookie(args.headers.get('cookie'), cookie) ??
        null
      const byHost = tenantOfHost(
        list,
        args.headers.get('x-forwarded-host') ?? args.headers.get('host') ?? args.url?.host,
      )
      // An API key keeps the tenant it was created in.
      const bound = (user?.apiKey as { permissions?: { context?: RequestContext } } | undefined)
        ?.permissions?.context
      const boundTenant = bound ? tenantOf(bound) : undefined

      if (
        user &&
        user.member !== true &&
        isSuper(user) &&
        (!boundTenant || boundTenant.tenant === null)
      ) {
        const chosen = asked === ALL ? undefined : findTenant(list, asked)
        return { user, context: { ...context, tenant: chosen?.id ?? null, allTenants: true } }
      }
      // Site members (customers, `auth.members`) use the site of the request, like visitors.
      if (user && user.member !== true) {
        const mine = membershipsOf(user)
        const member = (t: TenantRef | undefined): Membership | undefined =>
          t ? mine.find((m) => sameId(m.tenant, t.id)) : undefined
        const membership =
          boundTenant && boundTenant.tenant !== null
            ? (mine.find((m) => sameId(m.tenant, boundTenant.tenant)) ??
              (isSuper(user) ? { tenant: boundTenant.tenant, role: user.role } : undefined))
            : (member(findTenant(list, asked)) ??
              member(byHost) ??
              mine.find((m) => list.some((t) => sameId(t.id, m.tenant))))
        return {
          user: { ...user, role: membership?.role ?? user.role, scoped: true },
          context: { ...context, tenant: membership?.tenant ?? null, allTenants: false },
        }
      }
      const chosen = asked && asked !== ALL ? findTenant(list, asked) : byHost
      return {
        user,
        context: {
          ...context,
          tenant: chosen?.id ?? null,
          allTenants: !chosen && publicReads === 'all',
        },
      }
    }

    const optionsEndpoint: Endpoint = {
      path: '/tenant-options',
      method: 'get',
      handler: async ({ user, context, cms }) => {
        if (!user) return Response.json({ errors: [{ message: 'Log in first' }] }, { status: 401 })
        const list = await tenantList(cms, tenantsSlug)
        const all = superUser(user, context)
        const mine = membershipsOf(user)
        return {
          options: list
            .filter((t) => all || mine.some((m) => sameId(m.tenant, t.id)))
            .map((t) => ({ value: t.slug || String(t.id), label: t.name })),
          ...(all ? { all: { en: 'All tenants', th: 'ทุก tenant' } } : {}),
        }
      },
    }

    const impactEndpoint: Endpoint = {
      path: '/tenant-impact',
      method: 'get',
      handler: async ({ user, context, cms, url }) => {
        if (!superUser(user, context))
          return Response.json({ errors: [{ message: 'Not allowed' }] }, { status: 403 })
        const raw = url.searchParams.get('id') ?? ''
        const id = /^\d+$/.test(raw) ? Number(raw) : raw
        const counts: { en: string; th: string }[] = []
        for (const slug of scoped) {
          const config = cms.config.collections.find((c) => c.slug === slug)
          if (!config) continue
          const n = await cms.count(slug, { where: { [TENANT_FIELD]: { equals: id } } })
          if (n === 0) continue
          const plural = config.labels?.plural
          const en = typeof plural === 'string' ? plural : (plural?.en ?? slug)
          const th = typeof plural === 'string' ? plural : (plural?.th ?? en)
          counts.push({ en: `${n} ${en}`, th: `${th} ${n} รายการ` })
        }
        const members = await cms.count('users', {
          where: { [`${MEMBERSHIPS_FIELD}.tenant`]: { equals: id } },
        })
        return {
          message: counts.length
            ? {
                en: `Also deleted: ${counts.map((c) => c.en).join(', ')}. ${members} members lose this tenant; their accounts stay.`,
                th: `จะลบไปด้วย: ${counts.map((c) => c.th).join(', ')} สมาชิก ${members} คนจะออกจาก tenant นี้ บัญชียังอยู่`,
              }
            : {
                en: `It has no content. ${members} members lose this tenant; their accounts stay.`,
                th: `ไม่มีเนื้อหา สมาชิก ${members} คนจะออกจาก tenant นี้ บัญชียังอยู่`,
              },
        }
      },
    }

    const assign: CliCommand = {
      name: 'tenants:assign',
      description: 'Give documents without a tenant to one (after adding the plugin to a site)',
      help: `Usage: easy-cms tenants:assign <tenant> [options]

Sets the tenant (by slug or id) of every document that has none, in the collections of
multiTenantPlugin, and copies the shared value of each per-tenant global to it when it has none
of its own. Run it once after adding the plugin to a site that has content.
`,
      run: async ({ cms, args, log }) => {
        const list = await tenantList(cms, tenantsSlug)
        const tenant = findTenant(list, args[0])
        if (!tenant) {
          log(args[0] ? `No tenant "${args[0]}"` : 'Name a tenant: easy-cms tenants:assign <slug>')
          return 1
        }
        for (const slug of scoped) {
          if (!cms.config.collections.some((c) => c.slug === slug)) continue
          // The ids first: documents leave the list as they get a tenant.
          const ids: ID[] = []
          for (let page = 1; ; page++) {
            const { docs, hasNextPage } = await cms.find(slug, {
              where: { [TENANT_FIELD]: { exists: false } },
              sort: 'id',
              limit: 500,
              page,
              depth: 0,
              draft: true,
            })
            ids.push(...docs.map((d) => d.id))
            if (!hasNextPage) break
          }
          let updated = 0
          const skipped: string[] = []
          for (const id of ids) {
            try {
              await cms.update(slug, id, { [TENANT_FIELD]: tenant.id } as never, {
                depth: 0,
                live: true,
              })
              updated++
            } catch (error) {
              // E.g. a value the tenant already has (unique per tenant): left as it is.
              skipped.push(`${slug} ${id}: ${(error as Error).message}`)
            }
          }
          log(`${slug}: ${updated} given to ${tenant.name}`)
          for (const line of skipped) log(`  not given: ${line}`)
        }
        const context = { tenant: tenant.id, allTenants: false }
        for (const slug of perTenant) {
          const own = await cms.findGlobal(slug, { context, depth: 0 })
          if (own.updatedAt) continue
          const shared = await cms.db.findGlobal({ slug })
          if (!shared) continue
          const { updatedAt: _u, ...data } = shared
          await cms.updateGlobal(slug, data as never, { context, depth: 0 })
          log(`${slug}: copied to ${tenant.name}`)
        }
        return 0
      },
    }

    return {
      ...config,
      collections,
      globals,
      onRequest,
      endpoints: [
        ...(config.endpoints ?? []),
        optionsEndpoint,
        impactEndpoint,
        ...membersEndpoints({ tenantsSlug, superUser, isSuper }),
      ],
      commands: [...(config.commands ?? []), assign],
      // Audit log entries belong to their tenant: its admins see them.
      ...(config.audit
        ? {
            audit: {
              ...(config.audit === true ? {} : config.audit),
              scope: (context: RequestContext) => {
                const { tenant } = tenantOf(context)
                return tenant === null ? null : String(tenant)
              },
            },
          }
        : {}),
      admin: {
        ...config.admin,
        modules: [
          ...new Set([...(config.admin?.modules ?? []), '@easy-cms/plugin-multi-tenant/admin']),
        ],
        switcher: { cookie, label: { en: 'Tenant', th: 'Tenant' }, options: '/tenant-options' },
        pages: [
          ...(config.admin?.pages ?? []),
          {
            path: 'tenant-members',
            label: { en: 'Members', th: 'สมาชิก' },
            icon: 'users',
            group: 'settings.people',
            // Admins of a tenant (and users with access to all, once they choose one).
            access: ({ user }) => user.role === 'admin',
            component: { tag: 'ecms-tenant-members' },
          },
        ],
      },
    }
  }, INFO)
}

/** A deleted tenant's documents and files go too, and it leaves its members' lists. */
async function removeTenant(cms: EasyCMS, id: ID, collections: readonly string[]) {
  // Files before folders: deleting a folder moves what is in it.
  const order = [...collections].sort((a, b) =>
    a === MEDIA_FOLDERS ? 1 : b === MEDIA_FOLDERS ? -1 : 0,
  )
  for (const slug of order) {
    if (!cms.config.collections.some((c) => c.slug === slug)) continue
    for (;;) {
      const { docs } = await cms.find(slug, {
        where: { [TENANT_FIELD]: { equals: id } },
        limit: 100,
        depth: 0,
        draft: true,
      })
      if (docs.length === 0) break
      for (const doc of docs) await cms.delete(slug, doc.id).catch(() => undefined)
    }
  }
  const { docs: members } = await cms.find('users', {
    where: { [`${MEMBERSHIPS_FIELD}.tenant`]: { equals: id } },
    limit: 0,
    depth: 0,
  })
  for (const member of members) {
    const rows = ((member as Data)[MEMBERSHIPS_FIELD] as Data[]).filter(
      (row) => !sameId(row.tenant, id),
    )
    await cms.update('users', member.id, { [MEMBERSHIPS_FIELD]: rows } as never, { depth: 0 })
  }
}
