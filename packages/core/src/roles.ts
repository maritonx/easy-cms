import type { AuthUser, ID, Where } from './access.js'
import { API_KEYS } from './api-keys.js'
import {
  EMAIL_DELIVERIES,
  INTERNAL_COLLECTIONS,
  ROLES,
  USERS,
  WEBHOOK_DELIVERIES,
} from './builtins.js'
import type { CollectionConfig, ResolvedConfig } from './config.js'
import type { Database, RawDocument } from './database.js'
import { EasyCMSError, NotFoundError, ValidationError } from './errors.js'
import type { Field, Label } from './fields.js'
import { VersionStore } from './versions.js'

/** What a role may do with a collection or global, ticked in Settings → Roles. */
export const ROLE_OPERATIONS = ['read', 'create', 'update', 'delete', 'publish'] as const
export type RoleOperation = (typeof ROLE_OPERATIONS)[number]
const GLOBAL_OPERATIONS: readonly RoleOperation[] = ['read', 'update', 'publish']

/**
 * Stored in a role's `permissions`. Anything not listed is not allowed. A slug listed with no
 * operations has been looked at and given nothing (it is not "new" in Settings → Roles).
 */
export interface RolePermissions {
  readonly collections?: Readonly<Record<string, readonly RoleOperation[]>>
  readonly globals?: Readonly<Record<string, readonly RoleOperation[]>>
  /** Admin pages: `status`, `deliveries`, `page:<path>` (`admin.pages`), `widget:<tag>` (`admin.dashboard`). */
  readonly admin?: readonly string[]
}

/** One role as Settings → Roles shows it (`GET <api>/admin/roles`). */
export interface AdminRole {
  id: ID
  key: string
  /** The name shown in the admin; empty for roles from the config that were not renamed. */
  name: string
  /** From `auth.roles`: can't be deleted. */
  system: boolean
  /** Users with this role. */
  users: number
  permissions: RolePermissions
  updatedAt: string
}

/** A row of the permissions table. */
export interface AdminRoleTarget {
  slug: string
  /** Operations that make sense here (`publish` with drafts). */
  ops: RoleOperation[]
  /** No role has been given anything here yet (added to the config since). */
  new: boolean
}

/** A page or dashboard panel that can be given to roles. */
export interface AdminRoleView {
  id: string
  /** For plugin pages and panels; the admin names `status` and `deliveries` itself. */
  label?: Label
}

/** Settings → Roles (`GET <api>/admin/roles`). */
export interface AdminRoles {
  roles: AdminRole[]
  collections: (AdminRoleTarget & {
    /** Collections its relationship and upload fields point to. */
    references: string[]
  })[]
  globals: AdminRoleTarget[]
  views: AdminRoleView[]
}

/** One change to a role (`GET <api>/admin/roles/:id/history`). */
export interface AdminRoleChange {
  id: ID
  /** Email of who saved it, or `null` when it was the system (first start). */
  author: string | null
  createdAt: string
  name: string
  permissions: RolePermissions
}

const KEY = /^[a-z][a-z0-9-]{0,31}$/
const HISTORY = 50
/** Several servers share the roles table; each reads it again at most this often. */
const TTL = 30_000

/** The `user-roles` collection, added with `auth.rbac`. Managed only through Settings → Roles. */
export const rolesCollection: CollectionConfig = {
  slug: ROLES,
  access: { read: () => false, create: () => false, update: () => false, delete: () => false },
  fields: [
    { name: 'key', type: 'text', required: true, unique: true },
    { name: 'name', type: 'text' },
    { name: 'permissions', type: 'json' },
  ],
}

/** Collections roles are given access to: not internal ones, nor API keys (each user has their own). */
export function governed(slug: string): boolean {
  return !INTERNAL_COLLECTIONS.has(slug) && slug !== API_KEYS
}

/** Collections a collection's relationship and upload fields point to. */
function references(fields: readonly Field[], out = new Set<string>()): Set<string> {
  for (const field of fields) {
    if (field.type === 'relationship') out.add(field.to)
    else if (field.type === 'upload') out.add('media')
    else if (field.type === 'group' || field.type === 'array') references(field.fields, out)
    else if (field.type === 'blocks') for (const b of field.blocks) references(b.fields, out)
  }
  return out
}

const viewId = {
  page: (path: string) => `page:${path}`,
  widget: (tag: string) => `widget:${tag}`,
}
const tagOf = (component: string | { readonly tag: string }) =>
  typeof component === 'string' ? component : component.tag

/**
 * Roles and their permissions (`auth.rbac`), on top of access rules: an operation is allowed
 * when both allow it. Admins may do everything; requests that are not logged in are left to
 * access rules alone.
 */
export class Roles {
  readonly enabled: boolean
  private readonly versions: VersionStore
  private cache: { at: number; byKey: Map<string, RolePermissions> } | undefined
  private synced: Promise<void> | undefined

  constructor(
    private readonly config: ResolvedConfig,
    private readonly db: Database,
  ) {
    this.enabled = config.auth.rbac
    this.versions = new VersionStore(db)
  }

  /**
   * Whether the user's role allows an operation: `true`, `false`, or for their own account
   * (users without read or update on `users`) a constraint to it.
   */
  async allows(
    user: AuthUser | null,
    target: { collection: string } | { global: string },
    operation: RoleOperation,
  ): Promise<boolean | Where> {
    if (!this.enabled || !user || user.role === 'admin') return true
    if ('collection' in target && !governed(target.collection)) return true
    const permissions = await this.permissionsOf(user.role)
    const ops =
      'collection' in target
        ? permissions.collections?.[target.collection]
        : permissions.globals?.[target.global]
    if (ops?.includes(operation)) return true
    // Everyone sees and edits their own account.
    if ('collection' in target && target.collection === USERS) {
      if (operation === 'read' || operation === 'update') return { id: { equals: user.id } }
    }
    return false
  }

  /**
   * Whether the user may open an admin page: admins always; with roles, those whose role has
   * it; without roles, nobody else (`status`, `deliveries`) or everybody (plugin pages).
   */
  async canView(user: AuthUser, id: string): Promise<boolean> {
    if (user.role === 'admin' && !user.apiKey) return true
    if (user.apiKey) return false
    if (!this.enabled) return id.startsWith('page:') || id.startsWith('widget:')
    return (await this.permissionsOf(user.role)).admin?.includes(id) ?? false
  }

  /** Forgets cached permissions, after a role changed. */
  invalidate() {
    this.cache = undefined
  }

  /**
   * Adds the roles of `auth.roles` that are missing; on the first start, gives them everything.
   * Runs once, on first use (not on startup: `easy-cms migrate` opens the CMS before the table exists).
   */
  sync(): Promise<void> {
    this.synced ??= this.addMissing().catch((error: unknown) => {
      this.synced = undefined
      throw error
    })
    return this.synced
  }

  private async addMissing(): Promise<void> {
    if (!this.enabled) return
    const rows = await this.rows()
    const first = rows.length === 0
    const known = new Set(rows.map((r) => String(r.key)))
    for (const key of this.config.auth.roles) {
      if (known.has(key)) continue
      // Another server may be adding it at the same time.
      try {
        await this.insert(key, '', first && key !== 'admin' ? this.everything() : {}, null)
      } catch (error) {
        if (!(await this.rows()).some((r) => r.key === key)) throw error
      }
    }
    this.invalidate()
  }

  /** Whether a role exists (users can only be given existing roles). */
  async exists(key: string): Promise<boolean> {
    if (!this.enabled) return this.config.auth.roles.includes(key)
    return (await this.load()).has(key)
  }

  /** Roles a user can be given, those of `auth.roles` first; `name` may be empty. */
  async options(): Promise<{ key: string; name: string }[]> {
    if (!this.enabled) return this.config.auth.roles.map((key) => ({ key, name: '' }))
    await this.sync()
    return (await this.rows())
      .map((row) => ({ key: String(row.key), name: typeof row.name === 'string' ? row.name : '' }))
      .sort((a, b) => rank(a, this.config) - rank(b, this.config) || a.key.localeCompare(b.key))
  }

  // --- Settings → Roles ----------------------------------------------------

  async list(): Promise<AdminRoles> {
    await this.sync()
    const rows = await this.rows()
    const counts = new Map<string, number>()
    for (const row of rows) {
      counts.set(
        String(row.key),
        await this.db.count({ collection: USERS, where: { role: { equals: row.key } } }),
      )
    }
    const roles = rows
      .map((row) => this.toRole(row, counts.get(String(row.key)) ?? 0))
      .sort((a, b) => rank(a, this.config) - rank(b, this.config) || a.key.localeCompare(b.key))
    // "New": nothing has been decided for it in any role (admins don't count: they have all).
    const decided = roles.filter((r) => r.key !== 'admin').map((r) => r.permissions)
    const seen = (group: 'collections' | 'globals', slug: string) =>
      decided.some((p) => p[group]?.[slug] !== undefined)
    return {
      roles,
      collections: this.config.collections
        .filter((c) => governed(c.slug))
        .map((c) => ({
          slug: c.slug,
          ops: ROLE_OPERATIONS.filter((op) => op !== 'publish' || c.drafts === true),
          new: !seen('collections', c.slug),
          references: [...references(c.fields)].filter((s) => s !== c.slug && governed(s)),
        })),
      globals: this.config.globals.map((g) => ({
        slug: g.slug,
        ops: GLOBAL_OPERATIONS.filter((op) => op !== 'publish' || g.drafts === true),
        new: !seen('globals', g.slug),
      })),
      views: this.views(),
    }
  }

  async create(
    input: { key?: unknown; name?: unknown; permissions?: unknown },
    author: AuthUser,
  ): Promise<AdminRole> {
    await this.sync()
    const key = typeof input.key === 'string' ? input.key.trim() : ''
    if (!KEY.test(key)) {
      throw new ValidationError(ROLES, [
        { field: 'key', message: 'lowercase letters, digits and "-", starting with a letter' },
      ])
    }
    if ((await this.rows()).some((r) => r.key === key))
      throw new ValidationError(ROLES, [{ field: 'key', message: 'is already used' }])
    const row = await this.insert(
      key,
      this.cleanName(input.name),
      this.clean(input.permissions),
      author.id,
    )
    return this.toRole(row, 0)
  }

  async update(
    id: ID,
    input: { name?: unknown; permissions?: unknown },
    author: AuthUser,
  ): Promise<AdminRole> {
    const row = await this.row(id)
    const data: RawDocument = { ...row, updatedAt: new Date().toISOString() }
    if (input.name !== undefined) data.name = this.cleanName(input.name)
    if (input.permissions !== undefined) {
      if (row.key === 'admin')
        throw new EasyCMSError('Admins may always do everything; their role cannot be changed', 400)
      data.permissions = this.clean(input.permissions)
    }
    const { id: _id, ...rest } = data
    const saved = await this.db.update({ collection: ROLES, id: row.id, data: rest })
    await this.record(saved, author.id)
    this.invalidate()
    return this.toRole(saved, await this.users(String(row.key)))
  }

  async delete(id: ID): Promise<void> {
    const row = await this.row(id)
    const key = String(row.key)
    if (this.config.auth.roles.includes(key))
      throw new EasyCMSError(`"${key}" is in auth.roles and cannot be deleted`, 400)
    const users = await this.users(key)
    if (users > 0)
      throw new EasyCMSError(`${users} user(s) have this role; give them another role first`, 409)
    await this.db.delete({ collection: ROLES, id: row.id })
    await this.versions.deleteAll(ROLES, row.id)
    this.invalidate()
  }

  async history(id: ID): Promise<AdminRoleChange[]> {
    const row = await this.row(id)
    const list = await this.versions.list(ROLES, row.id, HISTORY, 1)
    const emails = new Map<string, string | null>()
    const out: AdminRoleChange[] = []
    for (const summary of list.docs) {
      const version = await this.versions.get(ROLES, row.id, summary.id)
      if (!version) continue
      let author: string | null = null
      if (summary.author !== null) {
        const k = String(summary.author)
        if (!emails.has(k)) {
          const user = await this.db.findById({ collection: USERS, id: summary.author })
          emails.set(k, typeof user?.email === 'string' ? user.email : null)
        }
        author = emails.get(k) ?? null
      }
      out.push({
        id: summary.id,
        author,
        createdAt: summary.createdAt,
        name: String(version.data.name ?? ''),
        permissions: (version.data.permissions ?? {}) as RolePermissions,
      })
    }
    return out
  }

  // -------------------------------------------------------------------------

  /** Pages and panels roles can be given. */
  private views(): AdminRoleView[] {
    return [
      { id: 'status' },
      ...(this.config.collections.some(
        (c) => c.slug === WEBHOOK_DELIVERIES || c.slug === EMAIL_DELIVERIES,
      )
        ? [{ id: 'deliveries' }]
        : []),
      ...this.config.admin.pages.map((page) => ({ id: viewId.page(page.path), label: page.label })),
      ...this.config.admin.dashboard.map((widget) => ({
        id: viewId.widget(tagOf(widget.component)),
        ...(widget.label !== undefined ? { label: widget.label } : {}),
      })),
    ]
  }

  /** Every collection and global, and the plugin pages and panels: what roles had before roles. */
  private everything(): RolePermissions {
    const collections: Record<string, RoleOperation[]> = {}
    for (const c of this.config.collections) {
      if (governed(c.slug))
        collections[c.slug] = ROLE_OPERATIONS.filter((op) => op !== 'publish' || c.drafts === true)
    }
    const globals: Record<string, RoleOperation[]> = {}
    for (const g of this.config.globals)
      globals[g.slug] = GLOBAL_OPERATIONS.filter((op) => op !== 'publish' || g.drafts === true)
    const admin = this.views()
      .map((v) => v.id)
      .filter((id) => id.startsWith('page:') || id.startsWith('widget:'))
    return { collections, globals, admin }
  }

  /** Keeps only known collections, globals, operations and pages; `read` comes with the others. */
  private clean(value: unknown): RolePermissions {
    const input = (typeof value === 'object' && value !== null ? value : {}) as Record<
      string,
      unknown
    >
    const pick = (
      group: unknown,
      allowed: Map<string, readonly RoleOperation[]>,
    ): Record<string, RoleOperation[]> => {
      const out: Record<string, RoleOperation[]> = {}
      if (typeof group !== 'object' || group === null) return out
      for (const [slug, ops] of Object.entries(group)) {
        const valid = allowed.get(slug)
        if (!valid || !Array.isArray(ops)) continue
        const picked = valid.filter((op) => ops.includes(op))
        if (picked.length > 0 && !picked.includes('read')) picked.unshift('read')
        out[slug] = picked
      }
      return out
    }
    const collections = new Map(
      this.config.collections
        .filter((c) => governed(c.slug))
        .map((c) => [
          c.slug,
          ROLE_OPERATIONS.filter((op) => op !== 'publish' || c.drafts === true),
        ]),
    )
    const globals = new Map(
      this.config.globals.map((g) => [
        g.slug,
        GLOBAL_OPERATIONS.filter((op) => op !== 'publish' || g.drafts === true),
      ]),
    )
    const views = new Set(this.views().map((v) => v.id))
    const admin = Array.isArray(input.admin)
      ? [
          ...new Set(
            input.admin.filter((id): id is string => typeof id === 'string' && views.has(id)),
          ),
        ]
      : []
    return {
      collections: pick(input.collections, collections),
      globals: pick(input.globals, globals),
      admin,
    }
  }

  private cleanName(value: unknown): string {
    if (value === undefined || value === null) return ''
    if (typeof value !== 'string' || value.trim().length > 60)
      throw new ValidationError(ROLES, [
        { field: 'name', message: 'must be at most 60 characters' },
      ])
    return value.trim()
  }

  private async permissionsOf(key: string): Promise<RolePermissions> {
    return (await this.load()).get(key) ?? {}
  }

  private async load(): Promise<Map<string, RolePermissions>> {
    if (this.cache && Date.now() - this.cache.at < TTL) return this.cache.byKey
    await this.sync()
    const byKey = new Map<string, RolePermissions>()
    for (const row of await this.rows())
      byKey.set(String(row.key), (row.permissions ?? {}) as RolePermissions)
    this.cache = { at: Date.now(), byKey }
    return byKey
  }

  private async rows(): Promise<RawDocument[]> {
    return (await this.db.find({ collection: ROLES, sort: ['id'], limit: 0, page: 1 })).docs
  }

  private async row(id: ID): Promise<RawDocument> {
    const row = await this.db.findById({ collection: ROLES, id })
    if (!row) throw new NotFoundError(ROLES, id)
    return row
  }

  private users(key: string): Promise<number> {
    return this.db.count({ collection: USERS, where: { role: { equals: key } } })
  }

  private async insert(
    key: string,
    name: string,
    permissions: RolePermissions,
    author: ID | null,
  ): Promise<RawDocument> {
    const now = new Date().toISOString()
    const row = await this.db.create({
      collection: ROLES,
      data: { key, name, permissions, createdAt: now, updatedAt: now },
    })
    await this.record(row, author)
    this.invalidate()
    return row
  }

  /** Keeps the role as saved, for its history. */
  private async record(row: RawDocument, author: ID | null) {
    await this.versions.save({
      parent: ROLES,
      doc: row.id,
      status: null,
      snapshot: { name: row.name ?? '', permissions: row.permissions ?? {} },
      author,
      max: HISTORY,
    })
  }

  private toRole(row: RawDocument, users: number): AdminRole {
    const key = String(row.key)
    return {
      id: row.id,
      key,
      name: typeof row.name === 'string' ? row.name : '',
      system: this.config.auth.roles.includes(key),
      users,
      permissions: (row.permissions ?? {}) as RolePermissions,
      updatedAt: String(row.updatedAt),
    }
  }
}

/** Roles from the config first, in their order; then the others. */
function rank(role: { key: string }, config: ResolvedConfig): number {
  const index = config.auth.roles.indexOf(role.key)
  return index === -1 ? config.auth.roles.length : index
}
