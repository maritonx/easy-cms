'use client'

import type { CheckoutResult } from '@easy-cms/plugin-ecommerce/react'
import { useEffect, useRef, useState } from 'react'

interface StripeJs {
  elements(options: { clientSecret: string }): {
    create(type: 'payment'): { mount(element: HTMLElement): void }
  }
  confirmPayment(options: {
    elements: unknown
    confirmParams: { return_url: string }
  }): Promise<{ error?: { message?: string } }>
}

declare global {
  interface Window {
    Stripe?: (key: string) => StripeJs
  }
}

/** Loads Stripe.js from Stripe (as Stripe requires). */
function loadStripe(): Promise<NonNullable<Window['Stripe']>> {
  if (window.Stripe) return Promise.resolve(window.Stripe)
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://js.stripe.com/v3/'
    script.onload = () => (window.Stripe ? resolve(window.Stripe) : reject(new Error('Stripe.js')))
    script.onerror = () => reject(new Error('Stripe.js could not load'))
    document.head.append(script)
  })
}

/**
 * Stripe's Payment Element (card, PromptPay…). Stripe sends the customer back to
 * /checkout/done, which confirms the payment with the shop.
 */
export function StripePayment({ checkout }: { checkout: CheckoutResult }) {
  const mount = useRef<HTMLDivElement>(null)
  const [stripe, setStripe] = useState<{ js: StripeJs; elements: unknown } | null>(null)
  const [error, setError] = useState('')
  const { clientSecret, publishableKey } = checkout.payment as {
    clientSecret: string
    publishableKey: string
  }

  useEffect(() => {
    void loadStripe()
      .then((Stripe) => {
        const js = Stripe(publishableKey)
        const elements = js.elements({ clientSecret })
        if (mount.current) elements.create('payment').mount(mount.current)
        setStripe({ js, elements })
      })
      .catch((e: Error) => setError(e.message))
  }, [clientSecret, publishableKey])

  async function pay() {
    if (!stripe) return
    const result = await stripe.js.confirmPayment({
      elements: stripe.elements,
      confirmParams: {
        return_url: `${location.origin}/checkout/done?transaction=${encodeURIComponent(String(checkout.transaction))}`,
      },
    })
    if (result.error) setError(result.error.message ?? 'ชำระเงินไม่สำเร็จ')
  }

  return (
    <div className="checkout">
      <h1>ชำระเงิน</h1>
      <div ref={mount} />
      {error ? <p className="warn">{error}</p> : null}
      <button type="button" onClick={pay} disabled={!stripe}>
        ชำระเงิน
      </button>
    </div>
  )
}
