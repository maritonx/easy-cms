/** Collections with a place of their own in the menu and dashboard: folders are in Media. */
export const listed = (c: { slug: string }) => c.slug !== 'media-folders'

/**
 * Collections in menu order: those listed in `admin.menu` first, in that order; the rest in
 * config order, with the media library last.
 */
export function menuOrder<T extends { slug: string }>(
  list: readonly T[],
  menu: readonly string[] = [],
): T[] {
  const rank = (item: T, index: number) => {
    const listed = menu.indexOf(item.slug)
    if (listed !== -1) return listed
    return menu.length + (item.slug === 'media' ? list.length : 0) + index
  }
  return list
    .map((item, index) => ({ item, key: rank(item, index) }))
    .sort((a, b) => a.key - b.key)
    .map(({ item }) => item)
}
