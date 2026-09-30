import type { AccessOptions } from '@easy-cms/core'
import {
  type Doc,
  type ID,
  idOf,
  localApi,
  type NestedCMS,
  nestedOf,
  normalizePath,
} from './shared.js'
import { hasTrail, liveChildren, liveDoc, trailOf } from './tree.js'

export interface FindByPathOptions extends AccessOptions {
  /** The content locale of the path. Default: the default locale. */
  readonly locale?: string
  /** Include drafts (for previews). Default false: published pages only. */
  readonly draft?: boolean
  /** Relationship levels to populate. Default 1. */
  readonly depth?: number
}

/**
 * The page at a path, e.g. `findByPath(cms, 'pages', '/about/team')`, or `null`. The path is
 * the page's own: take the locale prefix or other routing off first.
 */
export async function findByPath(
  instance: NestedCMS,
  collection: string,
  path: string,
  options: FindByPathOptions = {},
): Promise<Doc | null> {
  const cms = localApi(instance)
  const { nested } = nestedOf(cms, collection)
  const found = await cms.find(collection, {
    ...options,
    where: { [nested.pathField]: { equals: normalizePath(path) } },
    limit: 1,
  })
  return found.docs[0] ?? null
}

/** A page in `getTree()`: what a menu or sidebar needs, and the pages under it. */
export interface TreeNode {
  readonly id: ID
  readonly title: string
  readonly slug: string
  readonly path: string | null
  readonly children: TreeNode[]
}

export interface GetTreeOptions extends AccessOptions {
  readonly locale?: string
  /** Levels to include, e.g. 2 for a menu with one level of submenus. Default: all. */
  readonly depth?: number
}

/**
 * Published pages as a tree, top-level pages first, in the list's order (`admin.list.sort`,
 * else by title). Pages under an unpublished page are left out with it.
 */
export async function getTree(
  instance: NestedCMS,
  collection: string,
  options: GetTreeOptions = {},
): Promise<TreeNode[]> {
  const cms = localApi(instance)
  const { nested } = nestedOf(cms, collection)
  const { docs } = await cms.find(collection, {
    ...options,
    limit: 0,
    depth: 0,
    sort: nested.sort,
  })
  const nodes = new Map<string, TreeNode>()
  for (const doc of docs) {
    const text = (value: unknown) => (typeof value === 'string' ? value : '')
    nodes.set(String(doc.id), {
      id: doc.id as ID,
      title: text(doc[nested.titleField]) || text(doc[nested.slugField]),
      slug: text(doc[nested.slugField]),
      path: text(doc[nested.pathField]) || null,
      children: [],
    })
  }
  const roots: TreeNode[] = []
  for (const doc of docs) {
    const node = nodes.get(String(doc.id)) as TreeNode
    const parentId = idOf(doc[nested.parentField])
    if (parentId === null) roots.push(node)
    else nodes.get(String(parentId))?.children.push(node)
  }
  const max = options.depth ?? Number.POSITIVE_INFINITY
  const cut = (list: TreeNode[], level: number): TreeNode[] =>
    list.map((node) => ({ ...node, children: level < max ? cut(node.children, level + 1) : [] }))
  return cut(roots, 1)
}

/**
 * Works out every page's breadcrumbs and path again, from the top level down, and saves the
 * pages whose values changed. For pages that existed before the plugin, or to repair them.
 * Pages whose parent was deleted move to the top level.
 */
export async function rebuildNestedDocs(
  instance: NestedCMS,
  collection: string,
): Promise<{ checked: number; updated: number }> {
  const cms = localApi(instance)
  const { source, nested } = nestedOf(cms, collection)
  const snapshot = async () => {
    const docs = await liveChildren(cms, source, nested, undefined)
    return new Map(
      docs.map((d) => [
        String(d.id),
        JSON.stringify([d[nested.pathField], stripIds(d[nested.breadcrumbsField])]),
      ]),
    )
  }
  const before = await snapshot()
  const seen = new Set<string>()
  const visit = async (docs: Doc[], parent: Doc | null) => {
    for (const listed of docs) {
      const id = listed.id as ID
      if (seen.has(String(id))) continue
      seen.add(String(id))
      const trail = await trailOf(cms, source, nested, listed, id, parent)
      let doc = listed
      if (!hasTrail(source, nested, listed, trail)) {
        await cms.update(collection, id, {}, { live: true })
        doc = (await liveDoc(cms, source, nested, id)) ?? listed
      }
      await visit(await liveChildren(cms, source, nested, id), doc)
    }
  }
  await visit(await liveChildren(cms, source, nested, null), null)

  // Pages not reached from the top: their parent is gone, so they move to the top level.
  for (const doc of await liveChildren(cms, source, nested, undefined)) {
    if (seen.has(String(doc.id))) continue
    const parentId = idOf(doc[nested.parentField])
    if (parentId !== null && (await liveDoc(cms, source, nested, parentId))) continue
    await cms.update(collection, doc.id as ID, { [nested.parentField]: null }, { live: true })
  }

  const after = await snapshot()
  let updated = 0
  for (const [id, value] of after) if (before.get(id) !== value) updated++
  return { checked: after.size, updated }
}

/** Breadcrumb rows without their row ids, which change on every save. */
function stripIds(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map((row) => {
      const { id: _id, ...rest } = row as Doc
      return rest
    })
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, stripIds(v)]))
  return value
}
