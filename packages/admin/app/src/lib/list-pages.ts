// Pages of a large list (#279): the page size, the page links, and the cursors behind Next.

export const PAGE_SIZES = [20, 50, 100] as const
const SIZE_KEY = 'easy-cms-page-size'

/** The page size chosen in this browser (20 until one is). */
export function storedPageSize(): number {
  try {
    const n = Number(localStorage.getItem(SIZE_KEY))
    return (PAGE_SIZES as readonly number[]).includes(n) ? n : PAGE_SIZES[0]
  } catch {
    return PAGE_SIZES[0]
  }
}

export function storePageSize(size: number) {
  try {
    localStorage.setItem(SIZE_KEY, String(size))
  } catch {
    // private mode: for this page only
  }
}

/** A list's total from `/admin/ui/total`: exact up to 10,000, then `more`. */
export interface ListTotal {
  total: number
  more: boolean
}

/** The pages a total spans: `null` until it is known. Past 10,000, as many as are counted. */
export function knownPages(total: ListTotal | null, size: number): number | null {
  return total ? Math.max(1, Math.ceil(total.total / size)) : null
}

/**
 * The page links: the first, the current with one either side, and the last when it is known
 * (`last` null: the total is still loading, or there are more than were counted). `'gap'` marks
 * pages left out.
 */
export function pageLinks(
  current: number,
  last: number | null,
  hasNext: boolean,
): (number | 'gap')[] {
  const end = last ?? (hasNext ? current + 1 : current)
  const shown = new Set<number>([1, current])
  if (current > 1) shown.add(current - 1)
  if (current < end) shown.add(current + 1)
  if (last !== null) shown.add(last)
  const pages = [...shown]
    .filter((n) => n >= 1 && n <= Math.max(end, current))
    .sort((a, b) => a - b)
  const links: (number | 'gap')[] = []
  for (const n of pages) {
    const previous = links.at(-1)
    if (typeof previous === 'number' && n - previous > 1) links.push('gap')
    links.push(n)
  }
  return links
}

/**
 * Where each page of one query starts, by cursor: page 1 from the start, then the `nextCursor` of
 * the page before. Next and Previous go by cursor, which stays fast deep in a large list; a page
 * reached otherwise (a link, "go to page") is read by number.
 */
export class PageCursors {
  private key = ''
  private cursors = new Map<number, string>()

  /** Forgets the cursors when the query (filters, sort, page size) changes. */
  use(key: string) {
    if (key === this.key) return
    this.key = key
    this.cursors = new Map([[1, '']])
  }

  get(page: number): string | undefined {
    return this.cursors.get(page)
  }

  /** The cursor of the page after `page`. */
  set(page: number, next: string | null) {
    if (next) this.cursors.set(page + 1, next)
  }

  /** This query can't go by cursor (the server refused one): pages by number only. */
  disable() {
    this.cursors = new Map()
  }
}
