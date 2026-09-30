/**
 * The plugin's admin module: a page's breadcrumbs in the edit page's side column, and how many
 * pages are under it, with a link to them. Plain DOM, no framework; styles use the admin's CSS
 * variables.
 */

type Api = (method: string, path: string, body?: unknown) => Promise<unknown>

interface Props {
  adminPath: string
  parentField: string
}

interface Row {
  label?: unknown
  url?: unknown
}

const MESSAGES = {
  en: {
    top: 'A top-level page',
    unsaved: 'Save the page to see where it sits.',
    children: '{n} pages under it',
    child: '1 page under it',
    none: 'No pages under it',
    view: 'View them',
    trail: 'Where this page sits',
  },
  th: {
    top: 'หน้าระดับบนสุด',
    unsaved: 'บันทึกหน้าก่อนเพื่อดูตำแหน่งของหน้านี้',
    children: 'มีหน้าย่อย {n} หน้า',
    child: 'มีหน้าย่อย 1 หน้า',
    none: 'ยังไม่มีหน้าย่อย',
    view: 'ดูหน้าย่อย',
    trail: 'ตำแหน่งของหน้านี้',
  },
} as const

const esc = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )

const STYLE = `
  :host { display: block; font: inherit; color: var(--text); }
  ol { display: flex; flex-wrap: wrap; gap: 0.25rem; margin: 0 0 0.5rem; padding: 0; list-style: none; font-size: 0.875rem; }
  li { display: inline-flex; align-items: center; gap: 0.25rem; }
  li + li::before { content: '›'; color: var(--faint); }
  li[aria-current] { font-weight: 600; }
  p { margin: 0 0 0.4rem; font-size: 0.8rem; color: var(--text-muted); }
  a { color: var(--accent-ink, var(--text)); font-size: 0.8rem; font-weight: 500; }
  a:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
`

class NestedBreadcrumbs extends HTMLElement {
  private props: Record<string, unknown> = {}
  private total: number | null = null
  private loadedFor: unknown

  static {
    for (const name of [
      'doc',
      'id',
      'uiLocale',
      'options',
      'api',
      'collection',
      'value',
      'path',
      'global',
      'locale',
      'readOnly',
      'field',
      'label',
    ]) {
      Object.defineProperty(NestedBreadcrumbs.prototype, name, {
        get(this: NestedBreadcrumbs) {
          return this.props[name]
        },
        set(this: NestedBreadcrumbs, value: unknown) {
          this.props[name] = value
          this.render()
        },
      })
    }
  }

  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
  }

  connectedCallback() {
    this.render()
  }

  private t(key: keyof (typeof MESSAGES)['en'], n?: number) {
    const messages = this.props.uiLocale === 'th' ? MESSAGES.th : MESSAGES.en
    return messages[key].replace('{n}', String(n ?? ''))
  }

  private async count(id: unknown, options: Props) {
    const api = this.props.api as Api | undefined
    const collection = this.props.collection
    if (!api || typeof collection !== 'string' || id === this.loadedFor) return
    this.loadedFor = id
    try {
      const result = (await api(
        'GET',
        `/${collection}?where[${options.parentField}][equals]=${encodeURIComponent(String(id))}&limit=1&depth=0&draft=true`,
      )) as { totalDocs?: number }
      this.total = result.totalDocs ?? 0
    } catch {
      this.total = null
    }
    this.render()
  }

  private render() {
    const root = this.shadowRoot
    if (!root) return
    const options = (this.props.options ?? {}) as Props
    const id = this.props.id
    const rows = (Array.isArray(this.props.value) ? this.props.value : []) as Row[]
    let body: string
    if (id === null || id === undefined) {
      body = `<p>${esc(this.t('unsaved'))}</p>`
    } else {
      void this.count(id, options)
      const trail =
        rows.length <= 1
          ? `<p>${esc(this.t('top'))}</p>`
          : `<ol aria-label="${esc(this.t('trail'))}">${rows
              .map((row, i) => {
                const text = esc(String(row.label || row.url || '—'))
                return i === rows.length - 1
                  ? `<li aria-current="page">${text}</li>`
                  : `<li>${text}</li>`
              })
              .join('')}</ol>`
      const list = `${options.adminPath}/collections/${String(this.props.collection)}?f_${options.parentField}=${encodeURIComponent(String(id))}`
      const count =
        this.total === null
          ? ''
          : this.total === 0
            ? `<p>${esc(this.t('none'))}</p>`
            : `<p>${esc(this.total === 1 ? this.t('child') : this.t('children', this.total))} · <a href="${esc(list)}">${esc(this.t('view'))}</a></p>`
      body = trail + count
    }
    root.innerHTML = `<style>${STYLE}</style>${body}`
  }
}

if (!customElements.get('ecms-nested-breadcrumbs'))
  customElements.define('ecms-nested-breadcrumbs', NestedBreadcrumbs)
