/**
 * The plugin's admin module (#312): Web Components the Easy CMS admin shows on social posts (the
 * channel picker, the character count, the posting panel) and Share on the documents they come
 * from. Plain DOM, no framework; styles use the admin's CSS variables.
 */
import {
  ACTION_PATH,
  AI_PATH,
  CHANNELS_PATH,
  type ChannelDelivery,
  type ChannelOption,
  type Delivery,
  SHARE_PATH,
} from './shared.js'

type Api = (method: string, path: string, body?: unknown) => Promise<unknown>
type Doc = Record<string, unknown>

interface Context {
  value: unknown
  path: string | undefined
  doc: Doc
  collection: string | undefined
  id: string | number | null
  uiLocale: string
  readOnly: boolean
  api: Api | undefined
}
const PROPERTIES = [
  'value',
  'path',
  'doc',
  'collection',
  'id',
  'uiLocale',
  'readOnly',
  'api',
] as const

const MESSAGES = {
  en: {
    pick: 'Choose a channel',
    gone: '{id} (not connected)',
    none: 'No channel is connected yet: add one in Settings → Integrations.',
    chars: '{n} characters',
    charsMax: '{n} / {max} characters',
    over: 'Too long for {channel}',
    saveFirst: 'Save the post first, then post it.',
    savedOnly: 'Posts what is saved: save your changes first.',
    postNow: 'Post now',
    confirmNow: 'Post to {n} channels now? Posts can’t be taken back from here.',
    schedule: 'Schedule',
    when: 'Post at',
    scheduledFor: 'Scheduled for {time}',
    cancel: 'Cancel the schedule',
    retry: 'Retry',
    waiting: 'Not posted',
    scheduled: 'Scheduled',
    sending: 'Sending…',
    retrying: 'Trying again at {time}',
    posted: 'Posted',
    view: 'View post',
    failed: 'Failed',
    noRight: 'You may write this post; someone who may post sends it.',
    share: 'Share on social media',
    shareSave: 'Save first, then share.',
    sharing: 'Creating a post…',
    writeAi: 'Write with AI',
    writingAi: 'Writing…',
    spentAi: "Today's AI requests are used up",
    replaceAi: 'Replace this text with one written by AI?',
    writtenAi: 'Written by AI: check it before posting.',
    undo: 'Undo',
  },
  th: {
    pick: 'เลือกช่องทาง',
    gone: '{id} (ไม่ได้เชื่อมต่อแล้ว)',
    none: 'ยังไม่มีช่องทางที่เชื่อมต่อ: เพิ่มได้ใน Settings → การเชื่อมต่อ',
    chars: '{n} ตัวอักษร',
    charsMax: '{n} / {max} ตัวอักษร',
    over: 'ยาวเกินสำหรับ {channel}',
    saveFirst: 'บันทึกโพสต์ก่อน แล้วค่อยโพสต์',
    savedOnly: 'จะโพสต์ตามที่บันทึกไว้: บันทึกการแก้ไขก่อน',
    postNow: 'โพสต์เลย',
    confirmNow: 'โพสต์ไป {n} ช่องทางเลยไหม? ยกเลิกโพสต์จากที่นี่ไม่ได้',
    schedule: 'ตั้งเวลา',
    when: 'โพสต์เวลา',
    scheduledFor: 'ตั้งเวลาไว้ {time}',
    cancel: 'ยกเลิกการตั้งเวลา',
    retry: 'ลองอีกครั้ง',
    waiting: 'ยังไม่โพสต์',
    scheduled: 'ตั้งเวลาไว้',
    sending: 'กำลังส่ง…',
    retrying: 'จะลองใหม่เวลา {time}',
    posted: 'โพสต์แล้ว',
    view: 'ดูโพสต์',
    failed: 'ไม่สำเร็จ',
    noRight: 'คุณเขียนโพสต์นี้ได้ ส่วนการโพสต์ต้องให้ผู้ที่มีสิทธิ์เป็นคนกด',
    share: 'แชร์ไปโซเชียล',
    shareSave: 'บันทึกก่อน แล้วค่อยแชร์',
    sharing: 'กำลังสร้างโพสต์…',
    writeAi: 'เขียนด้วย AI',
    writingAi: 'กำลังเขียน…',
    spentAi: 'ใช้คำขอ AI ของวันนี้ครบแล้ว',
    replaceAi: 'แทนที่ข้อความนี้ด้วยข้อความที่ AI เขียนไหม?',
    writtenAi: 'เขียนโดย AI: ตรวจดูก่อนโพสต์',
    undo: 'เลิกทำ',
  },
} as const
type MessageKey = keyof (typeof MESSAGES)['en']

const esc = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )

/** Characters as people count them: Thai marks join the letter they sit on. */
function length(value: string): number {
  if (typeof Intl.Segmenter !== 'function') return [...value].length
  let count = 0
  for (const _ of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)) count++
  return count
}

/** The channels and whether the user may post: asked once per page (per admin API). */
const channelsCache = new WeakMap<Api, Promise<{ channels: ChannelOption[]; canPost: boolean }>>()
function channelsOf(api: Api) {
  const known = channelsCache.get(api)
  if (known) return known
  const asking = api('GET', CHANNELS_PATH)
    .then((v) => v as { channels: ChannelOption[]; canPost: boolean })
    .catch(() => ({ channels: [], canPost: false }))
  channelsCache.set(api, asking)
  return asking
}

/** Whether "Write with AI" works here: asked once per page (per admin API). */
const aiCache = new WeakMap<Api, Promise<{ ready: boolean; spent: boolean }>>()
function aiOf(api: Api, fresh = false) {
  const known = aiCache.get(api)
  if (known && !fresh) return known
  const asking = api('GET', '/admin/ai/status')
    .then((v) => {
      const s = v as { connected: boolean; features: string[]; used: number; limit: number }
      return { ready: s.connected && s.features.includes('social'), spent: s.used >= s.limit }
    })
    .catch(() => ({ ready: false, spent: false }))
  aiCache.set(api, asking)
  return asking
}

const BASE_STYLE = `
  :host { display: block; font: inherit; color: var(--text); }
  .row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .hint { margin: 0; font-size: 0.8rem; color: var(--text-muted); }
  .error { margin: 0; font-size: 0.8rem; color: var(--danger); }
  button {
    display: inline-flex; align-items: center; gap: 0.35rem; min-height: 2rem; padding: 0 0.75rem;
    border: 1px solid var(--border-strong); border-radius: var(--radius-sm, 8px);
    background: var(--surface); color: var(--text); font: inherit; font-size: 0.85rem; font-weight: 500;
    cursor: pointer;
  }
  button.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-text, #fff); }
  button:hover:not(:disabled) { filter: brightness(0.97); }
  button:focus-visible, select:focus-visible, input:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  button:disabled { opacity: 0.6; cursor: default; }
  select, input {
    min-height: 2.4rem; padding: 0 0.7rem; border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm, 8px); background: var(--surface); color: var(--text); font: inherit;
  }
  a { color: var(--accent-ink); }
`

abstract class SocialElement extends HTMLElement {
  protected ctx: Context = {
    value: undefined,
    path: undefined,
    doc: {},
    collection: undefined,
    id: null,
    uiLocale: 'en',
    readOnly: false,
    api: undefined,
  }
  protected channels: ChannelOption[] = []
  protected canPost = false
  private asked = false
  private queued = false
  private html = ''

  constructor() {
    super()
    const root = this.attachShadow({ mode: 'open' })
    root.addEventListener('click', (event) => {
      const target = (event.target as Element).closest('[data-action]')
      const action = target?.getAttribute('data-action')
      if (action && target?.tagName !== 'SELECT') void this.onAction(action, target as HTMLElement)
    })
    root.addEventListener('change', (event) => this.onChange(event.target as HTMLInputElement))
  }

  static {
    for (const name of PROPERTIES)
      Object.defineProperty(SocialElement.prototype, name, {
        get(this: SocialElement) {
          return this.ctx[name]
        },
        set(this: SocialElement, value: unknown) {
          ;(this.ctx as unknown as Record<string, unknown>)[name] = value
          this.update()
        },
      })
  }

  connectedCallback() {
    this.update()
  }

  protected t(key: MessageKey, params: Record<string, string | number> = {}): string {
    const messages = this.ctx.uiLocale === 'th' ? MESSAGES.th : MESSAGES.en
    return messages[key].replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''))
  }
  protected time(iso: string): string {
    return new Date(iso).toLocaleString(this.ctx.uiLocale === 'th' ? 'th-TH' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  }
  protected labelOf(id: string): string {
    return this.channels.find((c) => c.id === id)?.label ?? id
  }

  protected update() {
    if (!this.asked && this.ctx.api) {
      this.asked = true
      void channelsOf(this.ctx.api).then(({ channels, canPost }) => {
        this.channels = channels
        this.canPost = canPost
        this.update()
      })
    }
    if (this.queued) return
    this.queued = true
    queueMicrotask(() => {
      this.queued = false
      const root = this.shadowRoot
      if (!root) return
      const html = `<style>${BASE_STYLE}${this.css()}</style>${this.render()}`
      if (html === this.html) return
      const focused = root.activeElement?.getAttribute('data-action')
      this.html = html
      root.innerHTML = html
      if (focused) root.querySelector<HTMLElement>(`[data-action="${focused}"]`)?.focus()
    })
  }

  protected onAction(_action: string, _target: HTMLElement): void | Promise<void> {}
  protected onChange(_target: HTMLInputElement): void {}
  protected css(): string {
    return ''
  }
  protected abstract render(): string
}

/** A channel row's connection: the connected channels, as a select. */
class SocialChannelPicker extends SocialElement {
  protected render() {
    const value = typeof this.ctx.value === 'string' ? this.ctx.value : ''
    const delivery = (this.ctx.doc.delivery ?? null) as Delivery | null
    const posted = !!value && delivery?.channels?.[value]?.state === 'posted'
    if (this.channels.length === 0 && !value) return `<p class="hint">${esc(this.t('none'))}</p>`
    const known = this.channels.some((c) => c.id === value)
    return `
      <select data-action="pick" aria-label="${esc(this.t('pick'))}" ${this.ctx.readOnly || posted ? 'disabled' : ''}>
        ${value ? '' : `<option value="">${esc(this.t('pick'))}</option>`}
        ${!known && value ? `<option value="${esc(value)}" selected>${esc(this.t('gone', { id: value }))}</option>` : ''}
        ${this.channels
          .map(
            (c) =>
              `<option value="${esc(c.id)}" ${c.id === value ? 'selected' : ''}>${esc(c.label)}</option>`,
          )
          .join('')}
      </select>
    `
  }
  protected override css() {
    return 'select { width: 100%; }'
  }
  protected override onChange(target: HTMLInputElement) {
    if (target.getAttribute('data-action') !== 'pick') return
    this.dispatchEvent(new CustomEvent('change', { detail: target.value }))
  }
}

/**
 * Under a post's text (or a channel's): its length against the channels' limits, and Write with AI
 * (with an AI plugin), into the field for review with Undo.
 */
class SocialCount extends SocialElement {
  private ai = { ready: false, spent: false }
  private aiAsked = false
  private busy = false
  private beforeAi: { value: unknown } | null = null
  private notice: string | null = null

  protected override css() {
    return `
      .bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.25rem 0.75rem; }
      .ai { color: var(--accent-ink); font-weight: 600; border-color: transparent; background: transparent; }
      .written { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin: 0.25rem 0 0; font-size: 0.8rem; color: var(--accent-ink); }
    `
  }

  protected render() {
    if (!this.aiAsked && this.ctx.api) {
      this.aiAsked = true
      void aiOf(this.ctx.api).then((status) => {
        this.ai = status
        this.update()
      })
    }
    const button =
      this.ai.ready && !this.ctx.readOnly
        ? `<button type="button" class="ai" data-action="ai" ${this.busy || this.ai.spent ? 'disabled' : ''}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/></svg>
            ${esc(this.t(this.busy ? 'writingAi' : this.ai.spent ? 'spentAi' : 'writeAi'))}
          </button>`
        : ''
    return `
      <div class="bar">${this.count()}${button}</div>
      ${this.beforeAi ? `<p class="written" role="status">${esc(this.t('writtenAi'))} <button type="button" data-action="undo-ai">${esc(this.t('undo'))}</button></p>` : ''}
      ${this.notice ? `<p class="error" role="alert">${esc(this.notice)}</p>` : ''}
    `
  }

  protected override async onAction(action: string) {
    const { api, path, id, doc } = this.ctx
    if (!api || !path) return
    const set = (value: unknown) =>
      this.dispatchEvent(new CustomEvent('set-field', { detail: { path, value } }))
    if (action === 'undo-ai' && this.beforeAi) {
      set(this.beforeAi.value)
      this.beforeAi = null
      this.update()
      return
    }
    if (action !== 'ai' || this.busy) return
    const current = typeof this.ctx.value === 'string' ? this.ctx.value.trim() : ''
    if (current && !window.confirm(this.t('replaceAi'))) return
    const match = /^channels\.(\d+)\.text$/.exec(path)
    const rows = Array.isArray(doc.channels) ? (doc.channels as Doc[]) : []
    const channel = match ? rows[Number(match[1])]?.connection : undefined
    this.busy = true
    this.notice = null
    this.update()
    try {
      const result = (await api('POST', AI_PATH, {
        post: id,
        doc: { title: doc.title, text: doc.text, source: doc.source ?? null },
        ...(typeof channel === 'string' ? { channel } : {}),
      })) as { text: string }
      this.beforeAi ??= { value: this.ctx.value ?? null }
      set(result.text)
    } catch (error) {
      this.notice = (error as Error).message
    } finally {
      this.busy = false
      this.ai = await aiOf(api, true)
      this.update()
    }
  }

  private count() {
    const value = typeof this.ctx.value === 'string' ? this.ctx.value : ''
    const n = length(value.trim())
    const rows = Array.isArray(this.ctx.doc.channels) ? (this.ctx.doc.channels as Doc[]) : []
    // `channels.2.text`: that row's channel; the post's text: the rows that use it.
    const match = /^channels\.(\d+)\.text$/.exec(this.ctx.path ?? '')
    const using = match
      ? rows.filter((_, i) => i === Number(match[1]))
      : rows.filter((r) => !(typeof r.text === 'string' && r.text.trim()))
    const limits = using
      .map((r) => this.channels.find((c) => c.id === r.connection))
      .filter((c): c is ChannelOption => !!c?.maxLength)
    const tightest = limits.sort((a, b) => (a.maxLength ?? 0) - (b.maxLength ?? 0))[0]
    if (!tightest) return `<span class="hint">${esc(this.t('chars', { n }))}</span>`
    const over = n > (tightest.maxLength ?? Number.POSITIVE_INFINITY)
    return `<span class="${over ? 'error' : 'hint'}">${esc(this.t('charsMax', { n, max: tightest.maxLength ?? 0 }))}${over ? ` · ${esc(this.t('over', { channel: tightest.label }))}` : ''}</span>`
  }
}

/** The side panel: each channel's state, Post now, Schedule, Retry. */
class SocialPanel extends SocialElement {
  private live: Delivery | null = null
  private busy = false
  private notice: string | null = null
  /** What would stop the post (a private image, an unpublished source), said before posting. */
  private problems: string[] = []
  private checkedFor: string | null = null
  private timer: ReturnType<typeof setTimeout> | undefined

  disconnectedCallback() {
    clearTimeout(this.timer)
  }

  private delivery(): Delivery {
    return this.live ?? ((this.ctx.value ?? { channels: {} }) as Delivery)
  }

  protected override css() {
    return `
      .panel { display: flex; flex-direction: column; gap: 0.75rem; }
      ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
      li { display: flex; flex-direction: column; gap: 0.2rem; padding: 0.55rem 0.65rem; border: 1px solid var(--border); border-radius: var(--radius-sm, 8px); background: var(--surface); }
      .name { font-weight: 600; font-size: 0.875rem; }
      .state { display: inline-flex; align-self: flex-start; gap: 0.3rem; padding: 0.05rem 0.5rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; background: var(--surface-2); color: var(--text-muted); }
      .posted .state { background: var(--success-soft); color: var(--ok); }
      .failed .state { background: var(--danger-soft); color: var(--danger); }
      .sending .state, .scheduled .state { background: var(--accent-soft); color: var(--accent-ink); }
      .schedule { display: flex; gap: 0.4rem; flex-wrap: wrap; }
      .schedule input { flex: 1 1 10rem; }
      .warning { margin: 0; padding: 0.5rem 0.65rem; border-radius: var(--radius-sm, 8px); background: var(--warning-soft); color: var(--warning-text); font-size: 0.8rem; }
    `
  }

  /** Asks the server about the form's image and source, again when they change. */
  private check() {
    const { api, id } = this.ctx
    const { image = null, source = null } = this.ctx.doc
    const key = JSON.stringify([id, image, source])
    if (!api || id === null || key === this.checkedFor) return
    this.checkedFor = key
    void api('POST', ACTION_PATH, { post: id, action: 'check', image, source })
      .then((result) => {
        this.problems = (result as { problems?: string[] }).problems ?? []
        this.update()
      })
      .catch(() => {})
  }

  protected render() {
    const id = this.ctx.id
    if (id === null) return `<p class="hint">${esc(this.t('saveFirst'))}</p>`
    this.check()
    const delivery = this.delivery()
    const rows = (
      Array.isArray(this.ctx.doc.channels) ? (this.ctx.doc.channels as Doc[]) : []
    ).filter((r) => typeof r.connection === 'string' && r.connection)
    const stateOf = (c: string): ChannelDelivery =>
      delivery.channels?.[c] ?? { state: 'waiting', attempts: 0 }
    // Channels Post now would send: not posted, and not already on their way.
    const open = rows.filter((r) =>
      ['waiting', 'scheduled'].includes(stateOf(r.connection as string).state),
    )
    const scheduled = rows.some((r) => stateOf(r.connection as string).state === 'scheduled')
    const items = rows
      .map((r) => {
        const c = r.connection as string
        const s = stateOf(c)
        const label =
          s.state === 'sending' && s.attempts > 0 && s.nextAttemptAt
            ? this.t('retrying', { time: this.time(s.nextAttemptAt) })
            : this.t(s.state)
        return `
          <li class="${s.state}" data-channel="${esc(c)}">
            <span class="name">${esc(this.labelOf(c))}</span>
            <span class="state">${esc(label)}</span>
            ${s.state === 'posted' && s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(this.t('view'))}</a>` : ''}
            ${s.error && s.state !== 'posted' ? `<p class="error">${esc(s.error)}</p>` : ''}
            ${s.state === 'failed' && this.canPost ? `<div class="row"><button type="button" data-action="retry" data-channel="${esc(c)}" ${this.busy ? 'disabled' : ''}>${esc(this.t('retry'))}</button></div>` : ''}
          </li>`
      })
      .join('')
    const actions = !this.canPost
      ? `<p class="hint">${esc(this.t('noRight'))}</p>`
      : open.length === 0
        ? ''
        : `
        <div class="row"><button type="button" class="primary" data-action="now" ${this.busy ? 'disabled' : ''}>${esc(this.t('postNow'))}</button></div>
        ${
          scheduled && delivery.postAt
            ? `<p class="hint">${esc(this.t('scheduledFor', { time: this.time(delivery.postAt) }))}</p>
               <div class="row"><button type="button" data-action="cancel" ${this.busy ? 'disabled' : ''}>${esc(this.t('cancel'))}</button></div>`
            : `<div class="schedule">
                 <input type="datetime-local" data-field="when" aria-label="${esc(this.t('when'))}" />
                 <button type="button" data-action="schedule" ${this.busy ? 'disabled' : ''}>${esc(this.t('schedule'))}</button>
               </div>`
        }
        <p class="hint">${esc(this.t('savedOnly'))}</p>`
    return `
      <div class="panel">
        ${rows.length ? `<ul>${items}</ul>` : `<p class="hint">${esc(this.t('none'))}</p>`}
        ${this.problems.map((p) => `<p class="warning">${esc(p)}</p>`).join('')}
        ${rows.length ? actions : ''}
        ${this.notice ? `<p class="error" role="alert">${esc(this.notice)}</p>` : ''}
      </div>
    `
  }

  protected override async onAction(action: string, target: HTMLElement) {
    const { api, id } = this.ctx
    if (!api || id === null || this.busy) return
    const body: Record<string, unknown> = { post: id, action }
    if (action === 'retry') body.channel = target.getAttribute('data-channel')
    if (action === 'schedule') {
      const input = this.shadowRoot?.querySelector<HTMLInputElement>('[data-field="when"]')
      if (!input?.value) {
        input?.focus()
        return
      }
      body.postAt = new Date(input.value).toISOString()
    }
    if (action === 'now') {
      const rows = (this.ctx.doc.channels ?? []) as Doc[]
      const n = rows.filter(
        (r) => this.delivery().channels?.[String(r.connection)]?.state !== 'posted',
      ).length
      if (!window.confirm(this.t('confirmNow', { n }))) return
    }
    this.busy = true
    this.notice = null
    this.update()
    try {
      const result = (await api('POST', ACTION_PATH, body)) as { delivery: Delivery }
      this.live = result.delivery
      this.watch()
    } catch (error) {
      this.notice = (error as Error).message
    } finally {
      this.busy = false
      this.update()
    }
  }

  /** While a channel is being tried again, reads the post now and then. */
  private watch() {
    clearTimeout(this.timer)
    const sending = Object.values(this.delivery().channels ?? {}).some((c) => c.state === 'sending')
    if (!sending || !this.ctx.api || !this.ctx.collection || this.ctx.id === null) return
    this.timer = setTimeout(async () => {
      try {
        const doc = (await this.ctx.api?.(
          'GET',
          `/${this.ctx.collection}/${encodeURIComponent(String(this.ctx.id))}?depth=0`,
        )) as Doc
        this.live = (doc.delivery ?? null) as Delivery | null
        this.update()
      } catch {
        // Next time.
      }
      this.watch()
    }, 5000)
  }
}

/** On a source document's edit page: a social post filled from it. */
class SocialShare extends SocialElement {
  private busy = false
  private notice: string | null = null

  protected render() {
    const saved = this.ctx.id !== null
    return `
      <div class="row">
        <button type="button" data-action="share" ${!saved || this.busy ? 'disabled' : ''}>${esc(this.t(this.busy ? 'sharing' : 'share'))}</button>
      </div>
      ${saved ? '' : `<p class="hint">${esc(this.t('shareSave'))}</p>`}
      ${this.notice ? `<p class="error" role="alert">${esc(this.notice)}</p>` : ''}
    `
  }

  protected override async onAction(action: string) {
    const { api, id, collection } = this.ctx
    if (action !== 'share' || !api || id === null || this.busy) return
    this.busy = true
    this.notice = null
    this.update()
    try {
      const result = (await api('POST', SHARE_PATH, { collection, id })) as { path: string }
      this.dispatchEvent(new CustomEvent('navigate', { detail: result.path }))
    } catch (error) {
      this.notice = (error as Error).message
    } finally {
      this.busy = false
      this.update()
    }
  }
}

const define = (tag: string, element: CustomElementConstructor) => {
  if (!customElements.get(tag)) customElements.define(tag, element)
}
define('ecms-social-channel', SocialChannelPicker)
define('ecms-social-count', SocialCount)
define('ecms-social-panel', SocialPanel)
define('ecms-social-share', SocialShare)
