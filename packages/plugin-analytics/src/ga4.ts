// GA4 purchases and refunds from the server (ADR-0073, phase two): when a shop's order is paid
// or refunded, the GA4 Measurement Protocol hears it, so revenue counts money received, not
// orders a page saw. Only for customers who agreed to analytics at checkout.
import type {
  CollectionConfig,
  EasyCMS,
  EventMessage,
  IntegrationConfig,
  JobConfig,
} from '@easy-cms/core'

export const GA4 = 'ga4'
export const HITS = 'analytics-hits'
const ENDPOINT = () => process.env.GA4_MP_URL ?? 'https://www.google-analytics.com'

const MEASUREMENT_ID = /^G-[A-Z0-9]{4,16}$/
/** Tries after the first: one minute, five, half an hour. */
const RETRIES = [60_000, 5 * 60_000, 30 * 60_000]
/** How long a server holds a hit it is sending, so two servers don't both send it. */
const CLAIM = 2 * 60_000
/** Sent or failed hits, kept this long to look into, then deleted. */
const KEEP = 7 * 24 * 60 * 60_000
const later = (now: Date, ms: number) => new Date(now.getTime() + ms).toISOString()
const nobody = () => false

/** Google Analytics 4: a Measurement ID and an API secret, in Settings → Integrations. */
export const ga4Integration: IntegrationConfig = {
  id: GA4,
  label: 'Google Analytics 4',
  category: 'analytics',
  description: {
    en: 'Purchases and refunds sent by the server when the money arrives (Measurement Protocol)',
    th: 'ส่งการซื้อและการคืนเงินจาก server เมื่อได้รับเงินจริง (Measurement Protocol)',
  },
  icon: {
    paths: [
      {
        d: 'M22.84 2.998v17.999a2.983 2.983 0 0 1-2.967 2.998 2.98 2.98 0 0 1-.368-.02 3.06 3.06 0 0 1-2.61-3.1V3.12A3.06 3.06 0 0 1 19.51.02a2.983 2.983 0 0 1 3.329 2.978zM4.133 18.055a2.973 2.973 0 1 0 0 5.945 2.973 2.973 0 0 0 0-5.945zm7.872-9.01h-.05a3.06 3.06 0 0 0-2.892 3.126v7.985c0 2.167.954 3.482 2.35 3.763a2.978 2.978 0 0 0 3.57-2.927v-8.959a2.983 2.983 0 0 0-2.978-2.988z',
      },
    ],
    color: '#E37400',
  },
  docs: 'https://easycms.dev/docs/analytics#server-purchases',
  plugin: '@easy-cms/plugin-analytics',
  kind: 'fields',
  env: { measurementId: 'GA4_MEASUREMENT_ID', apiSecret: 'GA4_API_SECRET' },
  fields: [
    {
      name: 'measurementId',
      label: 'Measurement ID',
      description: {
        en: 'Google Analytics → Admin → Data streams → your web stream (G-…)',
        th: 'Google Analytics → Admin → Data streams → web stream ของคุณ (G-…)',
      },
      placeholder: 'G-XXXXXXXXXX',
      required: true,
    },
    {
      name: 'apiSecret',
      label: 'API secret',
      description: {
        en: 'The same stream → Measurement Protocol API secrets → Create',
        th: 'stream เดียวกัน → Measurement Protocol API secrets → Create',
      },
      required: true,
      secret: true,
    },
  ],
  async test(values) {
    const id = String(values.measurementId ?? '').trim()
    if (!MEASUREMENT_ID.test(id))
      return { ok: false, message: 'The Measurement ID looks like G-XXXXXXXXXX' }
    // The validation server checks the request without counting it.
    const response = await fetch(
      `${ENDPOINT()}/debug/mp/collect?measurement_id=${encodeURIComponent(id)}&api_secret=${encodeURIComponent(String(values.apiSecret ?? ''))}`,
      {
        method: 'POST',
        body: JSON.stringify({ client_id: '1.1', events: [{ name: 'easy_cms_test', params: {} }] }),
        signal: AbortSignal.timeout(10_000),
      },
    )
    const result = (await response.json().catch(() => ({}))) as {
      validationMessages?: { description?: string }[]
    }
    const problem = result.validationMessages?.[0]?.description
    if (!response.ok || problem) return { ok: false, message: problem ?? `HTTP ${response.status}` }
    return { ok: true, account: id }
  },
}

type Doc = Record<string, unknown>

/** Order amounts are in the currency's smallest unit; GA4 wants the main one. */
function digits(currency: string) {
  try {
    return (
      new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    )
  } catch {
    return 2
  }
}
const major = (amount: unknown, places: number) =>
  typeof amount === 'number' ? Math.round(amount) / 10 ** places : 0

/** The Measurement Protocol body for an order, or null when it can't or mustn't be sent. */
export function hitFor(event: 'purchase' | 'refund', order: Doc, measurementId: string) {
  const analytics = order.analytics as
    | { clientId?: string; sessions?: Record<string, string>; marketing?: boolean }
    | null
    | undefined
  if (!analytics?.clientId || typeof order.orderNumber !== 'string') return null
  const currency = String(order.currency ?? '')
  const places = digits(currency)
  const items = Array.isArray(order.items)
    ? (order.items as Doc[]).map((item) => ({
        item_id: String(item.sku || item.product || ''),
        item_name: String(item.title ?? ''),
        price: major(item.unitPrice, places),
        quantity: typeof item.quantity === 'number' ? item.quantity : 1,
      }))
    : []
  const session = analytics.sessions?.[measurementId.replace(/^G-/, '')]
  const ads = analytics.marketing ? 'GRANTED' : 'DENIED'
  return {
    client_id: analytics.clientId,
    consent: { ad_user_data: ads, ad_personalization: ads },
    events: [
      {
        name: event,
        params: {
          transaction_id: order.orderNumber,
          currency,
          value: major(order.total, places),
          items,
          ...(session ? { session_id: session, engagement_time_msec: 1 } : {}),
        },
      },
    ],
  }
}

/** Hits waiting to be sent, retried by the job: kept out of the admin and the APIs. */
export const hitsCollection: CollectionConfig = {
  slug: HITS,
  labels: { singular: 'Analytics hit', plural: 'Analytics hits' },
  access: { read: nobody, create: nobody, update: nobody, delete: nobody },
  fields: [
    { name: 'event', type: 'text', required: true },
    { name: 'order', type: 'text', required: true, index: true },
    { name: 'body', type: 'json', required: true },
    // pending | sent | failed
    { name: 'state', type: 'text', required: true, index: true },
    { name: 'attempts', type: 'number' },
    { name: 'nextAttemptAt', type: 'text', index: true },
    { name: 'error', type: 'text' },
  ],
}

type Hit = Doc & { id: string | number }

/** One try; a failure waits for the next or, after the last, marks the connection. */
async function deliver(cms: EasyCMS, hit: Hit, now = new Date()) {
  const conn = await cms.integrations.get(GA4)
  const attempts = Number(hit.attempts ?? 0) + 1
  const { id, ...data } = hit
  try {
    if (!conn) throw new Error('Google Analytics 4 is not connected')
    const id4 = String(conn.values.measurementId ?? '')
    const response = await fetch(
      `${ENDPOINT()}/mp/collect?measurement_id=${encodeURIComponent(id4)}&api_secret=${encodeURIComponent(String(conn.values.apiSecret ?? ''))}`,
      { method: 'POST', body: JSON.stringify(hit.body), signal: AbortSignal.timeout(10_000) },
    )
    // GA4 answers 2xx to anything it can read; only server errors are worth another try.
    if (response.status >= 500) throw new Error(`Google Analytics answered ${response.status}`)
    await cms.db.update({
      collection: HITS,
      id,
      data: { ...data, state: 'sent', attempts, error: null, updatedAt: now.toISOString() },
    })
    await cms.integrations.markUsed(GA4)
  } catch (error) {
    const message = (error as Error).message
    const wait = RETRIES[attempts - 1]
    await cms.db.update({
      collection: HITS,
      id,
      data: {
        ...data,
        attempts,
        state: wait === undefined ? 'failed' : 'pending',
        nextAttemptAt: later(now, wait ?? 0),
        error: message.slice(0, 500),
        updatedAt: now.toISOString(),
      },
    })
    if (wait === undefined) await cms.integrations.markError(GA4, message)
  }
}

/** `order.paid` → `purchase`, `order.refunded` → `refund`, once each per order. */
export async function onOrder(message: EventMessage, { cms }: { cms: EasyCMS }) {
  const event = message.event === 'order.refunded' ? 'refund' : 'purchase'
  const order = message.data as Doc
  const conn = await cms.integrations.get(GA4)
  if (!conn || order?.id === undefined) return
  const body = hitFor(event, order, String(conn.values.measurementId ?? ''))
  if (!body) return
  const key = `${event}:${String(order.id)}`
  const done = await cms.db.count({ collection: HITS, where: { order: { equals: key } } })
  if (done > 0) return
  const now = new Date()
  const hit = (await cms.db.create({
    collection: HITS,
    data: {
      event,
      order: key,
      body,
      state: 'pending',
      attempts: 0,
      nextAttemptAt: later(now, CLAIM),
      error: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
  })) as Hit
  // Sent at once; the job retries what fails, or what a stopped server didn't finish.
  await deliver(cms, hit, now)
}

export const hitsJob: JobConfig = {
  name: 'analytics:ga4',
  every: 60,
  async run({ cms, now }) {
    const due = await cms.db.find({
      collection: HITS,
      where: {
        and: [{ state: { equals: 'pending' } }, { nextAttemptAt: { lte: now.toISOString() } }],
      },
      sort: ['nextAttemptAt'],
      limit: 50,
      page: 1,
    })
    for (const found of due.docs as Hit[]) {
      // Claimed first, so two servers don't send it twice.
      const { id, ...data } = found
      const claimed = (await cms.db.update({
        collection: HITS,
        id,
        data: { ...data, nextAttemptAt: later(now, CLAIM) },
        where: {
          and: [
            { state: { equals: 'pending' } },
            { nextAttemptAt: { equals: found.nextAttemptAt } },
          ],
        },
      })) as Hit | null
      if (claimed) await deliver(cms, { ...found, ...claimed, id }, now)
    }
    const old = await cms.db.find({
      collection: HITS,
      where: {
        and: [
          { state: { not_equals: 'pending' } },
          { updatedAt: { lt: new Date(now.getTime() - KEEP).toISOString() } },
        ],
      },
      sort: ['id'],
      limit: 500,
      page: 1,
    })
    for (const row of old.docs) await cms.db.delete({ collection: HITS, id: row.id as Hit['id'] })
  },
}
