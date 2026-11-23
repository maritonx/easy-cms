'use client'

import { useShop } from '@easy-cms/plugin-ecommerce/react'
import { useEffect } from 'react'

/** Tells Tag Manager the product was seen (GA4 `view_item`). */
export function ViewItem(props: { id: string | number; title: string; price: number | null }) {
  const shop = useShop()
  const { id, title, price } = props
  useEffect(() => shop.viewItem({ id, title, price }), [shop, id, title, price])
  return null
}
