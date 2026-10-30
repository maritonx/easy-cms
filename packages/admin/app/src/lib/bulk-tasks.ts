// Bulk actions on every document matching a list's filters (#280): the operations the server runs
// in the background, followed here until they finish. Asking for progress also moves them on.
import { ref } from 'vue'
import { api, type Id } from './api'

export type BulkAction = 'publish' | 'unpublish' | 'delete' | 'move'

export interface BulkProblem {
  id: Id
  reason: 'forbidden' | 'not-found' | 'error'
  message?: string
}

export interface BulkOperation {
  id: Id
  collection: string
  action: BulkAction
  state: 'pending' | 'running' | 'cancelling' | 'done' | 'cancelled' | 'failed'
  total: number
  done: number
  skipped: number
  failed: number
  problems: BulkProblem[]
  error: string | null
  createdAt: string
  finishedAt: string | null
}

/** What a bulk action on named documents did. */
export interface BulkResult {
  done: number
  skipped: BulkProblem[]
  failed: BulkProblem[]
}

/** The most documents one operation may change, as the server allows. */
export const BULK_MAX = 10_000
/** Above this many, deleting asks for the number to be typed. */
export const TYPE_TO_DELETE = 100

const ACTIVE = new Set(['pending', 'running', 'cancelling'])
export const isActive = (op: BulkOperation) => ACTIVE.has(op.state)

/** The operations shown in the corner: running, and finished until dismissed. */
export const bulkTasks = ref<BulkOperation[]>([])

/** Lists listen for this to reload when an operation on their collection finishes. */
export const BULK_DONE = 'easy-cms:bulk-done'

let timer: ReturnType<typeof setTimeout> | undefined

function put(op: BulkOperation) {
  const i = bulkTasks.value.findIndex((t) => String(t.id) === String(op.id))
  const next = [...bulkTasks.value]
  if (i === -1) next.unshift(op)
  else next[i] = op
  bulkTasks.value = next
}

/** Follows a new operation until it finishes. */
export function trackBulk(op: BulkOperation) {
  put(op)
  if (!isActive(op)) window.dispatchEvent(new CustomEvent(BULK_DONE, { detail: op }))
  schedule()
}

function schedule() {
  clearTimeout(timer)
  if (bulkTasks.value.some(isActive)) timer = setTimeout(poll, 1200)
}

async function poll() {
  for (const op of bulkTasks.value.filter(isActive)) {
    try {
      const next = await api<BulkOperation>('GET', `/${op.collection}/bulk/${op.id}`)
      put(next)
      if (!isActive(next)) window.dispatchEvent(new CustomEvent(BULK_DONE, { detail: next }))
    } catch {
      // Tried again next time.
    }
  }
  schedule()
}

/** After a reload: the operations still running. */
export async function resumeBulk() {
  try {
    const { docs } = await api<{ docs: BulkOperation[] }>('GET', '/admin/ui/bulk')
    for (const op of docs.filter(isActive)) put(op)
    schedule()
  } catch {
    // Signed out, or an older server: nothing to follow.
  }
}

export async function cancelBulk(op: BulkOperation) {
  put(await api<BulkOperation>('POST', `/${op.collection}/bulk/${op.id}/cancel`))
  schedule()
}

export function dismissBulk(op: BulkOperation) {
  bulkTasks.value = bulkTasks.value.filter((t) => String(t.id) !== String(op.id))
}
