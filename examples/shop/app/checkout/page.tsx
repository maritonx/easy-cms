'use client'

import {
  type CheckoutResult,
  ShopError,
  useCart,
  useCurrency,
  useCustomer,
  usePayments,
} from '@easy-cms/plugin-ecommerce/react'
import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'
import { StripePayment } from './stripe-payment'

const FIELDS = [
  ['name', 'ชื่อผู้รับ', true],
  ['phone', 'โทรศัพท์', false],
  ['line1', 'ที่อยู่', true],
  ['subdistrict', 'แขวง / ตำบล', false],
  ['district', 'เขต / อำเภอ', false],
  ['province', 'จังหวัด', false],
  ['postalCode', 'รหัสไปรษณีย์', false],
] as const

export default function CheckoutPage() {
  const router = useRouter()
  const { cart } = useCart()
  const { user } = useCustomer()
  const { formatPrice } = useCurrency()
  const { paymentMethods, checkout } = usePayments()
  const [method, setMethod] = useState('')
  const [error, setError] = useState('')
  const [card, setCard] = useState<CheckoutResult | null>(null)
  const chosen = method || paymentMethods[0]?.name || ''

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const form = new FormData(event.currentTarget)
    const address = Object.fromEntries(FIELDS.map(([name]) => [name, String(form.get(name) ?? '')]))
    try {
      const result = await checkout({
        method: chosen,
        ...(user ? {} : { email: String(form.get('email') ?? '') }),
        shippingAddress: { ...address, country: 'TH' },
      })
      // Bank transfer: the order exists, waiting for the money.
      if (result.order)
        router.push(
          `/checkout/done?order=${encodeURIComponent(result.order.orderNumber)}&instructions=${encodeURIComponent(String(result.payment.instructions ?? ''))}`,
        )
      else setCard(result)
    } catch (e) {
      setError(e instanceof ShopError ? (e.errors[0]?.message ?? e.message) : 'ไม่สำเร็จ')
    }
  }

  if (card) return <StripePayment checkout={card} />
  if (!cart || cart.lines.length === 0) return <p>ตะกร้าว่าง</p>
  return (
    <form className="checkout" onSubmit={submit}>
      <h1>ชำระเงิน</h1>
      <p>
        ยอดรวม <strong>{formatPrice(cart.total)}</strong>
      </p>
      {user ? (
        <p>สั่งซื้อในชื่อ {user.email}</p>
      ) : (
        <label>
          อีเมล
          <input name="email" type="email" required autoComplete="email" />
        </label>
      )}
      <fieldset>
        <legend>ที่อยู่จัดส่ง</legend>
        {FIELDS.map(([name, label, required]) => (
          <label key={name}>
            {label}
            <input name={name} required={required} />
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>วิธีชำระเงิน</legend>
        {paymentMethods.map((m) => (
          <label key={m.name} className="choice">
            <input
              type="radio"
              name="method"
              value={m.name}
              checked={chosen === m.name}
              onChange={() => setMethod(m.name)}
            />
            {m.label}
          </label>
        ))}
      </fieldset>
      {error ? (
        <p className="warn" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit">สั่งซื้อ</button>
    </form>
  )
}
