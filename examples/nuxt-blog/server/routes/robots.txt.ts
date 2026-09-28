import { robotsTxt } from '@easy-cms/plugin-seo'

// /robots.txt: keeps crawlers out of the admin and the API, and points them to the sitemap.
export default defineEventHandler(async (event) => {
  const cms = await useEasyCMS()
  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  return robotsTxt({
    config: cms.config,
    siteUrl: getRequestURL(event).origin,
    // AI training crawlers stay out; AI search and assistants may still read and cite posts.
    ai: { training: false },
  })
})
