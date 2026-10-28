// For checking the Perf workflow itself: with PERF_SLOWDOWN_QUERIES, each request that finds posts
// by slug runs the same query that many more times first, so a run can show that a slowdown in one
// kind of request fails it. A wait (setTimeout) would not do: with a steady number of requests in
// flight, time spent waiting for nothing replaces time waiting for a pool connection, and p95 stays
// put. Extra queries use what a real slowdown uses, the event loop and the pool.
import type { Config } from '@easy-cms/core'

export function slowdown(): Pick<Config, 'onRequest'> {
  const queries = Number(process.env.PERF_SLOWDOWN_QUERIES ?? 0)
  if (!queries) return {}
  return {
    onRequest: async ({ url, cms }) => {
      const slug = url?.searchParams.get('where[slug][equals]')
      if (slug)
        for (let i = 0; i < queries; i++)
          await cms.find('posts', { where: { slug: { equals: slug } }, limit: 1 })
      return undefined
    },
  }
}
