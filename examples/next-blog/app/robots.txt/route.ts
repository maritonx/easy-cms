import { robotsTxt } from '@easy-cms/plugin-seo'
import config from '@/easy-cms.config'

export const dynamic = 'force-dynamic'

// /robots.txt: keeps crawlers out of the admin and the API, and points them to the sitemap.
export function GET(request: Request) {
  const text = robotsTxt({
    config,
    siteUrl: new URL(request.url).origin,
    // AI training crawlers stay out; AI search and assistants may still read and cite posts.
    ai: { training: false },
  })
  return new Response(text, { headers: { 'content-type': 'text/plain; charset=utf-8' } })
}
