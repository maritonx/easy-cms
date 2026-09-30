import { getTree } from '@easy-cms/plugin-nested-docs'

// The site's menu: published pages and the pages under them, in Thai or English (`?locale=en`).
export default defineEventHandler(async (event) => {
  const cms = await useEasyCMS()
  return getTree(cms, 'pages', { locale: getQuery(event).locale === 'en' ? 'en' : 'th', depth: 2 })
})
