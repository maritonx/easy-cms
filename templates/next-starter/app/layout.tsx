import { getEasyCMS } from '@easy-cms/next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import config from '@/easy-cms.config'
import './globals.css'

// Every page reads from the CMS at request time; nothing is prerendered at build.
export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const site = await (await getEasyCMS(config)).findGlobal('site')
  return { title: site.siteName ?? 'Easy CMS Starter' }
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const site = await (await getEasyCMS(config)).findGlobal('site')
  return (
    <html lang="en">
      <body>
        <div className="page">
          <header>
            <Link href="/" className="brand">
              {site.siteName}
            </Link>
            {site.tagline ? <p>{site.tagline}</p> : null}
          </header>
          <main>{children}</main>
          <footer>
            Powered by <a href="https://github.com/maritonx/easy-cms">Easy CMS</a> ·{' '}
            <a href="/admin">Admin</a> · <a href="/api/cms/posts">REST API</a>
          </footer>
        </div>
      </body>
    </html>
  )
}
