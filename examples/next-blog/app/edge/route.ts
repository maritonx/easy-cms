import { createClient } from '@easy-cms/core/client'
import type config from '@/easy-cms.config'

// Easy CMS itself can't run on the edge (it needs Node.js for the database and files), but its
// REST client can: this route reads the same posts over the site's own API. (A route, not a
// page: the pages share a layout that reads with the Local API, which needs Node.js.)
export const runtime = 'edge'

export async function GET(request: Request) {
  const cms = createClient<typeof config>({ url: new URL('/api/cms', request.url).href })
  // Anonymous requests read published posts only.
  const { docs } = await cms.find('posts', {
    sort: '-publishedAt',
    limit: 20,
    depth: 0,
    fetch: { next: { revalidate: 60 } },
  })
  return Response.json({
    runtime: typeof EdgeRuntime === 'string' ? EdgeRuntime : 'nodejs',
    posts: docs.map((post) => ({ title: post.title, slug: post.slug })),
  })
}

declare const EdgeRuntime: string | undefined
