import { findByPath } from '@easy-cms/plugin-nested-docs'

// One page by its full path (`?path=/about/team`), in Thai or English (`?locale=en`). Logged-in
// editors can preview drafts, like posts.
export default defineEventHandler(async (event) => {
  const cms = await useEasyCMS()
  const user = await useEasyCMSUser(event)
  const query = getQuery(event)
  const page = await findByPath(cms, 'pages', String(query.path ?? '/'), {
    locale: query.locale === 'en' ? 'en' : 'th',
    overrideAccess: false,
    user,
    draft: user !== null,
  })
  if (!page) throw createError({ statusCode: 404, statusMessage: 'Page not found' })
  return page
})
