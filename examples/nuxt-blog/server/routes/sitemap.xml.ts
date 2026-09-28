import { sitemapXml } from '@easy-cms/plugin-seo'

// /sitemap.xml for search engines: published posts in Thai and English, from the SEO
// plugin's generateURL. Drafts and posts marked "Hide from search engines" are left out.
export default defineEventHandler(async (event) => {
  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  return sitemapXml(await useEasyCMS(), {
    siteUrl: getRequestURL(event).origin,
    page: getQuery(event).page as string | undefined,
  })
})
