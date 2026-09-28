import { getEasyCMS } from '@easy-cms/next'
import { sitemapXml } from '@easy-cms/plugin-seo'
import config from '@/easy-cms.config'

export const dynamic = 'force-dynamic'

// /sitemap.xml for search engines: published posts in Thai and English, from the SEO
// plugin's generateURL. Drafts and posts marked "Hide from search engines" are left out.
// (A site with a fixed address can use app/sitemap.ts with `sitemap(cms)` instead.)
export async function GET(request: Request) {
  const url = new URL(request.url)
  const xml = await sitemapXml(await getEasyCMS(config), {
    siteUrl: url.origin,
    page: url.searchParams.get('page'),
  })
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8' } })
}
