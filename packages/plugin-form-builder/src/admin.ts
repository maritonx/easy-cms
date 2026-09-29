/**
 * The plugin's admin module: the side panel of a form's edit page, with its submissions count,
 * a link to them, a CSV export and the snippet to put the form on a page. Plain DOM, no
 * framework; styles use the admin's CSS variables.
 */

type Api = (method: string, path: string, body?: unknown) => Promise<unknown>

interface Props {
  submissions: string
  adminPath: string
  apiPath: string
}

const MESSAGES = {
  en: {
    title: 'Submissions',
    count: '{n} received',
    none: 'None yet',
    view: 'View submissions',
    csv: 'Export CSV',
    embed: 'Put it on a page',
    unsaved: 'Save the form to see its submissions.',
    draft: 'Publish the form to accept submissions.',
  },
  th: {
    title: 'ข้อมูลที่ส่งมา',
    count: 'ได้รับ {n} รายการ',
    none: 'ยังไม่มี',
    view: 'ดูข้อมูลที่ส่งมา',
    csv: 'Export CSV',
    embed: 'ใส่ในหน้าเว็บ',
    unsaved: 'บันทึกฟอร์มก่อนเพื่อดูข้อมูลที่ส่งมา',
    draft: 'เผยแพร่ฟอร์มเพื่อเริ่มรับข้อมูล',
  },
} as const

const esc = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )

const STYLE = `
  :host { display: block; font: inherit; color: var(--text); }
  h3 { margin: 0 0 0.5rem; font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.02em; color: var(--text-muted); }
  p { margin: 0 0 0.6rem; font-size: 0.875rem; }
  .hint { color: var(--text-muted); font-size: 0.8rem; }
  .actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem; }
  a.btn {
    display: inline-flex; align-items: center; min-height: 1.9rem; padding: 0 0.7rem;
    border: 1px solid var(--border-strong); border-radius: var(--radius-sm, 8px);
    background: var(--surface); color: var(--text); font-size: 0.8rem; font-weight: 500; text-decoration: none;
  }
  a.btn:hover { background: var(--surface-2); }
  a.btn:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  code { display: block; padding: 0.5rem; border-radius: var(--radius-sm, 8px); background: var(--surface-2); font-size: 0.75rem; overflow-x: auto; white-space: pre; }
`

class FormSubmissions extends HTMLElement {
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
      'apiVersion',
      'field',
      'label',
    ]) {
      Object.defineProperty(FormSubmissions.prototype, name, {
        get(this: FormSubmissions) {
          return this.props[name]
        },
        set(this: FormSubmissions, value: unknown) {
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
    if (!api || id === this.loadedFor) return
    this.loadedFor = id
    try {
      const result = (await api(
        'GET',
        `/${options.submissions}?where[form][equals]=${encodeURIComponent(String(id))}&limit=1`,
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
    const doc = (this.props.doc ?? {}) as Record<string, unknown>
    const slug = typeof doc.slug === 'string' ? doc.slug : ''
    let body: string
    if (id === null || id === undefined) {
      body = `<p class="hint">${esc(this.t('unsaved'))}</p>`
    } else {
      void this.count(id, options)
      const list = `${options.adminPath}/collections/${options.submissions}?f_form=${encodeURIComponent(String(id))}`
      const csv = `${options.apiPath}/form/${encodeURIComponent(slug)}/submissions.csv`
      body = `
        <p>${esc(this.total === null ? '…' : this.total === 0 ? this.t('none') : this.t('count', this.total))}</p>
        <div class="actions">
          <a class="btn" href="${esc(list)}">${esc(this.t('view'))}</a>
          ${slug ? `<a class="btn" href="${esc(csv)}" download>${esc(this.t('csv'))}</a>` : ''}
        </div>
        ${doc.status === 'draft' ? `<p class="hint">${esc(this.t('draft'))}</p>` : ''}
        ${slug ? `<h3>${esc(this.t('embed'))}</h3><code>${esc(`<easy-form form="${slug}"></easy-form>`)}</code>` : ''}
      `
    }
    root.innerHTML = `<style>${STYLE}</style><section aria-label="${esc(this.t('title'))}"><h3>${esc(this.t('title'))}</h3>${body}</section>`
  }
}

if (!customElements.get('ecms-form-submissions'))
  customElements.define('ecms-form-submissions', FormSubmissions)
