import { reactive } from 'vue'
import { api } from './api'

/** Documents per collection (drafts included), for the menu and the dashboard. */
export const counts = reactive<Record<string, number>>({})
/** What needs attention per collection (`admin.badge`), for the menu. */
export const badges = reactive<Record<string, number>>({})

let last = 0

/** Refreshes the numbers; at most every few seconds, since every page change asks. */
export async function refreshCounts(force = false) {
  const now = Date.now()
  if (!force && now - last < 3000) return
  last = now
  try {
    const result = await api<{ counts: Record<string, number>; badges: Record<string, number> }>(
      'GET',
      '/admin/counts',
    )
    Object.assign(counts, result.counts)
    for (const key of Object.keys(badges)) if (!(key in result.badges)) delete badges[key]
    Object.assign(badges, result.badges)
  } catch {
    // Keep the last known numbers.
  }
}
