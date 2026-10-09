'use client'

import { ShopProvider } from '@easy-cms/plugin-ecommerce/react'
import type { ReactNode } from 'react'

/** The shop for every page: the cart, the customer and checkout, over /api/cms. */
export function Providers({ children }: { children: ReactNode }) {
  return <ShopProvider locale="th">{children}</ShopProvider>
}
