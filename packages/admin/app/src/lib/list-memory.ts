/**
 * Where each list was left (its filters, page and scroll), so going back from a document returns
 * to it. Kept for this browser tab.
 */
interface Left {
  path: string
  /** The page's scroll, and the table's own (it scrolls under its sticky header, #281). */
  scroll: number
  table?: number
}

const key = (slug: string) => `easy-cms-list:${slug}`

export function leaveList(slug: string, path: string, table = 0) {
  try {
    sessionStorage.setItem(key(slug), JSON.stringify({ path, scroll: window.scrollY, table }))
  } catch {
    // Not kept.
  }
}

function left(slug: string): Left | null {
  try {
    return JSON.parse(sessionStorage.getItem(key(slug)) ?? 'null') as Left | null
  } catch {
    return null
  }
}

/**
 * The list as it was left, for back links; the plain list otherwise, or when what was kept isn't
 * that list (versions before 1.2 could keep the document's own address).
 */
export function listPath(slug: string): string {
  const list = `/collections/${slug}`
  const path = left(slug)?.path
  return path && path.split('?')[0] === list ? path : list
}

/** Where to scroll a list shown again as it was left; `null` for a fresh one. */
export function scrollFor(slug: string, path: string): { page: number; table: number } | null {
  const was = left(slug)
  return was && was.path === path ? { page: was.scroll, table: was.table ?? 0 } : null
}
