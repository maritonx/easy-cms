import type { EasyCMS } from '@easy-cms/core'
import { type Currency, formatPrice } from './shared.js'
import type { OrderDoc } from './shop.js'

/** What an order email function receives. */
export interface OrderEmailArgs {
  readonly order: OrderDoc
  /** `en` or `th`: the language of the checkout. */
  readonly locale: string
  readonly currency: Currency
  /** For a manual payment (bank transfer): what to tell the customer. */
  readonly instructions: string | null
  readonly cms: EasyCMS
}

export interface OrderEmail {
  readonly subject: string
  readonly text: string
  readonly html?: string
}

export type OrderEmailFn = (args: OrderEmailArgs) => OrderEmail | Promise<OrderEmail>

const esc = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )

type Row = { title: string; quantity: number; total: number }

/** The lines and totals of an order, as text and as an HTML table. */
function summary(order: OrderDoc, currency: Currency, locale: string) {
  const money = (n: number) => formatPrice(n, currency, locale === 'th' ? 'th-TH' : 'en')
  const items = ((order.items ?? []) as Row[]).map((i) => ({
    label: `${i.title} × ${i.quantity}`,
    value: money(i.total),
  }))
  const extra = ((order.adjustments ?? []) as { label: string; amount: number }[]).map((a) => ({
    label: a.label,
    value: money(a.amount),
  }))
  const total = { label: locale === 'th' ? 'ยอดรวม' : 'Total', value: money(order.total) }
  const rows = [...items, ...extra, total]
  const text = rows.map((r) => `${r.label}: ${r.value}`).join('\n')
  const html = `<table style="border-collapse:collapse;width:100%;max-width:480px">${rows
    .map(
      (r, i) =>
        `<tr${i === rows.length - 1 ? ' style="font-weight:600;border-top:1px solid #d0d7de"' : ''}><td style="padding:4px 0">${esc(r.label)}</td><td style="padding:4px 0;text-align:right">${esc(r.value)}</td></tr>`,
    )
    .join('')}</table>`
  return { text, html }
}

function layout(lines: string[], table: string, after: string[] = []) {
  const p = (line: string) => `<p>${esc(line)}</p>`
  return `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#1f2328">${lines.map(p).join('')}${table}${after.map(p).join('')}</div>`
}

/** The customer's email once an order is made: what they bought, and how to pay if not yet. */
export const orderConfirmation: OrderEmailFn = ({ order, locale, currency, instructions }) => {
  const { text, html } = summary(order, currency, locale)
  const th = locale === 'th'
  const pending = order.status === 'pending'
  const lines = th
    ? [
        `ขอบคุณสำหรับคำสั่งซื้อ เลขที่ ${order.orderNumber}`,
        pending ? 'คำสั่งซื้อจะได้รับการยืนยันเมื่อเราได้รับเงินแล้ว' : 'เราได้รับเงินแล้ว และจะจัดส่งให้เร็วที่สุด',
      ]
    : [
        `Thank you for your order ${order.orderNumber}.`,
        pending
          ? 'We will confirm it once your payment arrives.'
          : 'We received your payment and will send your order soon.',
      ]
  const after = pending && instructions ? [instructions] : []
  return {
    subject: th ? `คำสั่งซื้อ ${order.orderNumber}` : `Your order ${order.orderNumber}`,
    text: [...lines, '', text, ...(after.length ? ['', ...after] : [])].join('\n'),
    html: layout(lines, html, after),
  }
}

/** The customer's email when a bank transfer (or other manual payment) is marked received. */
export const paymentReceived: OrderEmailFn = ({ order, locale, currency }) => {
  const { text, html } = summary(order, currency, locale)
  const th = locale === 'th'
  const lines = th
    ? [`เราได้รับเงินสำหรับคำสั่งซื้อ ${order.orderNumber} แล้ว และจะจัดส่งให้เร็วที่สุด`]
    : [`We received your payment for order ${order.orderNumber} and will send it soon.`]
  return {
    subject: th ? `ได้รับเงินแล้ว: ${order.orderNumber}` : `Payment received: ${order.orderNumber}`,
    text: [...lines, '', text].join('\n'),
    html: layout(lines, html),
  }
}

/** The shop's email about a new order. */
export const newOrder: OrderEmailFn = ({ order, locale, currency }) => {
  const { text, html } = summary(order, currency, locale)
  const th = locale === 'th'
  const lines = th
    ? [
        `คำสั่งซื้อใหม่ ${order.orderNumber} จาก ${order.email}`,
        order.status === 'pending' ? 'สถานะ: รอชำระเงิน' : 'สถานะ: ชำระแล้ว',
      ]
    : [
        `New order ${order.orderNumber} from ${order.email}`,
        order.status === 'pending' ? 'Status: awaiting payment' : 'Status: paid',
      ]
  return {
    subject: th ? `คำสั่งซื้อใหม่ ${order.orderNumber}` : `New order ${order.orderNumber}`,
    text: [...lines, '', text].join('\n'),
    html: layout(lines, html),
  }
}
