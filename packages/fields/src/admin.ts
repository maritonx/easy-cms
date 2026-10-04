/**
 * The admin module of `@easy-cms/fields`: the color input (`ecms-color-field`) and its swatch in
 * lists (`ecms-color-cell`). Plain DOM, no framework; styles use the admin's CSS variables.
 */

interface ColorOptions {
  presets?: readonly string[]
  alpha?: boolean
}

const MESSAGES = {
  en: { picker: 'Pick a color', hex: 'Color code', presets: 'Suggested colors', clear: 'Clear' },
  th: { picker: 'เลือกสี', hex: 'รหัสสี', presets: 'สีแนะนำ', clear: 'ล้างค่า' },
} as const
type Messages = Record<keyof (typeof MESSAGES)['en'], string>

const HEX = /^#[0-9a-f]{6}$/i
const HEX_ALPHA = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i
const valid = (value: string, alpha: boolean) => (alpha ? HEX_ALPHA : HEX).test(value)

/** A swatch's background: the color over a checkerboard, so transparency shows. */
const SWATCH = `
  background-image: linear-gradient(var(--c), var(--c)),
    repeating-conic-gradient(#d4d4d4 0 25%, #fff 0 50%);
  background-size: auto, 8px 8px;
`

const FIELD_STYLE = `
  :host { display: block; font: inherit; color: var(--text); }
  [hidden] { display: none !important; }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
  input[type='color'] {
    inline-size: 2.4rem; block-size: 2.25rem; padding: 0.15rem; border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm, 8px); background: var(--surface); cursor: pointer;
  }
  input[type='text'] {
    inline-size: 9rem; min-block-size: 2.25rem; padding: 0 0.6rem; border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm, 8px); background: var(--surface); color: var(--text);
    font: inherit; font-family: var(--font-mono, ui-monospace, monospace); font-size: 0.875rem;
  }
  input[aria-invalid='true'] { border-color: var(--danger, #c0392b); }
  input:focus-visible, button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  input:disabled { opacity: 0.6; cursor: not-allowed; }
  .presets { display: flex; flex-wrap: wrap; gap: 0.35rem; margin: 0.5rem 0 0; padding: 0; list-style: none; }
  .preset {
    ${SWATCH}
    inline-size: 1.6rem; block-size: 1.6rem; padding: 0; border: 1px solid var(--border-strong);
    border-radius: 999px; cursor: pointer;
  }
  .preset[aria-pressed='true'] { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--accent); }
  .preset:disabled { cursor: not-allowed; opacity: 0.6; }
  .clear {
    min-block-size: 2.25rem; padding: 0 0.6rem; border: 0; border-radius: var(--radius-sm, 8px);
    background: none; color: var(--text-muted); font: inherit; font-size: 0.8rem; cursor: pointer;
  }
  .clear:hover { background: var(--surface-2); color: var(--text); }
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

const PROPERTIES = ['value', 'options', 'readOnly', 'uiLocale', 'label', 'field'] as const

class ColorField extends HTMLElement {
  props: Record<string, unknown> = {}
  readonly #picker = document.createElement('input')
  readonly #text = document.createElement('input')
  readonly #clear = document.createElement('button')
  readonly #presets = document.createElement('ul')
  #presetsKey = ''

  static {
    contextProperties(ColorField, PROPERTIES)
  }

  constructor() {
    super()
    this.#picker.type = 'color'
    this.#text.type = 'text'
    this.#text.spellcheck = false
    this.#text.autocomplete = 'off'
    this.#text.placeholder = '#000000'
    this.#clear.type = 'button'
    this.#clear.className = 'clear'
    this.#presets.className = 'presets'
    // The picker has no alpha channel: keep the alpha the value already has.
    this.#picker.addEventListener('input', () => {
      const alpha = this.#options.alpha ? this.#value.slice(7, 9) : ''
      this.#emit(`${this.#picker.value}${alpha}`)
    })
    this.#text.addEventListener('input', () => {
      const typed = this.#text.value.trim()
      const value = typed && !typed.startsWith('#') ? `#${typed}` : typed
      this.#emit(value === '' ? null : value.toLowerCase())
    })
    this.#clear.addEventListener('click', () => this.#emit(null))
    const row = document.createElement('div')
    row.className = 'row'
    row.append(this.#picker, this.#text, this.#clear)
    const style = document.createElement('style')
    style.textContent = FIELD_STYLE
    this.attachShadow({ mode: 'open' }).append(style, row, this.#presets)
  }

  connectedCallback() {
    this.update()
  }

  get #options(): ColorOptions {
    return (this.props.options ?? {}) as ColorOptions
  }
  get #value(): string {
    return typeof this.props.value === 'string' ? this.props.value : ''
  }
  get #t(): Messages {
    return this.props.uiLocale === 'th' ? MESSAGES.th : MESSAGES.en
  }

  #emit(value: string | null) {
    this.dispatchEvent(new CustomEvent('change', { detail: value }))
  }

  update() {
    const value = this.#value
    const { alpha = false, presets = [] } = this.#options
    const readOnly = this.props.readOnly === true
    const t = this.#t
    const label = typeof this.props.label === 'string' ? `${this.props.label}: ` : ''
    const ok = value === '' || valid(value, alpha)

    if (ok && value) this.#picker.value = value.slice(0, 7).toLowerCase()
    this.#picker.disabled = readOnly
    this.#picker.setAttribute('aria-label', `${label}${t.picker}`)
    // Leave the text alone while someone is typing in it.
    if (this.shadowRoot?.activeElement !== this.#text) this.#text.value = value
    this.#text.readOnly = readOnly
    this.#text.maxLength = alpha ? 9 : 7
    this.#text.setAttribute('aria-label', `${label}${t.hex}`)
    this.#text.setAttribute('aria-invalid', String(!ok))
    this.#clear.textContent = t.clear
    this.#clear.hidden = readOnly || value === ''

    const key = JSON.stringify([presets, t.presets])
    if (key !== this.#presetsKey) {
      this.#presetsKey = key
      this.#presets.setAttribute('aria-label', t.presets)
      this.#presets.replaceChildren(
        ...presets.map((color) => {
          const item = document.createElement('li')
          const button = document.createElement('button')
          button.type = 'button'
          button.className = 'preset'
          button.dataset.color = color
          button.title = color
          button.setAttribute('aria-label', color)
          button.style.setProperty('--c', color)
          button.addEventListener('click', () => this.#emit(color.toLowerCase()))
          item.append(button)
          return item
        }),
      )
    }
    this.#presets.hidden = presets.length === 0
    for (const button of this.#presets.querySelectorAll('button')) {
      button.disabled = readOnly
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.color?.toLowerCase() === value.toLowerCase()),
      )
    }
  }
}

const CELL_STYLE = `
  :host { display: inline-flex; align-items: center; gap: 0.4rem; }
  [hidden] { display: none !important; }
  .swatch {
    ${SWATCH}
    inline-size: 0.95rem; block-size: 0.95rem; flex: none; border: 1px solid var(--border-strong);
    border-radius: 999px;
  }
  code { font-family: var(--font-mono, ui-monospace, monospace); font-size: 0.8rem; }
`

class ColorCell extends HTMLElement {
  props: Record<string, unknown> = {}
  readonly #swatch = document.createElement('span')
  readonly #code = document.createElement('code')

  static {
    contextProperties(ColorCell, PROPERTIES)
  }

  constructor() {
    super()
    this.#swatch.className = 'swatch'
    this.#swatch.setAttribute('aria-hidden', 'true')
    const style = document.createElement('style')
    style.textContent = CELL_STYLE
    this.attachShadow({ mode: 'open' }).append(style, this.#swatch, this.#code)
  }

  connectedCallback() {
    this.update()
  }

  update() {
    const value = typeof this.props.value === 'string' ? this.props.value : ''
    const shown = valid(value, true)
    this.#swatch.hidden = !shown
    if (shown) this.#swatch.style.setProperty('--c', value)
    this.#code.textContent = value || '—'
  }
}

if (!customElements.get('ecms-color-field')) customElements.define('ecms-color-field', ColorField)
if (!customElements.get('ecms-color-cell')) customElements.define('ecms-color-cell', ColorCell)
