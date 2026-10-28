// For checking the Perf workflow itself: with PERF_SLOWDOWN_MS, requests that find posts by slug
// wait that long first, so a run can show that a slowdown in one kind of request fails it.
import type { Config } from '@easy-cms/core'

export function slowdown(): Pick<Config, 'onRequest'> {
  const ms = Number(process.env.PERF_SLOWDOWN_MS ?? 0)
  if (!ms) return {}
  return {
    onRequest: async ({ url }) => {
      if (url?.searchParams.has('where[slug][equals]'))
        await new Promise((resolve) => setTimeout(resolve, ms))
      return undefined
    },
  }
}
