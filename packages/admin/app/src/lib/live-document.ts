import { onBeforeUnmount, type Ref, ref, watch } from 'vue'
import type { Doc, Id } from './api'
import { type LiveChange, type LiveStream, liveStream } from './realtime'

/**
 * The edit page and the drawer, live (ADR-0070): another save of the document loads silently when
 * the form has no unsaved changes, and otherwise asks; a delete or a lost read access says so.
 *
 * Saves from this page are told apart by content: changes wait while the page saves (or loads),
 * then the document is read again as the page reads it and compared with the form's baseline,
 * which the save set. A draft's `updatedAt` as read differs from what the save returned, so it
 * can't be matched; it only skips changes older than what the page has.
 */
export interface LiveDocumentOptions {
  slug: string
  /** The document, once there is one (`null` while creating). */
  id: () => Id | null | undefined
  /** The collection has `realtime: true`. */
  enabled: boolean
  draft: boolean
  /** The form has unsaved changes. */
  dirty: () => boolean
  /** The page is saving or loading: changes wait until it is done. */
  busy: () => boolean
  /** The form's baseline: what was loaded or saved last, as a snapshot. */
  baseline: () => string
  /** When what the page shows was saved. */
  updatedAt: () => unknown
  /** Reads the document as the page does. */
  read: () => Promise<Doc>
  /** A document's form values, as a snapshot comparable with `baseline`. */
  snapshotOf: (doc: Doc) => string
  /** Loads the document into the page. */
  reload: () => Promise<void>
  stream?: LiveStream
}

export interface LiveDocument {
  /** Loaded silently from another save: "Updated from the latest save". */
  updated: Ref<boolean>
  /** Saved elsewhere while the form had unsaved changes: the newer version, until chosen. */
  conflict: Ref<Doc | null>
  /** Saving overwrites a newer version: ask first. */
  confirmOverwrite: Ref<boolean>
  /** Deleted, or no longer readable: saving is off. */
  gone: Ref<'deleted' | 'hidden' | null>
  /** "Load new version (discard mine)". */
  loadNewer(): Promise<void>
  /** "Keep mine": the banner goes; saving still asks first. */
  keepMine(): void
  /** Saved (over the newer version, if confirmed). */
  saved(): void
}

const after = (a: unknown, b: unknown) => {
  const x = typeof a === 'string' || a instanceof Date ? new Date(a).getTime() : Number.NaN
  const y = typeof b === 'string' || b instanceof Date ? new Date(b).getTime() : Number.NaN
  return Number.isNaN(x) || Number.isNaN(y) ? true : x > y
}

export function useLiveDocument(options: LiveDocumentOptions): LiveDocument {
  const updated = ref(false)
  const conflict = ref<Doc | null>(null)
  const confirmOverwrite = ref(false)
  const gone = ref<'deleted' | 'hidden' | null>(null)
  /** Changes not looked at yet: the last one is enough. */
  let waiting: LiveChange | null = null
  let checking = false
  let stop: (() => void) | null = null

  async function check() {
    if (checking || !waiting) return
    if (options.busy()) return
    const change = waiting
    waiting = null
    if (change.event === 'delete' || change.event === 'leave') {
      gone.value = change.event === 'delete' ? 'deleted' : 'hidden'
      conflict.value = null
      updated.value = false
      return
    }
    // Older than (or as old as) what the page has.
    if (gone.value === null && change.doc && !after(change.doc.updatedAt, options.updatedAt()))
      return
    checking = true
    try {
      const doc = await options.read()
      // The page saved meanwhile: look again once it is done.
      if (options.busy()) {
        waiting ??= change
        return
      }
      gone.value = null
      if (options.snapshotOf(doc) === options.baseline()) return
      if (options.dirty()) {
        conflict.value = doc
        confirmOverwrite.value = true
        updated.value = false
      } else {
        await options.reload()
        confirmOverwrite.value = false
        updated.value = true
      }
    } catch {
      // Unreadable now: a `leave` or `delete` follows if it is.
    } finally {
      checking = false
      if (waiting) void check()
    }
  }

  function onEvent(change: LiveChange) {
    waiting = change
    void check()
  }

  watch(options.busy, (busy) => {
    if (!busy) void check()
  })
  // Editing again: the note has done its job.
  watch(options.dirty, (dirty) => {
    if (dirty) updated.value = false
  })

  if (options.enabled)
    watch(
      options.id,
      (id) => {
        stop?.()
        stop = null
        if (id === null || id === undefined) return
        stop = (options.stream ?? liveStream()).subscribe(
          { collection: options.slug, id, ...(options.draft ? { draft: true } : {}) },
          {
            onEvent,
            // Missed changes: read it again.
            onReset: () => onEvent({ event: 'update', collection: options.slug, id, replay: true }),
          },
        )
      },
      { immediate: true },
    )
  onBeforeUnmount(() => stop?.())

  return {
    updated,
    conflict,
    confirmOverwrite,
    gone,
    async loadNewer() {
      conflict.value = null
      confirmOverwrite.value = false
      await options.reload()
      updated.value = true
    },
    keepMine() {
      conflict.value = null
    },
    saved() {
      conflict.value = null
      confirmOverwrite.value = false
      updated.value = false
    },
  }
}
