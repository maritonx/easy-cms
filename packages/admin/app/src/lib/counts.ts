import { reactive } from 'vue'
import { api, type Paginated } from './api'
import { listed } from './menu'
import { session } from './session'

/** Documents per collection (drafts included), for the menu and the dashboard. */
export const counts = reactive<Record<string, number>>({})

let last = 0

/** Refreshes the counts; at most every few seconds, since every page change asks. */
export async function refreshCounts(force = false) {
  const now = Date.now()
  if (!force && now - last < 3000) return
  last = now
  const collections =
    session.schema?.collections.filter((c) => c.permissions.read && listed(c)) ?? []
  await Promise.all(
    collections.map(async (c) => {
      try {
        const result = await api<Paginated<unknown>>('GET', `/${c.slug}?limit=1&depth=0&draft=true`)
        counts[c.slug] = result.totalDocs
      } catch {
        // leave the last known count
      }
    }),
  )
}
