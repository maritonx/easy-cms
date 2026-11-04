/**
 * The plugin's admin module: Web Components the Easy CMS admin shows below the SEO fields.
 * Plain DOM, no framework, so the file stays small; styles use the admin's CSS variables.
 */
import {
  GENERATE_PATH,
  type GenerateKind,
  type ImageProps,
  type MeterProps,
  type PreviewProps,
} from './shared.js'

type Api = (method: string, path: string, body?: unknown) => Promise<unknown>

/** The properties the admin sets on each element (its admin component contract, version 1). */
interface Context {
  value: unknown
  path: string | undefined
  doc: Record<string, unknown>
  collection: string | undefined
  global: string | undefined
  id: string | number | null
  locale: string | null
  uiLocale: string
  readOnly: boolean
  options: Record<string, unknown>
  api: Api | undefined
}

const PROPERTIES = [
  'value',
  'path',
  'doc',
  'collection',
  'global',
  'id',
  'locale',
  'uiLocale',
  'readOnly',
  'options',
  'api',
] as const

const MESSAGES = {
  en: {
    characters: '{n} / {max} characters',
    empty: 'Empty: search engines pick text from the page',
    short: 'Short: aim for {min}–{max}',
    good: 'Good length',
    long: 'Too long: may be cut off after {max}',
    generate: 'Generate',
    generating: 'Generating…',
    generateImage: 'Use image from content',
    noValue: 'Nothing to generate from yet',
    failed: 'Could not generate: {message}',
    preview: 'Search result preview',
    noTitle: 'Page title',
    noDescription: 'Add a description to control the text under the title.',
    hidden: 'Hidden from search engines: the page gets "noindex" and is left out of the sitemap.',
    writeAi: 'Write title and description with AI',
    writingAi: 'Writing…',
    spentAi: "Today's AI requests are used up",
    replaceAi: "Replace the title and description you have with AI's?",
    writtenAi: 'Written by AI: check that they fit the page.',
    undo: 'Undo',
  },
  th: {
    characters: '{n} / {max} ตัวอักษร',
    empty: 'ว่าง: เครื่องมือค้นหาจะเลือกข้อความจากหน้าเอง',
    short: 'สั้นไป: ควรยาว {min}–{max}',
    good: 'ความยาวพอดี',
    long: 'ยาวไป: อาจถูกตัดหลัง {max}',
    generate: 'สร้างให้',
    generating: 'กำลังสร้าง…',
    generateImage: 'ใช้รูปจากเนื้อหา',
    noValue: 'ยังไม่มีข้อมูลให้สร้าง',
    failed: 'สร้างไม่สำเร็จ: {message}',
    preview: 'ตัวอย่างผลการค้นหา',
    noTitle: 'ชื่อหน้า',
    noDescription: 'เพิ่มคำอธิบายเพื่อกำหนดข้อความใต้ชื่อหน้า',
    hidden: 'ซ่อนจากเครื่องมือค้นหาอยู่: หน้านี้มี "noindex" และไม่อยู่ใน sitemap',
    writeAi: 'เขียน title และ description ด้วย AI',
    writingAi: 'กำลังเขียน…',
    spentAi: 'ใช้คำขอ AI ของวันนี้ครบแล้ว',
    replaceAi: 'ให้ AI เขียน title และ description แทนที่มีอยู่ไหม?',
    writtenAi: 'เขียนโดย AI: ตรวจดูว่าตรงกับหน้า',
    undo: 'เลิกทำ',
  },
} as const

type MessageKey = keyof (typeof MESSAGES)['en']

/** Escapes text for HTML. */
const esc = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )

/** Characters as people count them: Thai vowel and tone marks join the letter they sit on. */
function length(value: string): number {
  if (typeof Intl.Segmenter !== 'function') return [...value].length
  let count = 0
  for (const _ of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)) count++
  return count
}

function truncate(value: string, max: number): string {
  const chars = [...value]
  return chars.length > max
    ? `${chars
        .slice(0, max - 1)
        .join('')
        .trimEnd()}…`
    : value
}

const BASE_STYLE = `
  :host { display: block; font: inherit; color: var(--text); }
  .row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
  .hint { margin: 0; font-size: 0.8rem; color: var(--text-muted); }
  .error { margin: 0.35rem 0 0; font-size: 0.8rem; color: var(--danger); }
  p.hint { margin-top: 0.35rem; }
  button {
    display: inline-flex; align-items: center; gap: 0.35rem; min-height: 1.9rem; padding: 0 0.7rem;
    border: 1px solid var(--border-strong); border-radius: var(--radius-sm, 8px);
    background: var(--surface); color: var(--text); font: inherit; font-size: 0.8rem; font-weight: 500;
    cursor: pointer;
  }
  button:hover:not(:disabled) { background: var(--surface-2); }
  button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  button:disabled { opacity: 0.6; cursor: default; }
`

/** Whether "Write with AI" works here (#358): asked once per page (per admin API). */
const aiStatus = new WeakMap<Api, Promise<{ ready: boolean; spent: boolean }>>()
function aiReady(api: Api, fresh = false): Promise<{ ready: boolean; spent: boolean }> {
  const known = aiStatus.get(api)
  if (known && !fresh) return known
  const asking = api('GET', '/admin/ai/status')
    .then((value) => {
      const s = value as { connected: boolean; features: string[]; used: number; limit: number }
      return { ready: s.connected && s.features.includes('seo'), spent: s.used >= s.limit }
    })
    // No AI plugin: no button.
    .catch(() => ({ ready: false, spent: false }))
  aiStatus.set(api, asking)
  return asking
}

/** Stores the admin's properties and re-renders once per batch of changes. */
abstract class SeoElement extends HTMLElement {
  protected ctx: Context = {
    value: undefined,
    path: undefined,
    doc: {},
    collection: undefined,
    global: undefined,
    id: null,
    locale: null,
    uiLocale: 'en',
    readOnly: false,
    options: {},
    api: undefined,
  }
  protected busy = false
  /** Shown below the element: what Generate did not do. */
  protected notice: { text: string; error: boolean } | null = null
  private queued = false
  private html = ''

  constructor() {
    super()
    const root = this.attachShadow({ mode: 'open' })
    root.addEventListener('click', (event) => {
      const action = (event.target as Element).closest('[data-action]')?.getAttribute('data-action')
      if (action) void this.onAction(action)
    })
  }

  static {
    for (const name of PROPERTIES) {
      Object.defineProperty(SeoElement.prototype, name, {
        get(this: SeoElement) {
          return this.ctx[name]
        },
        set(this: SeoElement, value: unknown) {
          ;(this.ctx as unknown as Record<string, unknown>)[name] = value
          this.update()
        },
      })
    }
  }

  connectedCallback() {
    this.update()
  }

  protected t(key: MessageKey, params: Record<string, string | number> = {}): string {
    const messages = this.ctx.uiLocale === 'th' ? MESSAGES.th : MESSAGES.en
    return messages[key].replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''))
  }

  protected update() {
    if (this.queued) return
    this.queued = true
    queueMicrotask(() => {
      this.queued = false
      const root = this.shadowRoot
      if (!root) return
      const html = `<style>${BASE_STYLE}${this.css()}</style>${this.render()}`
      if (html === this.html) return
      // Keep keyboard focus on the same button across re-renders.
      const focused = root.activeElement?.getAttribute('data-action')
      this.html = html
      root.innerHTML = html
      if (focused) root.querySelector<HTMLElement>(`[data-action="${focused}"]`)?.focus()
    })
  }

  /** Asks the plugin's endpoint for a value, with the form as it is now. */
  protected async generate(kind: GenerateKind): Promise<unknown> {
    const { api, collection, global, id, doc, locale } = this.ctx
    if (!api) return null
    const result = (await api('POST', GENERATE_PATH, {
      kind,
      ...(collection ? { collection } : {}),
      ...(global ? { global } : {}),
      id,
      doc,
      locale,
    })) as { value?: unknown }
    return result.value ?? null
  }

  /** Runs a Generate button: sets the field at `path` to the generated value. */
  protected async generateInto(kind: GenerateKind, path: string | undefined) {
    if (!path || this.busy) return
    this.busy = true
    this.notice = null
    this.update()
    try {
      const value = await this.generate(kind)
      if (value === null || value === '') this.notice = { text: this.t('noValue'), error: false }
      else this.dispatchEvent(new CustomEvent('set-field', { detail: { path, value } }))
    } catch (error) {
      this.notice = { text: this.t('failed', { message: (error as Error).message }), error: true }
    } finally {
      this.busy = false
      this.update()
    }
  }

  protected renderNotice(): string {
    if (!this.notice) return ''
    const { text, error } = this.notice
    return error
      ? `<p class="error" role="alert">${esc(text)}</p>`
      : `<p class="hint" role="status">${esc(text)}</p>`
  }

  protected onAction(_action: string): void | Promise<void> {}
  protected css(): string {
    return ''
  }
  protected abstract render(): string
}

/** Below the meta title and description: length against the good range, and Generate. */
class SeoMeter extends SeoElement {
  protected override css() {
    return `
      .bar { flex: 1 1 8rem; height: 4px; border-radius: 2px; background: var(--surface-2); overflow: hidden; }
      .fill { height: 100%; border-radius: 2px; }
      .empty .fill { background: var(--border-strong); }
      .short .fill { background: var(--warning-text); }
      .good .fill { background: var(--ok); }
      .long .fill { background: var(--danger); }
      .long .state { color: var(--danger); }
      .good .state { color: var(--ok); }
    `
  }

  protected render() {
    const { kind, min, max, generate } = this.ctx.options as unknown as MeterProps
    const value = typeof this.ctx.value === 'string' ? this.ctx.value : ''
    const n = length(value.trim())
    const state = n === 0 ? 'empty' : n < min ? 'short' : n > max ? 'long' : 'good'
    const fill = Math.min(100, Math.round((n / max) * 100))
    const button =
      generate && !this.ctx.readOnly
        ? `<button type="button" data-action="generate" ${this.busy ? 'disabled' : ''}>${esc(this.t(this.busy ? 'generating' : 'generate'))}</button>`
        : ''
    return `
      <div class="row ${state}" data-kind="${esc(kind)}" data-state="${state}">
        <div class="bar" aria-hidden="true"><div class="fill" style="width:${fill}%"></div></div>
        <span class="hint">${esc(this.t('characters', { n, max }))}</span>
        <span class="hint state">${esc(this.t(state, { min, max }))}</span>
        ${button}
      </div>
      ${this.renderNotice()}
    `
  }

  protected override onAction(action: string) {
    if (action === 'generate') {
      const { kind } = this.ctx.options as unknown as MeterProps
      return this.generateInto(kind, this.ctx.path)
    }
  }
}

/** Below the share image: pick one from the content (e.g. the post's cover). */
class SeoImage extends SeoElement {
  protected render() {
    const { generate } = this.ctx.options as unknown as ImageProps
    if (!generate || this.ctx.readOnly) return ''
    return `
      <div class="row">
        <button type="button" data-action="generate" ${this.busy ? 'disabled' : ''}>${esc(this.t(this.busy ? 'generating' : 'generateImage'))}</button>
      </div>
      ${this.renderNotice()}
    `
  }

  protected override onAction(action: string) {
    if (action === 'generate') return this.generateInto('image', this.ctx.path)
  }
}

/** Below the SEO group: how the page may look in a search result. */
class SeoPreview extends SeoElement {
  private url = ''
  private urlFor = ''
  private timer: ReturnType<typeof setTimeout> | undefined
  /** "Write with AI" shows: a provider is connected and the feature is on. */
  private ai: { ready: boolean; spent: boolean } = { ready: false, spent: false }
  private aiAsked = false
  /** The title and description before AI wrote them, for Undo. */
  private beforeAi: { title: unknown; description: unknown } | null = null

  protected override css() {
    return `
      .card { padding: 0.9rem 1rem; border: 1px solid var(--border); border-radius: var(--radius-sm, 8px); background: var(--surface); }
      .label { margin: 0 0 0.5rem; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.02em; text-transform: uppercase; color: var(--text-muted); }
      .url { margin: 0; font-size: 0.8rem; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .title { margin: 0.15rem 0; font-size: 1.15rem; line-height: 1.3; color: var(--info); }
      .description { margin: 0; font-size: 0.875rem; line-height: 1.5; color: var(--text-muted); }
      .placeholder { font-style: italic; opacity: 0.75; }
      .noindex { margin: 0.6rem 0 0; font-size: 0.8rem; color: var(--warning, var(--text-muted)); }
      .ai { margin-top: 0.6rem; }
      .ai button { color: var(--accent-ink); font-weight: 600; }
      .written { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; color: var(--accent-ink); }
    `
  }

  protected render() {
    const { titleField, url, siteURL } = this.ctx.options as unknown as PreviewProps
    const meta = (readPath(this.ctx.doc, this.ctx.path) ?? {}) as Record<string, unknown>
    const fallback = titleField ? this.ctx.doc[titleField] : undefined
    const title = [meta.title, fallback].find((v) => typeof v === 'string' && v.trim()) as
      | string
      | undefined
    const description = typeof meta.description === 'string' ? meta.description.trim() : ''
    if (url) this.refreshUrl()
    if (!this.aiAsked && this.ctx.api) {
      this.aiAsked = true
      void aiReady(this.ctx.api).then((status) => {
        this.ai = status
        this.update()
      })
    }
    const address = breadcrumb(url ? this.url : siteURL)
    const aiButton =
      this.ai.ready && !this.ctx.readOnly
        ? `<div class="row ai">
            <button type="button" data-action="ai" ${this.busy || this.ai.spent ? 'disabled' : ''}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/></svg>
              ${esc(this.t(this.busy ? 'writingAi' : this.ai.spent ? 'spentAi' : 'writeAi'))}
            </button>
          </div>
          ${this.beforeAi ? `<p class="hint written" role="status">${esc(this.t('writtenAi'))} <button type="button" data-action="undo-ai">${esc(this.t('undo'))}</button></p>` : ''}
          ${this.renderNotice()}`
        : ''
    return `
      <section class="card" aria-label="${esc(this.t('preview'))}">
        <p class="label">${esc(this.t('preview'))}</p>
        ${address ? `<p class="url">${esc(address)}</p>` : ''}
        <p class="title ${title ? '' : 'placeholder'}">${esc(truncate(title ?? this.t('noTitle'), 60))}</p>
        <p class="description ${description ? '' : 'placeholder'}">${esc(description ? truncate(description, 160) : this.t('noDescription'))}</p>
        ${meta.noindex === true ? `<p class="noindex">${esc(this.t('hidden'))}</p>` : ''}
      </section>
      ${aiButton}
    `
  }

  /** "Write with AI": the title and description at once, into the form for review. */
  protected override async onAction(action: string) {
    const path = this.ctx.path
    if (!path || !this.ctx.api) return
    const set = (field: string, value: unknown) =>
      this.dispatchEvent(
        new CustomEvent('set-field', { detail: { path: `${path}.${field}`, value } }),
      )
    if (action === 'undo-ai' && this.beforeAi) {
      set('title', this.beforeAi.title)
      set('description', this.beforeAi.description)
      this.beforeAi = null
      this.update()
      return
    }
    if (action !== 'ai' || this.busy) return
    const meta = (readPath(this.ctx.doc, path) ?? {}) as Record<string, unknown>
    const has = (v: unknown) => typeof v === 'string' && v.trim() !== ''
    if ((has(meta.title) || has(meta.description)) && !window.confirm(this.t('replaceAi'))) return
    this.busy = true
    this.notice = null
    this.update()
    try {
      const { collection, global, id, doc, locale } = this.ctx
      const result = (await this.ctx.api('POST', GENERATE_PATH, {
        kind: 'ai',
        ...(collection ? { collection } : {}),
        ...(global ? { global } : {}),
        id,
        doc,
        locale,
      })) as { value: { title: string; description: string } }
      this.beforeAi ??= { title: meta.title ?? null, description: meta.description ?? null }
      set('title', result.value.title)
      set('description', result.value.description)
    } catch (error) {
      this.notice = { text: this.t('failed', { message: (error as Error).message }), error: true }
    } finally {
      this.busy = false
      // Today's count changed.
      this.ai = await aiReady(this.ctx.api, true)
      this.update()
    }
  }

  /** The page URL comes from `generateURL` on the server; ask again when the form settles. */
  private refreshUrl() {
    const key = JSON.stringify([this.ctx.doc, this.ctx.locale])
    if (key === this.urlFor) return
    this.urlFor = key
    clearTimeout(this.timer)
    this.timer = setTimeout(async () => {
      try {
        const value = await this.generate('url')
        const next = typeof value === 'string' ? value : ''
        if (next !== this.url) {
          this.url = next
          this.update()
        }
      } catch {
        // The preview works without the address.
      }
    }, 400)
  }
}

function readPath(doc: Record<string, unknown>, path: string | undefined): unknown {
  if (!path) return undefined
  return path
    .split('.')
    .reduce<unknown>(
      (value, key) =>
        typeof value === 'object' && value !== null
          ? (value as Record<string, unknown>)[key]
          : undefined,
      doc,
    )
}

/** `https://example.com/posts/hello` → `example.com › posts › hello`, like search results show it. */
function breadcrumb(url: string): string {
  if (!url) return ''
  try {
    const { host, pathname } = new URL(url, 'https://site.invalid')
    const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent)
    const origin = host === 'site.invalid' ? '' : host
    return [origin, ...parts].filter(Boolean).join(' › ')
  } catch {
    return url
  }
}

const define = (tag: string, element: CustomElementConstructor) => {
  if (!customElements.get(tag)) customElements.define(tag, element)
}
define('ecms-seo-meter', SeoMeter)
define('ecms-seo-image', SeoImage)
define('ecms-seo-preview', SeoPreview)
