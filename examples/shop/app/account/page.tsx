'use client'

import { ShopError, useCurrency, useCustomer, useOrders } from '@easy-cms/plugin-ecommerce/react'
import { type FormEvent, useState } from 'react'

const STATUS: Record<string, string> = {
  pending: 'รอชำระเงิน',
  paid: 'ชำระแล้ว',
  fulfilled: 'จัดส่งแล้ว',
  cancelled: 'ยกเลิก',
  refunded: 'คืนเงินแล้ว',
}

function SignIn() {
  const { login, signup, forgotPassword } = useCustomer()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [message, setMessage] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email'))
    const password = String(form.get('password'))
    try {
      if (mode === 'login') await login(email, password)
      else {
        const result = await signup({ email, password, name: String(form.get('name') ?? '') })
        if (result.verify) setMessage('ส่งลิงก์ยืนยันไปที่อีเมลแล้ว กดลิงก์เพื่อเข้าสู่ระบบ')
      }
    } catch (e) {
      setMessage(e instanceof ShopError ? (e.errors[0]?.message ?? e.message) : 'ไม่สำเร็จ')
    }
  }

  return (
    <form className="checkout" onSubmit={submit}>
      <h1>{mode === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}</h1>
      {mode === 'signup' ? (
        <label>
          ชื่อ
          <input name="name" autoComplete="name" />
        </label>
      ) : null}
      <label>
        อีเมล
        <input name="email" type="email" required autoComplete="email" />
      </label>
      <label>
        รหัสผ่าน
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        />
      </label>
      {message ? <p role="status">{message}</p> : null}
      <button type="submit">{mode === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}</button>
      <p>
        <button
          type="button"
          className="link"
          onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
        >
          {mode === 'login' ? 'ยังไม่มีบัญชี? สมัครสมาชิก' : 'มีบัญชีแล้ว? เข้าสู่ระบบ'}
        </button>{' '}
        {mode === 'login' ? (
          <button
            type="button"
            className="link"
            onClick={(e) => {
              const email = (e.currentTarget.form?.elements.namedItem('email') as HTMLInputElement)
                ?.value
              if (email)
                void forgotPassword(email).then(() =>
                  setMessage('ถ้ามีบัญชีนี้ เราได้ส่งลิงก์ตั้งรหัสผ่านใหม่ไปให้แล้ว'),
                )
            }}
          >
            ลืมรหัสผ่าน
          </button>
        ) : null}
      </p>
    </form>
  )
}

export default function AccountPage() {
  const { user, loading, logout } = useCustomer()
  const { orders } = useOrders()
  const { formatPrice } = useCurrency()
  if (loading) return <p>กำลังโหลด…</p>
  if (!user) return <SignIn />
  return (
    <>
      <h1>บัญชีของฉัน</h1>
      <p>
        {user.email} ·{' '}
        <button type="button" className="link" onClick={() => void logout()}>
          ออกจากระบบ
        </button>
      </p>
      <h2>คำสั่งซื้อ</h2>
      {orders.length === 0 ? (
        <p>ยังไม่มีคำสั่งซื้อ</p>
      ) : (
        <table className="lines" data-testid="orders">
          <tbody>
            {orders.map((order) => (
              <tr key={String(order.id)}>
                <td>{String(order.orderNumber)}</td>
                <td>{STATUS[String(order.status)] ?? String(order.status)}</td>
                <td className="num">{formatPrice(Number(order.total), String(order.currency))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
