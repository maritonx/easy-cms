import type { AuthUser, ID, RequestContext, Where } from '../access.js'
import { INTERNAL_COLLECTIONS, MEDIA_FOLDERS } from '../builtins.js'
import type { CollectionConfig } from '../config.js'
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

/**
 * The menu's numbers: documents per collection (drafts too) and `admin.badge` counts, for what
 * the user may read.
 */
export async function adminCounts(
  cms: EasyCMS,
  who: Who,
): Promise<{ counts: Record<string, number>; badges: Record<string, number> }> {
  const counts: Record<string, number> = {}
  const badges: Record<string, number> = {}
  await Promise.all(
    listed(cms).map(async (c) => {
      const read = { ...who, overrideAccess: false, draft: true } as const
      try {
        if (c.admin?.count !== false) counts[c.slug] = await cms.count(c.slug, read)
        if (c.admin?.badge)
          badges[c.slug] = await cms.count(c.slug, { ...read, where: c.admin.badge.where as Where })
      } catch {
        // Not readable for this user: no number.
      }
    }),
  )
  return { counts, badges }
}

export interface SearchHit {
  readonly collection: string
  readonly id: ID
  readonly title: string
  readonly status?: string
}

/**
 * Documents whose title (`useAsTitle`) contains `q`, a few per collection the user may read: the
 * command palette's results. Numbers also find documents by id.
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
      if (title) conditions.push({ [title]: { like: query } })
      if (/^\d+$/.test(query)) conditions.push({ id: { equals: Number(query) } })
      if (conditions.length === 0 || !(await readable(cms, c, who))) return []
      try {
        const found = await cms.find(c.slug, {
          ...who,
          overrideAccess: false,
          draft: true,
          depth: 0,
          limit: perCollection,
          where: conditions.length === 1 ? (conditions[0] as Where) : { or: conditions },
          sort: '-updatedAt',
        })
        return found.docs.map((doc) => {
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
