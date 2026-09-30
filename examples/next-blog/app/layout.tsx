import { getEasyCMS } from '@easy-cms/next'
import { getTree } from '@easy-cms/plugin-nested-docs'
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
  // Pages and the pages under them, from the nested docs plugin.
  const menu = await getTree(cms, 'pages', { depth: 2 })
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
            {menu.length > 0 ? (
              <nav aria-label="Pages" className="menu">
                <ul>
                  {menu.map((item) => (
                    <li key={item.id}>
                      <Link href={item.path ? `/p${item.path}` : '/'}>{item.title}</Link>
                      {item.children.length > 0 ? (
                        <ul>
                          {item.children.map((child) => (
                            <li key={child.id}>
                              <Link href={child.path ? `/p${child.path}` : '/'}>{child.title}</Link>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}
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
