import { reactive } from 'vue'
import { api, type Doc, type Paginated, toQuery } from './api'
import { titleOf } from './fields'
import { findCollection } from './session'

/** Titles of related documents, by `<collection>:<id>`, for filters that name them. */
export const relationTitles = reactive<Record<string, string>>({})

/** Fetches the titles of these documents that aren't known yet. */
export async function loadRelationTitles(to: string, ids: readonly string[]): Promise<void> {
  const missing = ids.filter((id) => !(`${to}:${id}` in relationTitles))
  if (missing.length === 0) return
  try {
    const found = await api<Paginated<Doc>>(
      'GET',
      `/${to}${toQuery({ where: { id: { in: missing.join(',') } }, limit: missing.length, depth: 0, draft: true })}`,
    )
    for (const doc of found.docs)
      relationTitles[`${to}:${String(doc.id)}`] = titleOf(findCollection(to), doc)
  } catch {
    // Unreadable or gone: shown by id.
  }
}

/** A related document's title, or `#<id>` until (or unless) it is known. */
export function relationTitle(to: string, id: string): string {
  return relationTitles[`${to}:${id}`] ?? `#${id}`
}
