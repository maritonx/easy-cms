import { reactive } from 'vue'
import { api, CONTENT_CHANGED } from './api'

/** Documents per collection (drafts included), for the menu and the dashboard. */
export const counts = reactive<Record<string, number>>({})
/** What needs attention per collection (`admin.badge`), for the menu. */
export const badges = reactive<Record<string, number>>({})
/** Collections with more documents than the server counts (#279): "10k+". */
export const more = reactive<Record<string, boolean>>({})

/** Past this the server stops counting. */
const COUNT_MAX = 10_000
/** The numbers are counted again this often while the admin is open (#283). */
const EVERY = 60_000

/** A count as the menu shows it: "10k+" above what the server counts. */
export function countText(value: number | undefined, over = false): string {
  if (value === undefined) return ''
  return over || value > COUNT_MAX ? `${COUNT_MAX / 1000}k+` : String(value)
}

let last = 0
let timer: ReturnType<typeof setInterval> | undefined
let changed: ReturnType<typeof setTimeout> | undefined

/**
 * Counts when the admin opens (`force`), every minute after, and after the user creates or
 * deletes (`fresh`: not the numbers the server keeps for 30 s). Other page changes don't count.
 */
export async function refreshCounts(options: { force?: boolean; fresh?: boolean } = {}) {
  start()
  const now = Date.now()
  if (!options.force && !options.fresh && now - last < EVERY) return
  last = now
  try {
    const result = await api<{
      counts: Record<string, number>
      badges: Record<string, number>
      more?: string[]
    }>('GET', `/admin/ui/counts${options.fresh ? '?fresh' : ''}`)
    Object.assign(counts, result.counts)
    for (const key of Object.keys(badges)) if (!(key in result.badges)) delete badges[key]
    Object.assign(badges, result.badges)
    for (const key of Object.keys(more)) delete more[key]
    for (const slug of result.more ?? []) more[slug] = true
  } catch {
    // Keep the last known numbers.
  }
}

/** The minute timer, and counting again after a change (several in a row count once). */
function start() {
  if (timer !== undefined || typeof window === 'undefined') return
  timer = setInterval(() => {
    if (document.visibilityState === 'visible') void refreshCounts()
  }, EVERY)
  window.addEventListener(CONTENT_CHANGED, () => {
    clearTimeout(changed)
    changed = setTimeout(() => void refreshCounts({ fresh: true }), 500)
  })
}
