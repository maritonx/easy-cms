import Link from 'next/link'
import type { ReactNode } from 'react'
import { CartLink } from './cart-link'
import { Providers } from './providers'
import './globals.css'

// Products and prices are read from the CMS at request time.
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Easy Shop' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th">
      <body>
        <Providers>
          <div className="page">
            <header>
              <Link href="/" className="brand">
                Easy Shop
              </Link>
              <nav>
                <Link href="/account">บัญชีของฉัน</Link>
                <CartLink />
              </nav>
            </header>
            <main>{children}</main>
            <footer>
              Powered by Easy CMS · <a href="/admin">Admin</a>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  )
}
