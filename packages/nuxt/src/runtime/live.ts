import type {
  ClientCollection,
  ClientDocument,
  ClientSchema,
  EasyCMSClient,
  LiveHandle,
  LiveQuery,
} from '@easy-cms/core/client'
import {
  type MaybeRefOrGetter,
  onBeforeUnmount,
  onMounted,
  type Ref,
  ref,
  shallowRef,
  toValue,
  watch,
} from 'vue'

/** `useLive()`'s state, as refs. */
export interface LiveRefs<T> {
  readonly docs: Ref<readonly T[]>
  /** With `id`: the document, `null` when there is none (or it can't be read). */
  readonly doc: Ref<T | null>
  /** The first load is done. */
  readonly ready: Ref<boolean>
  readonly error: Ref<Error | null>
}

/**
 * A list (or one document, with `id`) of a collection with `realtime: true`, kept up to date in
 * the browser: loaded through the client, then changed by what others save (ADR-0070). A
 * reactive `query` subscribes again when it changes; `initial` shows until the first load.
 *
 * ```ts
 * const cms = createClient<typeof config>({ url: '/api/cms' })
 * const { docs: posts } = useLive(cms, 'posts', { where: { status: { equals: 'published' } } })
 * ```
 */
export function useLive<C extends ClientSchema, S extends ClientCollection<C>>(
  client: EasyCMSClient<C>,
  collection: S,
  query: MaybeRefOrGetter<LiveQuery> = {},
  initial?: readonly ClientDocument<C, S>[] | ClientDocument<C, S> | null,
): LiveRefs<ClientDocument<C, S>> {
  type T = ClientDocument<C, S>
  const first: T[] = initial === undefined || initial === null ? [] : ([initial].flat() as T[])
  const docs = shallowRef(first) as Ref<readonly T[]>
  const doc = shallowRef(
    toValue(query).id === undefined ? null : (first[0] ?? null),
  ) as Ref<T | null>
  const ready = ref(false)
  const error = shallowRef(null) as Ref<Error | null>
  let handle: LiveHandle | undefined
  const start = () => {
    handle?.close()
    handle = client.live(collection, toValue(query), (state) => {
      docs.value = state.docs
      doc.value = state.doc
      ready.value = state.ready
      error.value = state.error
    })
  }
  onMounted(() => {
    start()
    watch(() => JSON.stringify(toValue(query)), start)
  })
  onBeforeUnmount(() => handle?.close())
  return { docs, doc, ready, error }
}
