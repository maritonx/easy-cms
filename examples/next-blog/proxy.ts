import { getEasyCMS } from '@easy-cms/next'
import { resolveRedirect } from '@easy-cms/plugin-redirects'
import { type NextRequest, NextResponse } from 'next/server'
import cmsConfig from './easy-cms.config'

// Redirects from the admin (Settings → Redirects), and old addresses of renamed posts.
// Next.js 16 runs the proxy (formerly middleware) on Node.js, so it can use the Local API.
export async function proxy(request: NextRequest) {
  const redirect = await resolveRedirect(await getEasyCMS(cmsConfig), request.nextUrl)
  if (redirect)
    return NextResponse.redirect(new URL(redirect.location, request.url), redirect.status)
}

// The CMS and Next.js's own files don't need a lookup.
export const config = { matcher: ['/((?!api/|admin|_next/|favicon.ico).*)'] }
