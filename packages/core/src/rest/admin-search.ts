import type { AuthUser, ID, RequestContext, Where } from '../access.js'
import { INTERNAL_COLLECTIONS, MEDIA_FOLDERS } from '../builtins.js'
import type { CollectionConfig } from '../config.js'
import { TRIGRAM_LIKE_MIN } from '../fields.js'
import type { EasyCMS } from '../local-api.js'

type Who = { user: AuthUser; context: RequestContext }

/** Collections the menu and search show: not internal, not the folders of the media library. */
const listed = (cms: EasyCMS) =>
  cms.config.collections.filter(
    (c) => !INTERNAL_COLLECTIONS.has(c.slug) && c.slug !== MEDIA_FOLDERS,
  )

/** Whether `who` may read a collection at all (a read that finds nothing still counts). */
async function readable(cms: EasyCMS, c: CollectionConfig, who: Who): Promise<boolean> {
  try {
    await cms.count(c.slug, { ...who, overrideAccess: false, where: { id: { exists: false } } })
    return true
  } catch {
    return false
  }
}

/** Counts stop here: a list or menu shows "10,000+" (#279) instead of counting every row. */
export const LIST_TOTAL_MAX = 10_000

/** How long the menu's numbers are kept per user (#283). */
export const MENU_COUNTS_TTL = 30_000

export interface AdminCounts {
  counts: Record<string, number>
  badges: Record<string, number>
  /** Collections with more than `LIST_TOTAL_MAX`: their count is that much. */
  more: string[]
}

/** The numbers kept per instance, by user and request context. */
const kept = new WeakMap<EasyCMS, Map<string, { at: number; value: AdminCounts }>>()

/**
 * The menu's numbers: documents per collection (drafts too, up to `LIST_TOTAL_MAX`) and
 * `admin.badge` counts, for what the user may read. Kept 30 s per user; `fresh` counts again,
 * after the user created or deleted something.
 */
export async function adminCounts(
  cms: EasyCMS,
  who: Who,
  options: { fresh?: boolean } = {},
): Promise<AdminCounts> {
  // The context decides what a user may read (e.g. the tenant chosen), so it is part of the key.
  const key = `${String(who.user.id)}:${who.user.apiKey ? 'key' : 'user'}:${JSON.stringify(who.context)}`
  const cache = kept.get(cms) ?? new Map<string, { at: number; value: AdminCounts }>()
  kept.set(cms, cache)
  const now = Date.now()
  const hit = cache.get(key)
  if (hit && !options.fresh && now - hit.at < MENU_COUNTS_TTL) return hit.value

  const counts: Record<string, number> = {}
  const badges: Record<string, number> = {}
  const more: string[] = []
  await Promise.all(
    listed(cms).map(async (c) => {
      const read = { ...who, overrideAccess: false, draft: true } as const
      try {
        if (c.admin?.count !== false) {
          const total = await cms.count(c.slug, { ...read, max: LIST_TOTAL_MAX })
          counts[c.slug] = Math.min(total, LIST_TOTAL_MAX)
          if (total > LIST_TOTAL_MAX) more.push(c.slug)
        }
        if (c.admin?.badge)
          badges[c.slug] = await cms.count(c.slug, {
            ...read,
            where: c.admin.badge.where as Where,
            max: LIST_TOTAL_MAX,
          })
      } catch {
        // Not readable for this user: no number.
      }
    }),
  )
  const value = { counts, badges, more }
  for (const [k, entry] of cache) if (now - entry.at >= MENU_COUNTS_TTL) cache.delete(k)
  cache.set(key, { at: now, value })
  return value
}

export interface SearchHit {
  readonly collection: string
  readonly id: ID
  readonly title: string
  readonly status?: string
}

/**
 * Documents whose title (`useAsTitle`) contains `q`, a few per collection the user may read: the
 * command palette's results. Numbers also find documents by id. Collections with `search` (and
 * the config's `search` adapter) list the search index's best matches first.
 */
export async function adminSearch(
  cms: EasyCMS,
  who: Who,
  q: string,
  perCollection = 5,
): Promise<SearchHit[]> {
  const query = q.trim().slice(0, 100)
  if (query.length < 1) return []
  const results = await Promise.all(
    listed(cms).map(async (c): Promise<SearchHit[]> => {
      const title = c.useAsTitle ?? (c.fields.some((f) => f.name === 'title') ? 'title' : undefined)
      const conditions: Where[] = []
      // A title with a trigram index needs three characters (`like` refuses fewer).
      const short =
        c.fields.find((f) => f.name === title)?.index === 'trigram' &&
        [...query].length < TRIGRAM_LIKE_MIN
      if (title && !short) conditions.push({ [title]: { like: query } })
      if (/^\d+$/.test(query)) conditions.push({ id: { equals: Number(query) } })
      const indexed = cms.config.search !== undefined && c.search !== undefined
      if ((conditions.length === 0 && !indexed) || !(await readable(cms, c, who))) return []
      try {
        const ranked = indexed
          ? (
              await cms.search(query, {
                ...who,
                overrideAccess: false,
                depth: 0,
                limit: perCollection,
                collections: [c.slug],
              })
            ).hits.map((hit) => hit.doc)
          : []
        // Drafts aren't in the index: titles still find them.
        const found =
          conditions.length === 0
            ? { docs: [] }
            : await cms.find(c.slug, {
                ...who,
                overrideAccess: false,
                draft: true,
                depth: 0,
                limit: perCollection,
                where: conditions.length === 1 ? (conditions[0] as Where) : { or: conditions },
                sort: '-updatedAt',
              })
        const seen = new Set<unknown>()
        const docs = [...ranked, ...(found.docs as Record<string, unknown>[])]
          .filter((doc) => !seen.has(doc.id) && seen.add(doc.id))
          .slice(0, perCollection)
        return docs.map((doc) => {
          const d = doc as Record<string, unknown>
          const value = title ? d[title] : undefined
          return {
            collection: c.slug,
            id: d.id as ID,
            title: typeof value === 'string' && value ? value : `#${String(d.id)}`,
            ...(typeof d.status === 'string' ? { status: d.status } : {}),
          }
        })
      } catch {
        return []
      }
    }),
  )
  return results.flat()
}
