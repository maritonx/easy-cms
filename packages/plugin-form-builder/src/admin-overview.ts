/**
 * Submissions at a glance: the "Form overview" page (`ecms-forms-overview`, from `admin.pages`)
 * and the dashboard panel (`ecms-forms-widget`, from `admin.dashboard`). Both read
 * `<api>/form/stats.json`. Plain DOM, no framework; styles use the admin's CSS variables.
 */

type Api = (method: string, path: string, body?: unknown) => Promise<unknown>

interface Options {
  forms: string
  submissions: string
  adminPath: string
}

/** What `/form/stats.json` returns. */
export interface FormStats {
  days: number
  timeZone: string
  /** `YYYY-MM-DD`, oldest first. */
  dates: string[]
  total: number
  perDay: number[]
  forms: { id: string | number; slug: string; title: string; total: number; perDay: number[] }[]
}

const MESSAGES = {
  en: {
    range: 'Period',
    days7: 'Last 7 days',
    days30: 'Last 30 days',
    total: '{n} submissions',
    totalOne: '1 submission',
    chart: 'Submissions per day: {n} in total',
    day: '{date}: {n}',
    form: 'Form',
    count: 'Submissions',
    view: 'View submissions',
    trend: 'Per day',
    actions: 'Actions',
    noForms: 'No forms yet.',
    loading: 'Loading…',
    failed: "Couldn't load the numbers.",
    widgetTitle: 'Form submissions',
    widgetNone: 'None in the last 7 days.',
    overview: 'Form overview',
  },
  th: {
    range: 'ช่วงเวลา',
    days7: '7 วันล่าสุด',
    days30: '30 วันล่าสุด',
    total: '{n} รายการ',
    totalOne: '1 รายการ',
    chart: 'ข้อมูลที่ส่งมารายวัน รวม {n} รายการ',
    day: '{date}: {n}',
    form: 'ฟอร์ม',
    count: 'ข้อมูลที่ส่งมา',
    view: 'ดูข้อมูลที่ส่งมา',
    trend: 'รายวัน',
    actions: 'การทำงาน',
    noForms: 'ยังไม่มีฟอร์ม',
    loading: 'กำลังโหลด…',
    failed: 'โหลดตัวเลขไม่สำเร็จ',
    widgetTitle: 'ข้อมูลที่ส่งจากฟอร์ม',
    widgetNone: 'ไม่มีใน 7 วันล่าสุด',
    overview: 'ภาพรวมฟอร์ม',
  },
} as const
type Key = keyof (typeof MESSAGES)['en']

const esc = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )

const BASE_STYLE = `
  :host { display: block; font: inherit; color: var(--text); }
  [hidden] { display: none !important; }
  a { color: var(--accent-strong, var(--accent)); text-decoration: none; }
  a:hover { text-decoration: underline; }
  a:focus-visible, button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 4px; }
  .muted { color: var(--text-muted); }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .bars { display: flex; align-items: flex-end; justify-content: space-between; gap: 3px; }
  .bar { flex: 1; max-width: 3rem; min-height: 2px; border-radius: 3px 3px 0 0; background: var(--accent); }
  .bar.zero { background: var(--border); }
  .bars.big { height: 9rem; gap: 6px; }
  .bars.big .bar { border-radius: 4px 4px 0 0; }
  .bars.spark { width: 7rem; height: 1.5rem; gap: 2px; }
  .bars.small { height: 2.5rem; margin-bottom: 0.6rem; gap: 4px; }
`

const PAGE_STYLE = `
  ${BASE_STYLE}
  .toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem; margin-bottom: 1rem; }
  .total { margin: 0; font-size: 1.5rem; font-weight: 600; }
  .range { display: inline-flex; border: 1px solid var(--border-strong); border-radius: var(--radius-sm, 8px); overflow: hidden; }
  .range button {
    min-height: 2.1rem; padding: 0 0.8rem; border: 0; background: var(--surface); color: var(--text-muted);
    font: inherit; font-size: 0.85rem; cursor: pointer;
  }
  .range button + button { border-left: 1px solid var(--border-strong); }
  .range button[aria-pressed='true'] { background: var(--surface-2); color: var(--text); font-weight: 600; }
  .card { padding: 1rem; border: 1px solid var(--border); border-radius: var(--radius, 12px); background: var(--surface); }
  .chart { margin-bottom: 1rem; }
  .axis { display: flex; justify-content: space-between; margin-top: 0.35rem; font-size: 0.75rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  th { text-align: left; font-size: 0.75rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.02em; }
  th, td { padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--border); }
  tr:last-child td { border-bottom: 0; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .table { padding: 0; overflow-x: auto; }
`

const WIDGET_STYLE = `
  ${BASE_STYLE}
  h2 { margin: 0; font-size: 1rem; font-weight: 600; }
  .head { display: flex; align-items: baseline; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.75rem; }
  .total { margin: 0 0 0.6rem; font-size: 1.75rem; font-weight: 600; font-variant-numeric: tabular-nums; }
  ol { list-style: none; margin: 0; padding: 0; }
  li { display: flex; justify-content: space-between; gap: 0.75rem; padding: 0.4rem 0; border-top: 1px solid var(--border); font-size: 0.875rem; }
  li span:last-child { font-variant-numeric: tabular-nums; color: var(--text-muted); }
  p { margin: 0; font-size: 0.875rem; }
`

/** The browser's time zone, so days start at the editor's midnight. */
const timeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/**
 * Bars for counts per day, scaled to the highest, each with a tooltip. With a label, the chart
 * is one image for screen readers; without, it is decoration (the numbers are next to it).
 */
function bars(
  counts: readonly number[],
  titles: readonly string[],
  kind: string,
  label?: string,
): string {
  const max = Math.max(1, ...counts)
  const items = counts
    .map((n, i) => {
      const height = n === 0 ? 0 : Math.max(4, Math.round((n / max) * 100))
      const title = titles[i] ? ` title="${esc(titles[i] ?? '')}"` : ''
      return `<span class="bar${n === 0 ? ' zero' : ''}" style="height:${height}%"${title}></span>`
    })
    .join('')
  const role = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"'
  return `<div class="bars ${kind}" ${role}>${items}</div>`
}

/** Shared by both elements: the properties the admin sets, translations and links. */
abstract class StatsElement extends HTMLElement {
  props: Record<string, unknown> = {}
  stats: FormStats | null = null
  failed = false
  #loadedFor = ''

  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
  }

  connectedCallback() {
    this.update()
  }

  protected get settings(): Options {
    return (this.props.options ?? {}) as Options
  }
  protected get uiLang(): 'en' | 'th' {
    return this.props.uiLocale === 'th' ? 'th' : 'en'
  }
  protected t(key: Key, values: Record<string, string | number> = {}): string {
    return MESSAGES[this.uiLang][key].replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ''))
  }
  protected number(n: number): string {
    return new Intl.NumberFormat(this.uiLang === 'th' ? 'th-TH' : 'en-GB').format(n)
  }
  protected date(day: string): string {
    return new Intl.DateTimeFormat(this.uiLang === 'th' ? 'th-TH' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(`${day}T00:00:00Z`))
  }
  protected totalText(n: number): string {
    return n === 1 ? this.t('totalOne') : this.t('total', { n: this.number(n) })
  }
  /** An admin path as a link: a real address, opened in the admin without reloading. */
  protected link(path: string, text: string, attrs = ''): string {
    const href = `${this.settings.adminPath ?? '/admin'}${path}`
    return `<a href="${esc(href)}" data-to="${esc(path)}" ${attrs}>${esc(text)}</a>`
  }
  protected wireLinks(root: ShadowRoot) {
    for (const a of root.querySelectorAll<HTMLAnchorElement>('a[data-to]')) {
      a.addEventListener('click', (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
          return
        event.preventDefault()
        this.navigate(a.dataset.to ?? '/')
      })
    }
  }
  protected navigate(path: string) {
    this.dispatchEvent(new CustomEvent('navigate', { detail: path }))
  }

  /** Loads the numbers for `days` once per range. */
  protected async load(days: number) {
    const api = this.props.api as Api | undefined
    const key = `${days}`
    if (!api || key === this.#loadedFor) return
    this.#loadedFor = key
    try {
      const stats = (await api(
        'GET',
        `/form/stats.json?days=${days}&tz=${encodeURIComponent(timeZone())}`,
      )) as FormStats
      if (key !== this.#loadedFor) return
      this.stats = stats
      this.failed = false
    } catch {
      this.failed = true
    }
    this.update()
  }

  abstract update(): void
}

for (const name of ['options', 'uiLocale', 'api', 'route', 'user', 'apiVersion']) {
  Object.defineProperty(StatsElement.prototype, name, {
    get(this: StatsElement) {
      return this.props[name]
    },
    set(this: StatsElement, value: unknown) {
      this.props[name] = value
      this.update()
    },
  })
}

class FormsOverview extends StatsElement {
  get #days(): number {
    const route = this.props.route as { query?: Record<string, string> } | undefined
    return route?.query?.range === '30' ? 30 : 7
  }

  update() {
    const root = this.shadowRoot
    if (!root) return
    const days = this.#days
    // Re-drawing replaces the buttons: keep the focus on the one that had it.
    const focused = (root.activeElement as HTMLElement | null)?.dataset?.days
    void this.load(days)
    const stats = this.stats?.days === days ? this.stats : null
    const { submissions } = this.settings
    const range = `
      <div class="range" role="group" aria-label="${esc(this.t('range'))}">
        ${[7, 30]
          .map(
            (d) =>
              `<button type="button" data-days="${d}" aria-pressed="${d === days}">${esc(this.t(d === 7 ? 'days7' : 'days30'))}</button>`,
          )
          .join('')}
      </div>`
    let body: string
    if (this.failed) body = `<p class="muted">${esc(this.t('failed'))}</p>`
    else if (!stats) body = `<p class="muted">${esc(this.t('loading'))}</p>`
    else if (stats.forms.length === 0) body = `<p class="muted">${esc(this.t('noForms'))}</p>`
    else {
      const titles = stats.dates.map((d, i) =>
        this.t('day', { date: this.date(d), n: this.number(stats.perDay[i] ?? 0) }),
      )
      const rows = stats.forms
        .map((form) => {
          const spark = bars(form.perDay, [], 'spark')
          return `<tr>
            <td>${esc(form.title)}</td>
            <td class="spark">${spark}</td>
            <td class="num">${esc(this.number(form.total))}</td>
            <td>${this.link(`/collections/${submissions}?f_form=${encodeURIComponent(String(form.id))}`, this.t('view'), `aria-label="${esc(`${this.t('view')}: ${form.title}`)}"`)}</td>
          </tr>`
        })
        .join('')
      body = `
        <div class="card chart">
          ${bars(stats.perDay, titles, 'big', this.t('chart', { n: this.number(stats.total) }))}
          <div class="axis muted" aria-hidden="true"><span>${esc(this.date(stats.dates[0] ?? ''))}</span><span>${esc(this.date(stats.dates.at(-1) ?? ''))}</span></div>
        </div>
        <div class="card table">
          <table>
            <thead><tr><th scope="col">${esc(this.t('form'))}</th><th scope="col"><span class="sr">${esc(this.t('trend'))}</span></th><th scope="col" class="num">${esc(this.t('count'))}</th><th scope="col"><span class="sr">${esc(this.t('actions'))}</span></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`
    }
    root.innerHTML = `<style>${PAGE_STYLE}</style>
      <div class="toolbar">
        <p class="total" aria-live="polite">${stats?.forms.length ? esc(this.totalText(stats.total)) : ''}</p>
        ${range}
      </div>
      ${body}`
    for (const button of root.querySelectorAll<HTMLButtonElement>('button[data-days]')) {
      button.addEventListener('click', () => {
        const d = button.dataset.days === '30' ? '30' : '7'
        // In the address, so the range survives a reload and can be shared.
        this.navigate(d === '30' ? '/p/forms-overview?range=30' : '/p/forms-overview')
      })
      if (focused && button.dataset.days === focused) button.focus()
    }
    this.wireLinks(root)
  }
}

class FormsWidget extends StatsElement {
  update() {
    const root = this.shadowRoot
    if (!root) return
    void this.load(7)
    const stats = this.stats
    let body: string
    if (this.failed) body = `<p class="muted">${esc(this.t('failed'))}</p>`
    else if (!stats) body = `<p class="muted">${esc(this.t('loading'))}</p>`
    else {
      const top = stats.forms.filter((f) => f.total > 0).slice(0, 3)
      const titles = stats.dates.map((d, i) =>
        this.t('day', { date: this.date(d), n: this.number(stats.perDay[i] ?? 0) }),
      )
      body = `
        <p class="total">${esc(this.totalText(stats.total))}</p>
        ${bars(stats.perDay, titles, 'small', this.t('chart', { n: this.number(stats.total) }))}
        ${
          top.length
            ? `<ol>${top.map((f) => `<li><span>${esc(f.title)}</span><span>${esc(this.number(f.total))}</span></li>`).join('')}</ol>`
            : `<p class="muted">${esc(this.t('widgetNone'))}</p>`
        }`
    }
    root.innerHTML = `<style>${WIDGET_STYLE}</style>
      <section aria-labelledby="title">
        <div class="head">
          <h2 id="title">${esc(this.t('widgetTitle'))}</h2>
          <span class="muted">${esc(this.t('days7'))}</span>
        </div>
        ${body}
        <p style="margin-top:0.75rem">${this.link('/p/forms-overview', `${this.t('overview')} →`)}</p>
      </section>`
    this.wireLinks(root)
  }
}

/** Defines `<ecms-forms-overview>` and `<ecms-forms-widget>`, once. */
export function defineOverviewElements() {
  if (!customElements.get('ecms-forms-overview'))
    customElements.define('ecms-forms-overview', FormsOverview)
  if (!customElements.get('ecms-forms-widget'))
    customElements.define('ecms-forms-widget', FormsWidget)
}
