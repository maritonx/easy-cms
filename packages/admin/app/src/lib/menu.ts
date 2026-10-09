import type { AdminNavNode } from '@easy-cms/core'
/** Collections with a place of their own in the menu and dashboard: folders are in Media. */
export const listed = (c: { slug: string }) => c.slug !== 'media-folders'

/** Collections in the menu's order; those not in the menu after, the media library last. */
export function menuOrder<T extends { slug: string }>(
  list: readonly T[],
  nav: readonly AdminNavNode[] = [],
): T[] {
  // Collections in the menu's order (`admin.order` and groups), the media library last.
  const order: string[] = []
  const walk = (nodes: readonly AdminNavNode[]) => {
    for (const node of nodes) {
      if (node.kind === 'group') walk(node.items)
      else if (node.kind === 'collection') order.push(node.slug)
    }
  }
  walk(nav)
  const rank = (item: T, index: number) => {
    const listed = order.indexOf(item.slug)
    if (listed !== -1) return listed
    return order.length + (item.slug === 'media' ? list.length : 0) + index
  }
  return list
    .map((item, index) => ({ item, key: rank(item, index) }))
    .sort((a, b) => a.key - b.key)
    .map(({ item }) => item)
}
