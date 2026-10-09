/**
 * Where each list was left (its filters, page and scroll), so going back from a document returns
 * to it. Kept for this browser tab.
 */
interface Left {
  path: string
  scroll: number
}

const key = (slug: string) => `easy-cms-list:${slug}`

export function leaveList(slug: string, path: string) {
  try {
    sessionStorage.setItem(key(slug), JSON.stringify({ path, scroll: window.scrollY }))
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

/** The list as it was left, for back links; the plain list otherwise. */
export const listPath = (slug: string) => left(slug)?.path ?? `/collections/${slug}`

/** Where to scroll a list shown again as it was left; `null` for a fresh one. */
export function scrollFor(slug: string, path: string): number | null {
  const was = left(slug)
  return was && was.path === path ? was.scroll : null
}
