/**
 * `<easy-form form="contact">`: renders a form from Easy CMS and sends it. Light DOM, so your
 * site's CSS styles it (classes `easy-form__…`); `element.css` has optional defaults.
 *
 * Attributes: `form` (the slug), `api` (default `/api/cms`), `locale` (default: the page's
 * `lang`, when it is a content locale). Events: `easy-form:submitted` (`detail.confirmation`)
 * and `easy-form:error` (`detail.errors`).
 */
import { getForm, submitForm } from './client.js'
import type { Confirmation, PublicField, PublicForm } from './shared.js'

const MESSAGES = {
  en: {
    loading: 'Loading the form…',
    missing: 'This form is not available.',
    sending: 'Sending…',
    failed: 'Could not send the form. Check your connection and try again.',
    fix: 'Please check the fields marked below.',
    choose: 'Choose…',
    required: 'Required',
  },
  th: {
    loading: 'กำลังโหลดฟอร์ม…',
    missing: 'ฟอร์มนี้ไม่พร้อมใช้งาน',
    sending: 'กำลังส่ง…',
    failed: 'ส่งฟอร์มไม่สำเร็จ ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง',
    fix: 'โปรดตรวจช่องที่มีเครื่องหมายด้านล่าง',
    choose: 'เลือก…',
    required: 'จำเป็น',
  },
} as const

const esc = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )

const TURNSTILE = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let turnstileScript: Promise<void> | undefined
function loadTurnstile(): Promise<void> {
  turnstileScript ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = TURNSTILE
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Could not load Cloudflare Turnstile'))
    document.head.append(script)
  })
  return turnstileScript
}

interface Turnstile {
  render(element: Element, options: { sitekey: string; callback: (token: string) => void }): string
  reset(id?: string): void
}

let count = 0

export class EasyFormElement extends HTMLElement {
  static observedAttributes = ['form', 'api', 'locale']
  private loaded: PublicForm | null = null
  private turnstileToken = ''
  private turnstileId: string | undefined
  private readonly uid = `easy-form-${++count}`

  // Properties mirror the attributes: Vue and React set properties on custom elements when
  // they exist, attributes otherwise.
  get form(): string | null {
    return this.getAttribute('form')
  }
  set form(value: string | null) {
    this.reflect('form', value)
  }
  get api(): string | null {
    return this.getAttribute('api')
  }
  set api(value: string | null) {
    this.reflect('api', value)
  }
  get locale(): string | null {
    return this.getAttribute('locale')
  }
  set locale(value: string | null) {
    this.reflect('locale', value)
  }

  private reflect(name: string, value: string | null | undefined) {
    if (value === null || value === undefined || value === '') this.removeAttribute(name)
    else this.setAttribute(name, String(value))
  }

  private get apiBase() {
    return this.getAttribute('api') || '/api/cms'
  }

  private get contentLocale() {
    return this.getAttribute('locale') || document.documentElement.lang || null
  }

  private t(key: keyof (typeof MESSAGES)['en']) {
    const locale = this.loaded?.locale ?? this.contentLocale
    return (locale?.startsWith('th') ? MESSAGES.th : MESSAGES.en)[key]
  }

  connectedCallback() {
    void this.load()
  }

  attributeChangedCallback(_name: string, old: string | null, value: string | null) {
    if (old !== value && this.isConnected) void this.load()
  }

  /** Loads the form again, with a fresh token. */
  async load() {
    const slug = this.getAttribute('form')
    if (!slug) return
    this.innerHTML = `<p class="easy-form__status" role="status">${esc(this.t('loading'))}</p>`
    try {
      this.loaded = await getForm(slug, { api: this.apiBase, locale: this.contentLocale })
    } catch {
      this.loaded = null
    }
    if (!this.loaded) {
      this.innerHTML = `<p class="easy-form__status easy-form__status--error" role="alert">${esc(this.t('missing'))}</p>`
      return
    }
    this.render(this.loaded)
  }

  private render(form: PublicForm) {
    const fields = form.fields.map((f) => this.field(f)).join('')
    this.innerHTML = `
      <form class="easy-form" novalidate>
        <div class="easy-form__fields">${fields}</div>
        <div class="easy-form__hp" aria-hidden="true" style="position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden">
          <label>Leave this empty <input type="text" name="${esc(form.honeypot)}" tabindex="-1" autocomplete="off"></label>
        </div>
        ${form.turnstile ? '<div class="easy-form__turnstile"></div>' : ''}
        <p class="easy-form__status" role="status" aria-live="polite"></p>
        <button type="submit" class="easy-form__submit">${esc(form.submitLabel)}</button>
      </form>`
    const element = this.querySelector('form') as HTMLFormElement
    element.addEventListener('submit', (event) => {
      event.preventDefault()
      void this.submit(element)
    })
    if (form.turnstile) void this.mountTurnstile(form.turnstile)
  }

  private field(field: PublicField): string {
    const id = `${this.uid}-${field.name}`
    const width = `easy-form__field easy-form__field--${field.kind} easy-form__field--${field.width}`
    if (field.kind === 'message') return `<div class="easy-form__message">${field.html ?? ''}</div>`
    const required = field.required ? ' required aria-required="true"' : ''
    const mark = field.required
      ? ` <span class="easy-form__required" aria-label="${esc(this.t('required'))}">*</span>`
      : ''
    const label = `<label class="easy-form__label" for="${id}">${esc(field.label)}${mark}</label>`
    const placeholder = field.placeholder ? ` placeholder="${esc(field.placeholder)}"` : ''
    const value =
      typeof field.defaultValue === 'string' ? ` value="${esc(field.defaultValue)}"` : ''
    const error = `<p class="easy-form__error" id="${id}-error" hidden></p>`
    const attrs = `id="${id}" name="${esc(field.name)}" aria-describedby="${id}-error"${required}`
    let control: string
    switch (field.kind) {
      case 'textarea':
        control = `<textarea class="easy-form__input" ${attrs}${placeholder} rows="5">${esc(typeof field.defaultValue === 'string' ? field.defaultValue : '')}</textarea>`
        break
      case 'checkbox':
        return `<div class="${width}">
          <label class="easy-form__check"><input type="checkbox" ${attrs}${field.defaultValue === true ? ' checked' : ''}> ${esc(field.label)}${mark}</label>
          ${error}</div>`
      case 'select': {
        const options = field.options ?? []
        if (field.display === 'radio') {
          const type = field.multiple ? 'checkbox' : 'radio'
          const items = options
            .map(
              (o, i) =>
                `<label class="easy-form__choice"><input type="${type}" name="${esc(field.name)}" value="${esc(o.value)}" id="${id}-${i}"${field.required && !field.multiple ? ' required' : ''}> ${esc(o.label)}</label>`,
            )
            .join('')
          return `<fieldset class="${width}" aria-describedby="${id}-error"><legend class="easy-form__label">${esc(field.label)}${mark}</legend>${items}${error}</fieldset>`
        }
        const items = options
          .map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`)
          .join('')
        const first = field.multiple
          ? ''
          : `<option value="">${esc(field.placeholder ?? this.t('choose'))}</option>`
        control = `<select class="easy-form__input" ${attrs}${field.multiple ? ' multiple' : ''}>${first}${items}</select>`
        break
      }
      default: {
        const type =
          field.kind === 'email'
            ? 'email'
            : field.kind === 'number'
              ? 'number'
              : field.kind === 'phone'
                ? 'tel'
                : field.kind === 'date'
                  ? 'date'
                  : 'text'
        const range = `${field.min !== undefined ? ` min="${field.min}"` : ''}${field.max !== undefined ? ` max="${field.max}"` : ''}`
        const auto =
          field.kind === 'email'
            ? ' autocomplete="email"'
            : field.kind === 'phone'
              ? ' autocomplete="tel"'
              : ''
        control = `<input class="easy-form__input" type="${type}" ${attrs}${placeholder}${value}${range}${auto}>`
      }
    }
    return `<div class="${width}">${label}${control}${error}</div>`
  }

  private async mountTurnstile(siteKey: string) {
    try {
      await loadTurnstile()
      const turnstile = (window as unknown as { turnstile?: Turnstile }).turnstile
      const box = this.querySelector('.easy-form__turnstile')
      if (!turnstile || !box) return
      this.turnstileId = turnstile.render(box, {
        sitekey: siteKey,
        callback: (token) => {
          this.turnstileToken = token
        },
      })
    } catch {
      this.status(this.t('failed'), true)
    }
  }

  /** The form's values by field name. */
  private values(element: HTMLFormElement): Record<string, unknown> {
    const data: Record<string, unknown> = {}
    for (const field of this.loaded?.fields ?? []) {
      if (field.kind === 'message') continue
      const inputs = [
        ...element.querySelectorAll<HTMLInputElement>(`[name="${CSS.escape(field.name)}"]`),
      ]
      if (field.kind === 'checkbox') data[field.name] = inputs[0]?.checked === true
      else if (field.kind === 'select' && field.multiple)
        data[field.name] =
          field.display === 'radio'
            ? inputs.filter((i) => i.checked).map((i) => i.value)
            : [...((inputs[0] as unknown as HTMLSelectElement)?.selectedOptions ?? [])].map(
                (o) => o.value,
              )
      else if (field.kind === 'select' && field.display === 'radio')
        data[field.name] = inputs.find((i) => i.checked)?.value ?? ''
      else data[field.name] = inputs[0]?.value ?? ''
    }
    return data
  }

  private async submit(element: HTMLFormElement) {
    const form = this.loaded
    if (!form) return
    const button = element.querySelector<HTMLButtonElement>('.easy-form__submit')
    if (button) button.disabled = true
    this.clearErrors()
    this.status(this.t('sending'), false)
    const honeypot = element.querySelector<HTMLInputElement>(
      `[name="${CSS.escape(form.honeypot)}"]`,
    )
    let result: Awaited<ReturnType<typeof submitForm>>
    try {
      result = await submitForm(
        form.slug,
        {
          data: this.values(element),
          token: form.token,
          page: location.pathname + location.search,
          locale: form.locale,
          ...(form.turnstile ? { turnstile: this.turnstileToken } : {}),
          [form.honeypot]: honeypot?.value ?? '',
        },
        { api: this.apiBase },
      )
    } catch {
      result = { ok: false, status: 0, errors: [{ message: this.t('failed') }] }
    }
    if (button) button.disabled = false
    if (result.ok) {
      this.dispatchEvent(
        new CustomEvent('easy-form:submitted', {
          detail: { confirmation: result.confirmation },
          bubbles: true,
        }),
      )
      this.confirm(result.confirmation)
      return
    }
    this.dispatchEvent(
      new CustomEvent('easy-form:error', { detail: { errors: result.errors }, bubbles: true }),
    )
    let fieldErrors = 0
    for (const error of result.errors) {
      if (!error.field) continue
      const box = this.querySelector<HTMLElement>(
        `#${CSS.escape(`${this.uid}-${error.field}-error`)}`,
      )
      if (!box) continue
      box.textContent = error.message
      box.hidden = false
      this.querySelector(`#${CSS.escape(`${this.uid}-${error.field}`)}`)?.setAttribute(
        'aria-invalid',
        'true',
      )
      fieldErrors++
    }
    const general = result.errors.filter((e) => !e.field).map((e) => e.message)
    this.status(general.join(' ') || (fieldErrors ? this.t('fix') : this.t('failed')), true)
    // A new token and challenge for the next try.
    if (result.status === 400 && !fieldErrors) void this.load()
    else if (this.turnstileId !== undefined)
      (window as unknown as { turnstile?: Turnstile }).turnstile?.reset(this.turnstileId)
  }

  private confirm(confirmation: Confirmation) {
    if (confirmation.type === 'redirect') {
      location.assign(confirmation.url)
      return
    }
    // The server renders this HTML from rich text, escaped.
    this.innerHTML = `<div class="easy-form__confirmation" role="status" tabindex="-1">${confirmation.html}</div>`
    this.querySelector<HTMLElement>('.easy-form__confirmation')?.focus()
  }

  private clearErrors() {
    for (const box of this.querySelectorAll<HTMLElement>('.easy-form__error')) {
      box.hidden = true
      box.textContent = ''
    }
    for (const input of this.querySelectorAll('[aria-invalid]'))
      input.removeAttribute('aria-invalid')
  }

  private status(text: string, error: boolean) {
    const box = this.querySelector<HTMLElement>('.easy-form__status')
    if (!box) return
    box.textContent = text
    box.classList.toggle('easy-form__status--error', error)
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('easy-form'))
  customElements.define('easy-form', EasyFormElement)
