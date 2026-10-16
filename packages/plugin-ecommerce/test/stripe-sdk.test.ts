import type { EasyCMS } from '@easy-cms/core'
import Stripe23 from 'stripe'
import { describe, expect, it } from 'vitest'
import type { PaymentTransaction } from '../src/payments.js'
import { STRIPE_API_VERSION, stripeAdapter } from '../src/stripe.js'
import { createStripeClient, type StripeConstructor } from '../src/stripe-client.js'

/**
 * The adapter with the real `stripe` package, oldest and newest major in the peer range, and
 * Stripe's HTTP answered here: what goes over the wire and what comes back are the package's.
 */
// Stripe 17's types only declare a module named `stripe`; the same API as 23 for what's used here.
const Stripe17 = ((await import('stripe-17' as string)) as { default: typeof Stripe23 }).default
const majors = [
  ['17', Stripe17],
  ['23', Stripe23],
] as const

const transaction: PaymentTransaction = {
  id: 7,
  amount: 12_345,
  currency: 'THB',
  email: 'card@example.com',
  status: 'pending',
  data: { paymentIntent: 'pi_1' },
}
const cms = {} as EasyCMS

describe.each(majors)('stripe %s', (_, Stripe) => {
  const requests: { method: string; path: string; headers: Headers; body: string }[] = []
  const intent = { id: 'pi_1', object: 'payment_intent', client_secret: 'pi_1_secret' }
  const fetch = async (url: string | URL, init?: RequestInit) => {
    const { pathname } = new URL(url)
    requests.push({
      method: init?.method ?? 'GET',
      path: pathname,
      headers: new Headers(init?.headers),
      body: String(init?.body ?? ''),
    })
    const answer = pathname.startsWith('/v1/refunds')
      ? { id: 're_1', object: 'refund' }
      : { ...intent, status: 'succeeded', amount: 12_345, currency: 'thb' }
    return new Response(JSON.stringify(answer), {
      headers: { 'content-type': 'application/json', 'request-id': 'req_1' },
    })
  }
  const adapter = stripeAdapter({
    secretKey: 'sk_test_x',
    publishableKey: 'pk_test_x',
    webhookSecret: 'whsec_test',
    client: createStripeClient(
      Stripe as unknown as StripeConstructor,
      { secretKey: 'sk_test_x' },
      { httpClient: Stripe.createFetchHttpClient(fetch as typeof globalThis.fetch) },
    ),
  })

  it('asks for the pinned API version', async () => {
    const started = await adapter.initiate({ cms, transaction })
    expect(started).toMatchObject({
      data: { paymentIntent: 'pi_1' },
      client: { clientSecret: 'pi_1_secret', publishableKey: 'pk_test_x' },
    })
    const create = requests.at(-1)
    expect(create?.path).toBe('/v1/payment_intents')
    expect(create?.headers.get('stripe-version')).toBe(STRIPE_API_VERSION)
    expect(create?.headers.get('idempotency-key')).toBe('easy-cms-transaction-7')
    expect(Object.fromEntries(new URLSearchParams(create?.body))).toMatchObject({
      amount: '12345',
      currency: 'thb',
      'metadata[transaction]': '7',
    })
  })

  it('confirms and refunds', async () => {
    expect(await adapter.confirm?.({ cms, transaction, input: {} })).toBe('succeeded')
    expect(requests.at(-1)).toMatchObject({ method: 'GET', path: '/v1/payment_intents/pi_1' })
    await adapter.refund?.({ cms, transaction })
    expect(requests.at(-1)?.path).toBe('/v1/refunds')
    expect(requests.at(-1)?.body).toBe('payment_intent=pi_1')
  })

  it('checks webhook signatures', async () => {
    const webhook = adapter.endpoints?.[0]
    const payload = JSON.stringify({ id: 'evt_1', type: 'charge.updated', data: { object: {} } })
    const post = async (signature: string) => {
      const request = new Request('http://shop.test/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': signature },
        body: payload,
      })
      // biome-ignore lint/suspicious/noExplicitAny: the two fields the handler reads
      return webhook?.handler({ request, text: () => request.text() } as any)
    }
    const signature = await Stripe.webhooks.generateTestHeaderStringAsync({
      payload,
      secret: 'whsec_test',
    })
    expect(await post(signature)).toEqual({ received: true })
    expect(((await post('t=1,v1=nope')) as Response).status).toBe(400)
  })
})

describe('the client the adapter makes', () => {
  it('imports stripe, and takes clientConfig', async () => {
    const seen: string[] = []
    const fetch = async (url: string | URL, init?: RequestInit) => {
      seen.push(`${new URL(url).host} ${new Headers(init?.headers).get('stripe-version')}`)
      return new Response(
        JSON.stringify({ id: 'pi_9', object: 'payment_intent', client_secret: 's' }),
        { headers: { 'content-type': 'application/json' } },
      )
    }
    const adapter = stripeAdapter({
      secretKey: 'sk_test_x',
      publishableKey: 'pk_test_x',
      clientConfig: {
        host: 'stripe.test',
        httpClient: Stripe23.createFetchHttpClient(fetch as typeof globalThis.fetch),
      },
    })
    await adapter.initiate({ cms, transaction })
    expect(seen).toEqual([`stripe.test ${STRIPE_API_VERSION}`])
  })
})
