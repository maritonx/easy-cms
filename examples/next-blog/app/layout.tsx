import { getEasyCMS } from '@easy-cms/next'
import { jsonLdScript, siteJsonLd } from '@easy-cms/plugin-seo'
import { headers } from 'next/headers'
import Link from 'next/link'
import type { ReactNode } from 'react'
import config from '@/easy-cms.config'
import './globals.css'

// Every page reads from the CMS at request time; nothing is prerendered at build.
export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const cms = await getEasyCMS(config)
  const site = await cms.findGlobal('site')
  return { title: site.siteName ?? 'Blog' }
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const cms = await getEasyCMS(config)
  const site = await cms.findGlobal('site')
  const request = await headers()
  const origin = `${request.get('x-forwarded-proto') ?? 'http'}://${request.get('host')}`
  // Who publishes the site, for search engines: Organization and WebSite JSON-LD.
  const organization = siteJsonLd({ name: site.siteName ?? 'Blog', url: origin })
  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: jsonLdScript escapes "<"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(organization) }}
        />
        <div className="page">
          <header>
            <Link href="/" className="brand">
              {site.siteName}
            </Link>
            {site.tagline ? <p>{site.tagline}</p> : null}
          </header>
          <main>{children}</main>
          <footer>
            Powered by Easy CMS · <a href="/api/cms/posts">REST API</a> ·{' '}
            <Link href="/contact">Contact</Link>
          </footer>
        </div>
      </body>
    </html>
  )
}
