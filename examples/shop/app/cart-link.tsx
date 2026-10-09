'use client'

import { useCart } from '@easy-cms/plugin-ecommerce/react'
import Link from 'next/link'

export function CartLink() {
  const { cart } = useCart()
  return (
    <Link href="/cart" data-testid="cart-link">
      ตะกร้า ({cart?.count ?? 0})
    </Link>
  )
}
