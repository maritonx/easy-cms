/**
 * The shop's admin module: the price input (`ecms-price-field`) and its cell in lists
 * (`ecms-price-cell`), the actions of an order (`ecms-order-actions`, in its side panel) and the
 * dashboard panel (`ecms-shop-overview`). Plain DOM, no framework; styles use the admin's CSS
 * variables.
 */
import type { AdminElementProps } from '@easy-cms/core/plugin'

type Api = (method: string, path: string, body?: unknown) => Promise<unknown>
type Lang = 'en' | 'th'

const MESSAGES = {
  en: {
    amount: 'Amount',
    status: 'Status',
    paid: 'Payment received',
    fulfilled: 'Mark as sent',
    cancelled: 'Cancel order',
    refunded: 'Refund',
    confirmPaid: 'Mark this order as paid? The customer gets an email.',
    confirmFulfilled: 'Mark this order as sent?',
    confirmCancelled: 'Cancel this order? Its items go back in stock.',
    confirmRefunded: 'Refund this order? The money goes back to the customer.',
    failed: 'Could not change the order: {message}',
    unsaved: 'Orders are made at checkout.',
    short: 'Stock ran out while this order was paid: check before sending.',
    widget: 'Shop',
    today: 'Today',
    month: 'Last 30 days',
    orders: '{n} orders',
    pending: 'Awaiting payment',
    toFulfil: 'To send',
    none: 'No sales yet.',
    loading: 'Loading…',
    loadFailed: 'Could not load the numbers.',
    statuses: {
      pending: 'Awaiting payment',
      paid: 'Paid',
      fulfilled: 'Sent',
      cancelled: 'Cancelled',
      refunded: 'Refunded',
    },
  },
  th: {
    amount: 'จำนวนเงิน',
    status: 'สถานะ',
    paid: 'ได้รับเงินแล้ว',
    fulfilled: 'จัดส่งแล้ว',
    cancelled: 'ยกเลิกคำสั่งซื้อ',
    refunded: 'คืนเงิน',
    confirmPaid: 'ยืนยันว่าได้รับเงินสำหรับคำสั่งซื้อนี้แล้ว? ลูกค้าจะได้รับอีเมล',
    confirmFulfilled: 'ยืนยันว่าจัดส่งคำสั่งซื้อนี้แล้ว?',
    confirmCancelled: 'ยกเลิกคำสั่งซื้อนี้? สินค้าจะกลับเข้าสต็อก',
    confirmRefunded: 'คืนเงินคำสั่งซื้อนี้? เงินจะกลับไปยังลูกค้า',
    failed: 'เปลี่ยนสถานะไม่สำเร็จ: {message}',
    unsaved: 'คำสั่งซื้อสร้างตอนลูกค้าชำระเงิน',
    short: 'สต็อกหมดระหว่างที่ลูกค้าชำระเงิน ตรวจสอบก่อนจัดส่ง',
    widget: 'ร้านค้า',
    today: 'วันนี้',
    month: '30 วันล่าสุด',
    orders: '{n} คำสั่งซื้อ',
    pending: 'รอชำระเงิน',
    toFulfil: 'รอจัดส่ง',
    none: 'ยังไม่มียอดขาย',
    loading: 'กำลังโหลด…',
    loadFailed: 'โหลดตัวเลขไม่สำเร็จ',
    statuses: {
      pending: 'รอชำระเงิน',
      paid: 'ชำระแล้ว',
      fulfilled: 'จัดส่งแล้ว',
      cancelled: 'ยกเลิก',
      refunded: 'คืนเงินแล้ว',
    },
  },
} as const
type Key = Exclude<keyof (typeof MESSAGES)['en'], 'statuses'>
type Status = keyof (typeof MESSAGES)['en']['statuses']

const esc = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )

const BASE_STYLE = `
  :host { display: block; font: inherit; color: var(--text); }
  [hidden] { display: none !important; }
  .muted { color: var(--text-muted); }
  button:focus-visible, input:focus-visible, a:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
`

/** Sets the properties the admin passes on as plain fields, re-rendering after each. */
function contextProperties(target: { prototype: object }, names: readonly string[]) {
  for (const name of names) {
    Object.defineProperty(target.prototype, name, {
      get(this: { props: Record<string, unknown> }) {
        return this.props[name]
      },
      set(this: { props: Record<string, unknown>; update(): void }, value: unknown) {
        this.props[name] = value
        this.update()
      },
    })
  }
}

const PROPERTIES = [
  'value',
  'options',
  'readOnly',
  'uiLocale',
  'label',
  'field',
  'doc',
  'id',
  'api',
  'collection',
  'path',
  'global',
  'locale',
  'apiVersion',
  'user',
] as const satisfies readonly (keyof AdminElementProps)[]

abstract class ShopElement extends HTMLElement {
  props: Record<string, unknown> = {}
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
  }
  connectedCallback() {
    this.update()
  }
  protected get uiLang(): Lang {
    return this.props.uiLocale === 'th' ? 'th' : 'en'
  }
  protected t(key: Key, values: Record<string, string | number> = {}): string {
    return MESSAGES[this.uiLang][key].replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ''))
  }
  protected status(status: string): string {
    return MESSAGES[this.uiLang].statuses[status as Status] ?? status
  }
  protected money(amount: number, code: string, decimals = 2): string {
    try {
      return new Intl.NumberFormat(this.uiLang === 'th' ? 'th-TH' : 'en', {
        style: 'currency',
        currency: code,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(amount / 10 ** decimals)
    } catch {
      return `${(amount / 10 ** decimals).toFixed(decimals)} ${code}`
    }
  }
  abstract update(): void
}

// --- Price --------------------------------------------------------------------------------

interface PriceOptions {
  currency?: string
  decimals?: number
  symbol?: string
}

const FIELD_STYLE = `
  ${BASE_STYLE}
  .row { display: flex; align-items: stretch; max-inline-size: 16rem; }
  .unit {
    display: inline-flex; align-items: center; padding: 0 0.6rem; border: 1px solid var(--border-strong);
    border-right: 0; border-radius: var(--radius-sm, 8px) 0 0 var(--radius-sm, 8px);
    background: var(--surface-2); color: var(--text-muted); font-size: 0.875rem;
  }
  input {
    flex: 1; min-inline-size: 0; min-block-size: 2.25rem; padding: 0 0.6rem; border: 1px solid var(--border-strong);
    border-radius: 0 var(--radius-sm, 8px) var(--radius-sm, 8px) 0; background: var(--surface); color: var(--text);
    font: inherit; font-variant-numeric: tabular-nums; text-align: right;
  }
  input[aria-invalid='true'] { border-color: var(--danger, #c0392b); }
  input:read-only { background: var(--surface-2); }
`

/** Turns typed money (`1,234.5`) into the smallest unit (`123450`); `undefined` when not money. */
export function parseMoney(text: string, decimals: number): number | null | undefined {
  const clean = text.replace(/[\s,_]/g, '')
  if (clean === '') return null
  const pattern = decimals > 0 ? new RegExp(`^\\d+(\\.\\d{0,${decimals}})?$`) : /^\d+$/
  if (!pattern.test(clean)) return undefined
  const [whole = '0', part = ''] = clean.split('.')
  return Number(whole) * 10 ** decimals + Number(part.padEnd(decimals, '0') || '0')
}

/** The smallest unit as typed money: `123450` → `1234.50`. */
export function showMoney(value: unknown, decimals: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return ''
  return (value / 10 ** decimals).toFixed(decimals)
}

class PriceField extends ShopElement {
  readonly #input = document.createElement('input')
  readonly #unit = document.createElement('span')

  static {
    contextProperties(PriceField, PROPERTIES)
  }

  constructor() {
    super()
    this.#input.inputMode = 'decimal'
    this.#input.autocomplete = 'off'
    this.#unit.className = 'unit'
    this.#unit.setAttribute('aria-hidden', 'true')
    this.#input.addEventListener('input', () => {
      const value = parseMoney(this.#input.value, this.#decimals)
      this.#input.setAttribute('aria-invalid', String(value === undefined))
      if (value !== undefined) this.dispatchEvent(new CustomEvent('change', { detail: value }))
    })
    // Tidy what was typed once the field is left: `12.5` → `12.50`.
    this.#input.addEventListener('blur', () => {
      const value = parseMoney(this.#input.value, this.#decimals)
      if (value !== undefined) this.#input.value = showMoney(value, this.#decimals)
    })
    const row = document.createElement('div')
    row.className = 'row'
    row.append(this.#unit, this.#input)
    const style = document.createElement('style')
    style.textContent = FIELD_STYLE
    this.shadowRoot?.append(style, row)
  }

  get #options(): PriceOptions {
    return (this.props.options ?? {}) as PriceOptions
  }
  get #decimals(): number {
    const d = this.#options.decimals
    return typeof d === 'number' ? d : 2
  }

  update() {
    const doc = (this.props.doc ?? {}) as Record<string, unknown>
    // Orders and payments keep their currency on the document.
    const currency =
      this.#options.currency ?? (typeof doc.currency === 'string' ? doc.currency : '')
    const { symbol } = this.#options
    this.#unit.textContent = symbol ?? currency
    this.#input.readOnly = this.props.readOnly === true
    const label = typeof this.props.label === 'string' ? this.props.label : this.t('amount')
    this.#input.setAttribute('aria-label', `${label} (${currency})`)
    this.#input.placeholder = showMoney(0, this.#decimals)
    // Leave the text alone while someone is typing in it.
    if (this.shadowRoot?.activeElement !== this.#input)
      this.#input.value = showMoney(this.props.value, this.#decimals)
  }
}

class PriceCell extends ShopElement {
  static {
    contextProperties(PriceCell, PROPERTIES)
  }
  update() {
    const root = this.shadowRoot
    if (!root) return
    const { currency, decimals = 2 } = (this.props.options ?? {}) as PriceOptions
    const value = this.props.value
    const doc = (this.props.doc ?? {}) as Record<string, unknown>
    // Orders and payments keep their currency on the document.
    const code = currency ?? (typeof doc.currency === 'string' ? doc.currency : '')
    root.innerHTML = `<style>:host{font-variant-numeric:tabular-nums}</style>${esc(
      typeof value === 'number' && code
        ? this.money(value, code, decimals)
        : typeof value === 'number'
          ? String(value)
          : '—',
    )}`
  }
}

// --- Orders -------------------------------------------------------------------------------

const ACTIONS_STYLE = `
  ${BASE_STYLE}
  h3 { margin: 0 0 0.5rem; font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.02em; color: var(--text-muted); }
  .badge {
    display: inline-flex; align-items: center; min-height: 1.6rem; padding: 0 0.6rem; border-radius: 999px;
    background: var(--surface-2); font-size: 0.8rem; font-weight: 600; margin-bottom: 0.75rem;
  }
  .badge.paid, .badge.fulfilled { background: color-mix(in srgb, var(--success, #1a7f37) 15%, transparent); color: var(--success, #1a7f37); }
  .badge.pending { background: color-mix(in srgb, var(--warning, #9a6700) 15%, transparent); color: var(--warning, #9a6700); }
  .actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  button {
    min-height: 2rem; padding: 0 0.75rem; border: 1px solid var(--border-strong); border-radius: var(--radius-sm, 8px);
    background: var(--surface); color: var(--text); font: inherit; font-size: 0.85rem; font-weight: 500; cursor: pointer;
  }
  button.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-contrast, #fff); }
  button.danger { color: var(--danger, #c0392b); }
  button:disabled { opacity: 0.6; cursor: progress; }
  p { margin: 0 0 0.6rem; font-size: 0.85rem; }
  .warn { color: var(--warning, #9a6700); }
  .error { color: var(--danger, #c0392b); }
`

const NEXT: Record<string, { action: string; style?: 'primary' | 'danger' }[]> = {
  pending: [
    { action: 'paid', style: 'primary' },
    { action: 'cancelled', style: 'danger' },
  ],
  paid: [
    { action: 'fulfilled', style: 'primary' },
    { action: 'refunded', style: 'danger' },
  ],
  fulfilled: [{ action: 'refunded', style: 'danger' }],
}

const CONFIRM: Record<string, Key> = {
  paid: 'confirmPaid',
  fulfilled: 'confirmFulfilled',
  cancelled: 'confirmCancelled',
  refunded: 'confirmRefunded',
}

class OrderActions extends ShopElement {
  #busy = false
  #error = ''

  static {
    contextProperties(OrderActions, PROPERTIES)
  }

  async #act(action: string) {
    const api = this.props.api as Api | undefined
    const id = this.props.id
    if (!api || id === undefined || id === null) return
    if (!window.confirm(this.t(CONFIRM[action] as Key))) return
    this.#busy = true
    this.#error = ''
    this.update()
    try {
      await api('POST', `/shop/orders/${encodeURIComponent(String(id))}/${action}`, {})
      // The form shows the order as saved: load it again.
      window.location.reload()
    } catch (error) {
      this.#busy = false
      this.#error = this.t('failed', { message: (error as Error).message })
      this.update()
    }
  }

  update() {
    const root = this.shadowRoot
    if (!root) return
    const doc = (this.props.doc ?? {}) as Record<string, unknown>
    const id = this.props.id
    let body: string
    if (id === null || id === undefined) body = `<p class="muted">${esc(this.t('unsaved'))}</p>`
    else {
      const status = String(doc.status ?? '')
      const buttons = (NEXT[status] ?? [])
        .map(
          ({ action, style }) =>
            `<button type="button" data-action="${action}" class="${style ?? ''}" ${this.#busy ? 'disabled' : ''}>${esc(this.t(action as Key))}</button>`,
        )
        .join('')
      body = `
        <span class="badge ${esc(status)}">${esc(this.status(status))}</span>
        ${doc.stockShort === true ? `<p class="warn">${esc(this.t('short'))}</p>` : ''}
        ${typeof doc.total === 'number' && typeof doc.currency === 'string' ? `<p>${esc(this.money(doc.total, doc.currency))}</p>` : ''}
        ${buttons ? `<div class="actions">${buttons}</div>` : ''}
        ${this.#error ? `<p class="error" role="alert">${esc(this.#error)}</p>` : ''}`
    }
    root.innerHTML = `<style>${ACTIONS_STYLE}</style><section aria-label="${esc(this.t('status'))}"><h3>${esc(this.t('status'))}</h3>${body}</section>`
    for (const button of root.querySelectorAll<HTMLButtonElement>('button[data-action]'))
      button.addEventListener('click', () => void this.#act(button.dataset.action as string))
  }
}

// --- Dashboard ------------------------------------------------------------------------------

interface Overview {
  today: Record<string, { total: number; orders: number }>
  month: Record<string, { total: number; orders: number }>
  pending: number
  toFulfil: number
  currencies: { code: string; decimals: number }[]
}

const WIDGET_STYLE = `
  ${BASE_STYLE}
  h2 { margin: 0 0 0.75rem; font-size: 1rem; font-weight: 600; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: 0.75rem; }
  .stat { padding: 0.75rem; border: 1px solid var(--border); border-radius: var(--radius-sm, 8px); }
  .stat span { display: block; font-size: 0.8rem; color: var(--text-muted); }
  .stat strong { display: block; margin-top: 0.2rem; font-size: 1.25rem; font-variant-numeric: tabular-nums; }
  .stat small { color: var(--text-muted); }
  a { color: inherit; text-decoration: none; }
  a.stat:hover { border-color: var(--border-strong); background: var(--surface-2); }
  p { margin: 0; font-size: 0.875rem; }
`

class ShopOverview extends ShopElement {
  #data: Overview | null = null
  #failed = false
  #loaded = false

  static {
    contextProperties(ShopOverview, PROPERTIES)
  }

  async #load() {
    const api = this.props.api as Api | undefined
    if (!api || this.#loaded) return
    this.#loaded = true
    try {
      this.#data = (await api('GET', '/shop/overview')) as Overview
    } catch {
      this.#failed = true
    }
    this.update()
  }

  #sums(sums: Overview['today'], data: Overview) {
    const entries = Object.entries(sums)
    if (entries.length === 0) return { total: '—', orders: this.t('orders', { n: 0 }) }
    const decimals = (code: string) => data.currencies.find((c) => c.code === code)?.decimals ?? 2
    return {
      total: entries.map(([code, s]) => this.money(s.total, code, decimals(code))).join(' · '),
      orders: this.t('orders', { n: entries.reduce((n, [, s]) => n + s.orders, 0) }),
    }
  }

  update() {
    const root = this.shadowRoot
    if (!root) return
    void this.#load()
    const options = (this.props.options ?? {}) as { adminPath?: string }
    const admin = options.adminPath ?? '/admin'
    const data = this.#data
    let body: string
    if (this.#failed) body = `<p class="muted">${esc(this.t('loadFailed'))}</p>`
    else if (!data) body = `<p class="muted">${esc(this.t('loading'))}</p>`
    else {
      const today = this.#sums(data.today, data)
      const month = this.#sums(data.month, data)
      const link = (path: string, label: string, n: number) =>
        `<a class="stat" href="${esc(admin + path)}" data-to="${esc(path)}"><span>${esc(label)}</span><strong>${n}</strong></a>`
      body = `<div class="grid">
        <div class="stat"><span>${esc(this.t('today'))}</span><strong>${esc(today.total)}</strong><small>${esc(today.orders)}</small></div>
        <div class="stat"><span>${esc(this.t('month'))}</span><strong>${esc(month.total)}</strong><small>${esc(month.orders)}</small></div>
        ${link('/collections/orders?f_status=pending', this.t('pending'), data.pending)}
        ${link('/collections/orders?f_status=paid', this.t('toFulfil'), data.toFulfil)}
      </div>`
    }
    root.innerHTML = `<style>${WIDGET_STYLE}</style><section aria-labelledby="title"><h2 id="title">${esc(this.t('widget'))}</h2>${body}</section>`
    for (const a of root.querySelectorAll<HTMLAnchorElement>('a[data-to]'))
      a.addEventListener('click', (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
          return
        event.preventDefault()
        this.dispatchEvent(new CustomEvent('navigate', { detail: a.dataset.to ?? '/' }))
      })
  }
}

const define = (tag: string, element: CustomElementConstructor) => {
  if (!customElements.get(tag)) customElements.define(tag, element)
}
define('ecms-price-field', PriceField)
define('ecms-price-cell', PriceCell)
define('ecms-order-actions', OrderActions)
define('ecms-shop-overview', ShopOverview)
