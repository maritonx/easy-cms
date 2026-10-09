'use client'

import { ShopError, useCustomer } from '@easy-cms/plugin-ecommerce/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { type FormEvent, Suspense, useState } from 'react'

/** The page behind the "forgot password" link. */
function Reset() {
  const token = useSearchParams().get('token') ?? ''
  const { resetPassword } = useCustomer()
  const router = useRouter()
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      await resetPassword(token, String(new FormData(event.currentTarget).get('password')))
      router.replace('/account')
    } catch (e) {
      setError(e instanceof ShopError ? (e.errors[0]?.message ?? e.message) : 'ไม่สำเร็จ')
    }
  }

  return (
    <form className="checkout" onSubmit={submit}>
      <h1>ตั้งรหัสผ่านใหม่</h1>
      <label>
        รหัสผ่านใหม่
        <input name="password" type="password" required minLength={8} autoComplete="new-password" />
      </label>
      {error ? <p className="warn">{error}</p> : null}
      <button type="submit">บันทึก</button>
    </form>
  )
}

export default function ResetPage() {
  return (
    <Suspense>
      <Reset />
    </Suspense>
  )
}
