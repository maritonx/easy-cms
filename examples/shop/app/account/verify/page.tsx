'use client'

import { useCustomer } from '@easy-cms/plugin-ecommerce/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

/** The page behind the link in the sign-up email. */
function Verify() {
  const token = useSearchParams().get('token') ?? ''
  const { verifyEmail } = useCustomer()
  const router = useRouter()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    void verifyEmail(token)
      .then(() => router.replace('/account'))
      .catch(() => setFailed(true))
  }, [token, verifyEmail, router])
  return <p>{failed ? 'ลิงก์หมดอายุหรือใช้ไม่ได้' : 'กำลังยืนยันอีเมล…'}</p>
}

export default function VerifyPage() {
  return (
    <Suspense>
      <Verify />
    </Suspense>
  )
}
