import { resolveRedirect } from '@easy-cms/plugin-redirects'

// Redirects from the admin (Settings → Redirects), and old addresses of renamed posts.
export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)
  // Nuxt's own files and the CMS don't need a lookup.
  if (/^\/(_nuxt|api|admin)(\/|$)/.test(url.pathname)) return
  const redirect = await resolveRedirect(await useEasyCMS(), url)
  if (redirect) return sendRedirect(event, redirect.location, redirect.status)
})
