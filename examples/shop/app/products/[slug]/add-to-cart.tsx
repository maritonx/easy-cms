'use client'

import { ShopError, useCart } from '@easy-cms/plugin-ecommerce/react'
import { useState } from 'react'

type ID = string | number

export function AddToCart(props: {
  product: ID
  variants: { id: ID; label: string; inventory: number | null }[]
  inventory: number | null
}) {
  const { addItem, busy } = useCart()
  const [variant, setVariant] = useState<ID | null>(props.variants[0]?.id ?? null)
  const [message, setMessage] = useState('')
  const chosen = props.variants.find((v) => v.id === variant)
  const left = props.variants.length ? (chosen?.inventory ?? null) : props.inventory

  async function add() {
    setMessage('')
    try {
      await addItem(props.product, { variant })
      setMessage('ใส่ตะกร้าแล้ว')
    } catch (error) {
      setMessage(
        error instanceof ShopError ? (error.errors[0]?.message ?? error.message) : 'ไม่สำเร็จ',
      )
    }
  }

  return (
    <div className="buy">
      {props.variants.length > 0 ? (
        <label>
          ตัวเลือก{' '}
          <select value={String(variant)} onChange={(e) => setVariant(Number(e.target.value))}>
            {props.variants.map((v) => (
              <option key={v.id} value={String(v.id)}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {left !== null ? <p className="muted">เหลือ {left} ชิ้น</p> : null}
      <button type="button" onClick={add} disabled={busy || left === 0}>
        {left === 0 ? 'สินค้าหมด' : 'ใส่ตะกร้า'}
      </button>
      <p role="status">{message}</p>
    </div>
  )
}
