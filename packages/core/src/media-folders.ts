import type { AuthUser, ID, Where } from './access.js'
import { MEDIA, MEDIA_FOLDERS } from './builtins.js'
import type { ResolvedConfig } from './config.js'
import type { Database } from './database.js'
import { ForbiddenError, ValidationError } from './errors.js'
import type { Roles } from './roles.js'

/** What a role may do in a folder (`upload.folders` with `auth.rbac`), each including the last. */
export const FOLDER_LEVELS = ['view', 'edit', 'manage'] as const
/**
 * `view`: see its files and use them in documents. `edit`: also upload, rename, move and delete
 * files. `manage`: also create, rename, move and delete subfolders.
 */
export type FolderLevel = (typeof FOLDER_LEVELS)[number]
/** A folder's `permissions`: each role's level; roles not listed get nothing. */
export type FolderPermissions = Readonly<Record<string, FolderLevel>>

const RANK: Record<FolderLevel | 'none', number> = { none: 0, view: 1, edit: 2, manage: 3 }
const TTL = 10_000

interface FolderRow {
  id: ID
  parent: ID | null
  name: string
  key: string | null
  /** Set on the folder itself; its subfolders are private too. */
  private: boolean
  permissions: FolderPermissions | null
  /** The whole document, for fields keys are unique within (`uniqueWithin`, e.g. the tenant). */
  doc: Record<string, unknown>
}

/** Files that are not private; files from before private folders have no value. */
export const PUBLIC_FILES: Where = {
  or: [{ private: { equals: false } }, { private: { exists: false } }],
}

/** The folders an API key is limited to (`permissions.folders`), with their subfolders. */
function keyFolders(user: AuthUser | null): readonly ID[] | undefined {
  const key = user?.apiKey as { permissions?: { folders?: readonly ID[] } } | undefined
  const folders = key?.permissions?.folders
  return folders && folders.length > 0 ? folders : undefined
}

/** The level an operation needs: on files (`media`) or on folders themselves. */
function needed(collection: string, operation: string): FolderLevel {
  if (operation === 'read') return 'view'
  return collection === MEDIA ? 'edit' : 'manage'
}

/**
 * Folders of the media library and their permissions. A folder without its own permissions
 * follows its parent; the top level is open to every role that may use `media`. Folder
 * permissions only narrow what roles may do with `media`, for signed-in users (not API keys).
 */
export class MediaFolders {
  readonly enabled: boolean
  private cache: { at: number; rows: Map<string, FolderRow> } | undefined

  constructor(
    config: ResolvedConfig,
    private readonly db: Database,
    private readonly roles: Roles,
  ) {
    this.enabled = config.upload.folders
  }

  /** Whether folder permissions apply to this user. */
  applies(user: AuthUser | null): user is AuthUser {
    return this.enabled && this.roles.enabled && !!user && user.role !== 'admin' && !user.apiKey
  }

  /** Forgets cached folders, after one changed. */
  invalidate(): void {
    this.cache = undefined
  }

  private async rows(): Promise<Map<string, FolderRow>> {
    if (this.cache && Date.now() - this.cache.at < TTL) return this.cache.rows
    const found = await this.db.find({ collection: MEDIA_FOLDERS, sort: [], limit: 0, page: 1 })
    const rows = new Map<string, FolderRow>()
    for (const doc of found.docs) {
      const permissions = doc.permissions
      rows.set(String(doc.id), {
        id: doc.id,
        parent: (doc.parent as ID | null | undefined) ?? null,
        name: String(doc.name ?? ''),
        key: typeof doc.key === 'string' && doc.key ? doc.key : null,
        private: doc.private === true,
        permissions:
          permissions && typeof permissions === 'object' && !Array.isArray(permissions)
            ? (permissions as FolderPermissions)
            : null,
        doc,
      })
    }
    this.cache = { at: Date.now(), rows }
    return rows
  }

  /** A role's level in a folder (`null`: the top level): the nearest permissions up the tree. */
  private levelIn(rows: Map<string, FolderRow>, role: string, id: ID | null): FolderLevel | 'none' {
    const seen = new Set<string>()
    let current = id === null ? undefined : rows.get(String(id))
    while (current && !seen.has(String(current.id))) {
      seen.add(String(current.id))
      if (current.permissions) {
        const level = current.permissions[role]
        return level && level in RANK ? level : 'none'
      }
      current = current.parent === null ? undefined : rows.get(String(current.parent))
    }
    return 'manage'
  }

  /** Whether files in a folder (`null`: the top level) are private: it or a folder above is. */
  private privateIn(rows: Map<string, FolderRow>, id: ID | null): boolean {
    const seen = new Set<string>()
    let current = id === null ? undefined : rows.get(String(id))
    while (current && !seen.has(String(current.id))) {
      if (current.private) return true
      seen.add(String(current.id))
      current = current.parent === null ? undefined : rows.get(String(current.parent))
    }
    return false
  }

  /** Whether files put in this folder are private. */
  async isPrivate(id: ID | null): Promise<boolean> {
    if (!this.enabled || id === null) return false
    return this.privateIn(await this.rows(), id)
  }

  /** The folder and every folder inside it. */
  private within(rows: Map<string, FolderRow>, ids: readonly ID[]): ID[] {
    const out = new Set(ids.map(String))
    let grew = true
    while (grew) {
      grew = false
      for (const row of rows.values())
        if (row.parent !== null && out.has(String(row.parent)) && !out.has(String(row.id))) {
          out.add(String(row.id))
          grew = true
        }
    }
    return [...rows.values()].filter((r) => out.has(String(r.id))).map((r) => r.id)
  }

  /** Folders whose privacy follows this one: it and those inside, with their privacy now. */
  async subtree(id: ID): Promise<{ id: ID; private: boolean }[]> {
    const rows = await this.fresh()
    return this.within(rows, [id]).map((f) => ({ id: f, private: this.privateIn(rows, f) }))
  }

  /**
   * The privacy each folder of a subtree would have after a change to its top folder: made
   * private or public, moved, or (as `private: false`) deleted with its contents moving up.
   */
  async privacyAfter(
    id: ID,
    change: { private?: boolean; parent?: ID | null },
  ): Promise<{ id: ID; private: boolean }[]> {
    const rows = new Map(await this.fresh())
    const row = rows.get(String(id))
    if (!row) return []
    rows.set(String(id), {
      ...row,
      ...(change.private !== undefined ? { private: change.private } : {}),
      ...(change.parent !== undefined ? { parent: change.parent } : {}),
    })
    return this.within(rows, [id]).map((f) => ({ id: f, private: this.privateIn(rows, f) }))
  }

  /**
   * The folder with this key (`folder: 'banners'` on upload fields), made at the top level when
   * there is none yet.
   */
  /**
   * The folder with this key, made when first needed. `scope`: the values the key is unique
   * within (`uniqueWithin` of the `key` field, e.g. the tenant), given to a new folder too.
   * `null` when there is none and `create` is false.
   */
  async keyed(key: string, scope?: Readonly<Record<string, unknown>>): Promise<ID>
  async keyed(
    key: string,
    scope: Readonly<Record<string, unknown>>,
    create: boolean,
  ): Promise<ID | null>
  async keyed(
    key: string,
    scope: Readonly<Record<string, unknown>> = {},
    create = true,
  ): Promise<ID | null> {
    const find = async () =>
      [...(await this.rows()).values()].find((r) => r.key === key && inScope(r.doc, scope))
    let found = await find()
    if (!found) {
      // Maybe made since the folders were read.
      this.invalidate()
      found = await find()
    }
    if (found) return found.id
    if (!create) return null
    const now = new Date().toISOString()
    try {
      const doc = await this.db.create({
        collection: MEDIA_FOLDERS,
        data: {
          name: key,
          key,
          parent: null,
          permissions: null,
          private: false,
          ...scope,
          createdAt: now,
          updatedAt: now,
        },
      })
      this.invalidate()
      return doc.id
    } catch (error) {
      // Made at the same time by another request.
      this.invalidate()
      const again = await find()
      if (again) return again.id
      throw error
    }
  }

  /** Whether a file in `folder` is in the folder with this key, or below it. */
  async inKeyed(
    key: string,
    folder: ID | null,
    scope: Readonly<Record<string, unknown>> = {},
  ): Promise<boolean> {
    if (folder === null) return false
    const rows = await this.rows()
    const root = [...rows.values()].find((r) => r.key === key && inScope(r.doc, scope))
    return !!root && this.within(rows, [root.id]).some((id) => String(id) === String(folder))
  }

  /** The user's level in a folder (`null`: the top level). */
  async level(user: AuthUser | null, id: ID | null): Promise<FolderLevel | 'none'> {
    if (!this.applies(user)) return 'manage'
    return this.levelIn(await this.rows(), user.role, id)
  }

  /**
   * The constraint folder permissions add to an operation on files or folders, or `true` when
   * they add none (no folder limits this user).
   */
  async where(user: AuthUser | null, collection: string, operation: string): Promise<true | Where> {
    if (!this.enabled || (collection !== MEDIA && collection !== MEDIA_FOLDERS)) return true
    // Not signed in: no private files.
    if (!user) return collection === MEDIA ? PUBLIC_FILES : true
    // API keys limited to some folders: those and their subfolders, nothing at the top level.
    const limited = keyFolders(user)
    if (limited) {
      const ids = this.within(await this.rows(), limited)
      if (collection === MEDIA_FOLDERS) return { id: { in: ids } }
      return operation === 'create' ? true : { folder: { in: ids } }
    }
    if (!this.applies(user)) return true
    if (operation === 'create') return true
    const need = RANK[needed(collection, operation)]
    const rows = await this.rows()
    const allowed: ID[] = []
    let all = true
    for (const row of rows.values()) {
      if (RANK[this.levelIn(rows, user.role, row.id)] >= need) allowed.push(row.id)
      else all = false
    }
    if (all) return true
    if (collection === MEDIA_FOLDERS) return { id: { in: allowed } }
    const outside: Where = { folder: { exists: false } }
    return allowed.length === 0 ? outside : { or: [{ folder: { in: allowed } }, outside] }
  }

  /** Refuses putting a file (`media`) or a subfolder in a folder the user may not. */
  async checkTarget(user: AuthUser | null, collection: string, folder: ID | null): Promise<void> {
    const limited = keyFolders(user)
    if (limited) {
      const ids = this.within(await this.rows(), limited).map(String)
      if (folder === null || !ids.includes(String(folder)))
        throw new ForbiddenError('This API key may not add to this folder')
      return
    }
    if (!this.applies(user)) return
    const need = collection === MEDIA ? 'edit' : 'manage'
    if (RANK[await this.level(user, folder)] < RANK[need])
      throw new ForbiddenError('You may not add to this folder')
  }

  /**
   * Checks a folder before it is saved: a name unique among its siblings (ignoring case), a
   * parent that is not itself or inside it, and permissions for roles that exist.
   */
  async validate(data: Record<string, unknown>, self: ID | undefined): Promise<void> {
    const rows = await this.fresh()
    const name = typeof data.name === 'string' ? data.name.trim() : ''
    const parent = (data.parent as ID | null | undefined) ?? null
    const errors: { field: string; message: string }[] = []
    if (parent !== null && self !== undefined) {
      let current = rows.get(String(parent))
      const seen = new Set<string>()
      while (current && !seen.has(String(current.id))) {
        if (String(current.id) === String(self)) {
          errors.push({ field: 'parent', message: 'cannot be the folder itself or inside it' })
          break
        }
        seen.add(String(current.id))
        current = current.parent === null ? undefined : rows.get(String(current.parent))
      }
    }
    const taken = [...rows.values()].some(
      (row) =>
        String(row.id) !== String(self) &&
        String(row.parent) === String(parent) &&
        row.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase(),
    )
    if (name && taken) errors.push({ field: 'name', message: 'is already used in this folder' })
    const permissions = data.permissions
    if (permissions !== null && permissions !== undefined) {
      const roles = new Set((await this.roles.options()).map((r) => r.key))
      if (typeof permissions !== 'object' || Array.isArray(permissions))
        errors.push({ field: 'permissions', message: 'must be null or roles with their levels' })
      else
        for (const [role, level] of Object.entries(permissions)) {
          if (!roles.has(role))
            errors.push({ field: 'permissions', message: `"${role}" is not a role` })
          else if (!(FOLDER_LEVELS as readonly unknown[]).includes(level))
            errors.push({
              field: 'permissions',
              message: `"${role}" must be one of ${FOLDER_LEVELS.join(', ')}`,
            })
        }
    }
    if (errors.length > 0) throw new ValidationError(MEDIA_FOLDERS, errors)
  }

  /**
   * Before a folder is deleted: its files and subfolders move up to its parent. Returns how many
   * moved.
   */
  async release(folder: { id: ID; parent?: unknown }): Promise<{ files: number; folders: number }> {
    const parent = (folder.parent as ID | null | undefined) ?? null
    const moved = { files: 0, folders: 0 }
    for (const [collection, field, key] of [
      [MEDIA, 'folder', 'files'],
      [MEDIA_FOLDERS, 'parent', 'folders'],
    ] as const) {
      const found = await this.db.find({
        collection,
        where: { [field]: { equals: folder.id } },
        sort: [],
        limit: 0,
        page: 1,
      })
      for (const doc of found.docs) {
        const { id, ...rest } = doc
        await this.db.update({ collection, id, data: { ...rest, [field]: parent } })
        moved[key]++
      }
    }
    this.invalidate()
    return moved
  }

  private async fresh(): Promise<Map<string, FolderRow>> {
    this.invalidate()
    return this.rows()
  }
}

/** Whether a folder row has these values (ids compared as strings). */
function inScope(row: Record<string, unknown>, scope: Readonly<Record<string, unknown>>) {
  return Object.entries(scope).every(([name, value]) =>
    value === null || value === undefined
      ? row[name] === null || row[name] === undefined
      : String(row[name]) === String(value),
  )
}
