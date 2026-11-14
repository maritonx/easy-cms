import {
  createClient,
  EasyCMSClientError,
  type LiveEvent,
  type LiveSubscription,
  type SubscribeHandle,
  type SubscribeHandlers,
  type SubscribeOptions,
} from '@easy-cms/core/client'
import { type Ref, ref } from 'vue'
import type { Doc, Id } from './api'
import { settings } from './settings'

/**
 * Live updates in the admin (collections with `realtime: true`, ADR-0070): every view in a browser
 * tab shares one stream, `GET <api>/realtime` with one `s` per subscription. A stream's
 * subscriptions are fixed, so adding or removing one opens a new stream (debounced) that starts
 * after the old one's position (`Last-Event-ID`): nothing is missed in between.
 */

/** What a view follows: a collection (its documents matching `where`), or one document. */
export interface LiveTarget {
  collection: string
  id?: Id
  where?: Record<string, unknown>
  draft?: boolean
}

/** A change, as a view gets it. */
export interface LiveChange {
  event: 'create' | 'update' | 'delete' | 'publish' | 'unpublish' | 'leave'
  collection: string
  id: Id
  doc?: Doc
  /**
   * It came before this view's subscription was first on the stream: maybe from before the view
   * loaded (a new stream replays what came after the old one's position).
   */
  replay: boolean
}

export interface LiveListener {
  onEvent(change: LiveChange): void
  /** The stream couldn't resume (away too long): what the view shows may be out of date. */
  onReset?(): void
}

/**
 * `connecting`: opening; `live`: up; `down`: lost, reconnecting by itself; `off`: no subscriptions,
 * or the API refused them (it isn't retried until they change).
 */
export type LiveStatus = 'connecting' | 'live' | 'down' | 'off'

type Open = (
  subscriptions: readonly LiveSubscription<Record<string, never>>[],
  handlers: SubscribeHandlers<LiveEvent<Record<string, never>>>,
  options: SubscribeOptions,
) => SubscribeHandle

interface Entry {
  target: LiveTarget
  listener: LiveListener
  /** The stream was ready since this subscription was on it. */
  ready: boolean
}

/** The server's limit of subscriptions per stream. */
const MAX_SUBSCRIPTIONS = 20

/** A subscription's identity: views following the same thing share it on the stream. */
function keyOf(target: LiveTarget): string {
  return JSON.stringify([
    target.collection,
    target.id ?? null,
    target.where ?? null,
    !!target.draft,
  ])
}

export interface LiveStream {
  /** Follows `target` until the returned function is called. */
  subscribe(target: LiveTarget, listener: LiveListener): () => void
  status: Ref<LiveStatus>
  /** Opens or changes the stream now instead of after the debounce (tests). */
  flush(): void
}

/** One stream for many subscriptions, reopened when they change. */
export function createLiveStream(open: Open, debounceMs = 100): LiveStream {
  const entries = new Set<Entry>()
  const status = ref<LiveStatus>('off')
  let handle: SubscribeHandle | null = null
  let openKey = ''
  let lastEventId: string | undefined
  let timer: ReturnType<typeof setTimeout> | undefined

  function apply() {
    clearTimeout(timer)
    timer = undefined
    const targets = new Map<string, LiveTarget>()
    for (const entry of entries) targets.set(keyOf(entry.target), entry.target)
    const list = [...targets.values()].slice(0, MAX_SUBSCRIPTIONS)
    const key = JSON.stringify([...targets.keys()].slice(0, MAX_SUBSCRIPTIONS))
    if (key === openKey && handle) {
      // The same subscriptions (a second view on one already followed): already on the stream.
      if (status.value === 'live') for (const entry of entries) entry.ready = true
      return
    }
    if (handle) {
      lastEventId = handle.lastEventId ?? lastEventId
      handle.close()
      handle = null
    }
    openKey = key
    if (list.length === 0) {
      status.value = 'off'
      return
    }
    status.value = 'connecting'
    const current: SubscribeHandle = open(
      list.map((target) => ({
        collection: target.collection,
        ...(target.id !== undefined ? { id: target.id } : {}),
        ...(target.where ? { where: target.where } : {}),
        ...(target.draft ? { draft: true } : {}),
        depth: 0,
      })) as never,
      {
        onReady: () => {
          if (handle !== current) return
          status.value = 'live'
          for (const entry of entries) entry.ready = true
        },
        onReset: () => {
          if (handle !== current) return
          for (const entry of [...entries]) entry.listener.onReset?.()
        },
        onEvent: (event) => {
          if (handle !== current) return
          const change = event as unknown as Omit<LiveChange, 'replay'>
          for (const entry of [...entries]) {
            const { target } = entry
            if (target.collection !== change.collection) continue
            if (target.id !== undefined && String(target.id) !== String(change.id)) continue
            entry.listener.onEvent({
              event: change.event,
              collection: change.collection,
              id: change.id,
              ...(change.doc ? { doc: change.doc } : {}),
              replay: !entry.ready,
            })
          }
        },
        onError: (error) => {
          if (handle !== current) return
          const refused =
            error instanceof EasyCMSClientError && [400, 401, 403, 404].includes(error.status)
          status.value = refused ? 'off' : 'down'
        },
      },
      lastEventId === undefined ? {} : { lastEventId },
    )
    handle = current
  }

  function schedule() {
    clearTimeout(timer)
    timer = setTimeout(apply, debounceMs)
  }

  return {
    status,
    flush: apply,
    subscribe(target, listener) {
      const entry: Entry = { target, listener, ready: false }
      entries.add(entry)
      schedule()
      return () => {
        if (!entries.delete(entry)) return
        schedule()
      }
    },
  }
}

let shared: LiveStream | null = null

/** The tab's stream, made when a view first follows something. */
export function liveStream(): LiveStream {
  if (!shared) {
    const client = createClient({
      url: settings.apiPath,
      fetchOptions: { credentials: 'same-origin' },
    })
    shared = createLiveStream((subscriptions, handlers, options) =>
      client.subscribe(subscriptions as never, handlers as never, options),
    )
  }
  return shared
}
