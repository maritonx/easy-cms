import type {
  ClientCollection,
  ClientDocument,
  ClientSchema,
  EasyCMSClient,
  LiveQuery,
  LiveState,
} from '@easy-cms/core/client'
import { useEffect, useState } from 'react'

/**
 * A list (or one document, with `id`) of a collection with `realtime: true`, kept up to date in
 * a Client Component: loaded through the client, then changed by what others save (ADR-0070).
 * `initial` (e.g. what a Server Component loaded) shows until the first load.
 *
 * ```tsx
 * 'use client'
 * const cms = createClient<typeof config>({ url: '/api/cms' })
 * export function Posts({ posts }: { posts: Post[] }) {
 *   const { docs } = useLive(cms, 'posts', { where: { status: { equals: 'published' } } }, posts)
 *   return <ul>{docs.map((p) => <li key={p.id}>{p.title}</li>)}</ul>
 * }
 * ```
 */
export function useLive<C extends ClientSchema, S extends ClientCollection<C>>(
  client: EasyCMSClient<C>,
  collection: S,
  query: LiveQuery = {},
  initial?: readonly ClientDocument<C, S>[] | ClientDocument<C, S> | null,
): LiveState<ClientDocument<C, S>> {
  const [state, setState] = useState<LiveState<ClientDocument<C, S>>>(() => {
    const docs = initial === undefined || initial === null ? [] : [initial].flat()
    return {
      docs: docs as ClientDocument<C, S>[],
      doc: query.id === undefined ? null : ((docs[0] as ClientDocument<C, S>) ?? null),
      ready: false,
      error: null,
    }
  })
  // One subscription per collection and query, whatever object holds the query.
  const key = JSON.stringify([collection, query])
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for collection and query
  useEffect(() => {
    const handle = client.live(collection, query, setState)
    return () => handle.close()
  }, [client, key])
  return state
}
