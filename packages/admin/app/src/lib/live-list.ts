import type { LiveChange } from './realtime'

/**
 * What a list does with a change (ADR-0070): rows it shows change in place (`refresh`), or are
 * greyed out when deleted (`deleted`); anything that would add, move or remove rows is counted
 * for "N changes — Show" (`pending`) rather than moving rows under the cursor.
 */
export type ListReaction = 'refresh' | 'deleted' | 'pending' | 'ignore'

export function listReaction(change: LiveChange, shown: (id: string) => boolean): ListReaction {
  const isShown = shown(String(change.id))
  if (isShown) {
    if (change.event === 'delete') return 'deleted'
    // It no longer matches the list's filters or the user's access: it leaves on Show.
    if (change.event === 'leave') return 'pending'
    return 'refresh'
  }
  // Not on this page: a delete or leave changes nothing shown. A replay may be from before the
  // list loaded, so it isn't counted.
  if (change.event === 'delete' || change.event === 'leave' || change.replay) return 'ignore'
  return 'pending'
}
