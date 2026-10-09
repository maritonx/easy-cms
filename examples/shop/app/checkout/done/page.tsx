'use client'

import { usePayments } from '@easy-cms/plugin-ecommerce/react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

function Done() {
  const params = useSearchParams()
  const { confirm } = usePayments()
  const transaction = params.get('transaction')
  const [order, setOrder] = useState(params.get('order'))
  const [status, setStatus] = useState(transaction ? 'checking' : 'done')

  // Back from Stripe: the shop checks with Stripe and makes the order.
  useEffect(() => {
    if (!transaction) return
    void confirm(transaction)
      .then((result) => {
        setOrder(result.order?.orderNumber ?? null)
        setStatus(result.order ? 'done' : result.status)
      })
      .catch(() => setStatus('failed'))
  }, [transaction, confirm])

  if (status === 'checking') return <p>กำลังตรวจสอบการชำระเงิน…</p>
  if (status === 'processing') return <p>ธนาคารกำลังดำเนินการ เราจะส่งอีเมลเมื่อได้รับเงิน</p>
  if (status === 'failed') return <p className="warn">การชำระเงินไม่สำเร็จ</p>
  const instructions = params.get('instructions')
  return (
    <>
      <h1>ขอบคุณสำหรับคำสั่งซื้อ</h1>
      <p>
        เลขที่คำสั่งซื้อ <strong data-testid="order-number">{order}</strong>
      </p>
      {instructions ? <p className="notice">{instructions}</p> : null}
      <p>
        <Link href="/account">ดูคำสั่งซื้อของฉัน</Link>
      </p>
    </>
  )
}

export default function DonePage() {
  return (
    <Suspense>
      <Done />
    </Suspense>
  )
}
