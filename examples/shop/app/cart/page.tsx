'use client'

import { useCart, useCurrency } from '@easy-cms/plugin-ecommerce/react'
import Link from 'next/link'

export default function CartPage() {
  const { cart, loading, busy, incrementItem, decrementItem, removeItem } = useCart()
  const { formatPrice, currencies, setCurrency } = useCurrency()
  if (loading) return <p>กำลังโหลด…</p>
  if (!cart || cart.lines.length === 0)
    return (
      <>
        <h1>ตะกร้า</h1>
        <p>
          ยังไม่มีสินค้า · <Link href="/">เลือกซื้อ</Link>
        </p>
      </>
    )
  return (
    <>
      <h1>ตะกร้า</h1>
      <table className="lines">
        <tbody>
          {cart.lines.map((line) => (
            <tr key={line.id}>
              <td>
                {line.product.title}
                {line.variant ? ` (${line.variant.title})` : ''}
                {line.available ? null : <span className="warn"> · ซื้อไม่ได้ตอนนี้</span>}
              </td>
              <td className="qty">
                <button
                  type="button"
                  aria-label="ลด"
                  disabled={busy}
                  onClick={() => decrementItem(line.id)}
                >
                  −
                </button>
                <span>{line.quantity}</span>
                <button
                  type="button"
                  aria-label="เพิ่ม"
                  disabled={busy}
                  onClick={() => incrementItem(line.id)}
                >
                  +
                </button>
              </td>
              <td className="num">{formatPrice(line.total)}</td>
              <td>
                <button
                  type="button"
                  className="link"
                  disabled={busy}
                  onClick={() => removeItem(line.id)}
                >
                  ลบ
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          {cart.adjustments.map((a) => (
            <tr key={a.label}>
              <td colSpan={2}>{a.label}</td>
              <td className="num">{formatPrice(a.amount)}</td>
              <td />
            </tr>
          ))}
          <tr className="total">
            <td colSpan={2}>ยอดรวม</td>
            <td className="num" data-testid="cart-total">
              {formatPrice(cart.total)}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
      {currencies.length > 1 ? (
        <p>
          สกุลเงิน:{' '}
          <select value={cart.currency} onChange={(e) => void setCurrency(e.target.value)}>
            {currencies.map((c) => (
              <option key={c.code}>{c.code}</option>
            ))}
          </select>
        </p>
      ) : null}
      <p>
        <Link className="button" href="/checkout">
          ชำระเงิน
        </Link>
      </p>
    </>
  )
}
