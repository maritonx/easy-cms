import { api, type Paginated, toQuery } from './api'
import { session } from './session'

type Id = number | string

/** What the user may do in a folder: see its files, change them, or also its subfolders. */
export type FolderLevel = 'view' | 'edit' | 'manage'

/** A media folder (`upload.folders`) as the API returns it. */
export interface Folder {
  id: Id
  name: string
  parent: Id | null
  /** Each role's level, or `null` to follow the parent; only admins see it. */
  permissions?: Record<string, FolderLevel> | null
  /** For code: upload fields' `folder`. */
  key?: string | null
  /** Its files and subfolders are private. */
  private?: boolean | null
  level: FolderLevel
}

/** An upload field's folder (`folder`), and whether only it may be used (`folderOnly`). */
export interface FieldFolder {
  id: Id
  only: boolean
}

export interface FolderNode extends Folder {
  children: FolderNode[]
}

export interface FolderTree {
  roots: FolderNode[]
  byId: Map<string, FolderNode>
}

/** The media library has folders. */
export const foldersOn = () => !!session.schema?.folders

const RANK: Record<FolderLevel, number> = { view: 1, edit: 2, manage: 3 }
export const atLeast = (level: FolderLevel | undefined, need: FolderLevel) =>
  !!level && RANK[level] >= RANK[need]

/** Every folder the user may see, 100 at a time. */
export async function loadFolders(): Promise<Folder[]> {
  const out: Folder[] = []
  for (let page = 1; ; page++) {
    const found = await api<Paginated<Folder>>(
      'GET',
      `/media-folders${toQuery({ limit: 100, page, sort: 'name', depth: 0 })}`,
    )
    out.push(...found.docs.map((f) => ({ ...f, parent: f.parent ?? null })))
    if (!found.hasNextPage) return out
  }
}

/** Folders as a tree. One whose parent the user can't see is shown at the top. */
export function buildTree(folders: readonly Folder[]): FolderTree {
  const byId = new Map<string, FolderNode>()
  for (const f of folders) byId.set(String(f.id), { ...f, children: [] })
  const roots: FolderNode[] = []
  for (const node of byId.values()) {
    const parent = node.parent === null ? undefined : byId.get(String(node.parent))
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  const sort = (list: FolderNode[]) => {
    list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    for (const n of list) sort(n.children)
  }
  sort(roots)
  return { roots, byId }
}

/** The folders from the top down to this one, as far up as the user can see. */
export function pathTo(tree: FolderTree, id: Id | null): FolderNode[] {
  const out: FolderNode[] = []
  const seen = new Set<string>()
  let node = id === null ? undefined : tree.byId.get(String(id))
  while (node && !seen.has(String(node.id))) {
    seen.add(String(node.id))
    out.unshift(node)
    node = node.parent === null ? undefined : tree.byId.get(String(node.parent))
  }
  return out
}

/** The folder and every folder inside it. */
export function within(tree: FolderTree, id: Id): Id[] {
  const out: Id[] = []
  const walk = (node: FolderNode | undefined) => {
    if (!node || out.includes(node.id)) return
    out.push(node.id)
    for (const child of node.children) walk(child)
  }
  walk(tree.byId.get(String(id)))
  return out
}

/** The query for the files in a folder (`null`: at the top), or also in its subfolders. */
export function folderWhere(tree: FolderTree, id: Id | null, deep: boolean) {
  if (id === null) return deep ? undefined : { folder: { exists: false } }
  return deep ? { folder: { in: within(tree, id).join(',') } } : { folder: { equals: id } }
}

const LAST = 'easy-cms-media-folder'
/** The folder the user last worked in, so the picker opens there. */
export function lastFolder(): string | null {
  try {
    return localStorage.getItem(LAST)
  } catch {
    return null
  }
}
export function rememberFolder(id: Id | null) {
  try {
    if (id === null) localStorage.removeItem(LAST)
    else localStorage.setItem(LAST, String(id))
  } catch {
    // private mode: the picker opens at the top
  }
}

/** Whether files in a folder are private: it, or a folder above it, is. */
export function privateAt(tree: FolderTree, id: Id | null): boolean {
  return pathTo(tree, id).some((node) => node.private === true)
}
