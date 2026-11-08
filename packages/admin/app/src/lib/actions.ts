// Actions (#386): a collection's own buttons. Pressing one asks for its form or a confirmation
// when it has one, runs it on the server, and says what it did. Shared by the edit page, the
// list's row menu and the bar of selected documents.
import type { AdminAction } from '@easy-cms/core'
import { ref, shallowRef } from 'vue'
import { ApiError, api, type Id } from './api'
import { type BulkOperation, type BulkResult, trackBulk } from './bulk-tasks'
import { label, t } from './i18n'
import { notify } from './toast'

type Where = Record<string, unknown>
/** What an action runs on: a document, selected ones, or every document matching a list. */
export type ActionTarget = { id: Id } | { ids: Id[] } | { where: Where; count: number }

/** The action waiting for its form or confirmation. */
export interface PendingAction {
  action: AdminAction
  target: ActionTarget
  /** For bulk: how many documents it will run on. */
  count?: number
}

export const actionLabel = (action: AdminAction) => label(action.label, action.name)

/** The open document's actions, for ⌘K: set by its edit page while it is shown. */
export const pageActions = shallowRef<{ name: string; label: string; run: () => void }[]>([])

/**
 * Runs actions of a collection; `after` reloads what they may have changed. `pending` is the
 * action whose dialog is open; `errors` are its form's.
 */
export function useActions(slug: () => string, after: () => void | Promise<void>) {
  const pending = ref<PendingAction | null>(null)
  const errors = ref<Record<string, string[]>>({})
  const busy = ref(false)

  /** Presses an action: a dialog first when it has a form, asks to confirm, or runs in bulk. */
  function start(action: AdminAction, target: ActionTarget) {
    errors.value = {}
    const bulk = !('id' in target)
    if (action.fields?.length || action.confirm || bulk) {
      pending.value = {
        action,
        target,
        ...(bulk ? { count: 'ids' in target ? target.ids.length : target.count } : {}),
      }
      return
    }
    void run(action, target, {})
  }

  async function run(action: AdminAction, target: ActionTarget, input: Record<string, unknown>) {
    busy.value = true
    errors.value = {}
    const name = encodeURIComponent(action.name)
    try {
      if ('id' in target) {
        const result = await api<{ message?: string; open?: string }>(
          'POST',
          `/${slug()}/${encodeURIComponent(String(target.id))}/actions/${name}`,
          { input },
        )
        const open = result.open
        notify('success', result.message ?? t('actions.done', { action: actionLabel(action) }), {
          ...(open
            ? {
                action: {
                  label: t('actions.open'),
                  run: () => window.open(open, '_blank', 'noopener'),
                },
                ms: 15_000,
              }
            : {}),
        })
      } else if ('ids' in target) {
        const result = await api<BulkResult>('POST', `/${slug()}/actions/${name}`, {
          ids: target.ids,
          input,
        })
        if (result.skipped.length === 0 && result.failed.length === 0)
          notify(
            'success',
            t('actions.doneMany', { action: actionLabel(action), count: result.done }),
          )
        else
          notify(
            'error',
            t('bulk.summary', {
              done: result.done,
              skipped: result.skipped.length,
              failed: result.failed.length,
            }),
          )
      } else {
        trackBulk(
          await api<BulkOperation>('POST', `/${slug()}/actions/${name}`, {
            where: target.where,
            input,
          }),
        )
        notify('success', t('list.bulkStarted'))
      }
      pending.value = null
    } catch (e) {
      // The form's mistakes stay in its dialog; anything else is a message.
      if (e instanceof ApiError && pending.value && Object.keys(e.fieldErrors).length) {
        errors.value = e.fieldErrors
        return
      }
      pending.value = null
      notify(
        'error',
        e instanceof ApiError && e.status === 403 ? t('common.forbidden') : (e as Error).message,
      )
    } finally {
      busy.value = false
    }
    await after()
  }

  /** The dialog's answer. */
  const submit = (input: Record<string, unknown>) => {
    if (pending.value) void run(pending.value.action, pending.value.target, input)
  }
  const cancel = () => {
    pending.value = null
    errors.value = {}
  }

  return { pending, errors, busy, start, submit, cancel }
}
