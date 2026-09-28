import { robotsTxt } from '@easy-cms/plugin-seo'
import config from '@/easy-cms.config'

export const dynamic = 'force-dynamic'

// /robots.txt: keeps crawlers out of the admin and the API, and points them to the sitemap.
export function GET(request: Request) {
  const text = robotsTxt({ config, siteUrl: new URL(request.url).origin })
  return new Response(text, { headers: { 'content-type': 'text/plain; charset=utf-8' } })
}
