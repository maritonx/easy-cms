// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from 'vitest'

type Element = HTMLElement & Record<string, unknown>

beforeAll(async () => {
  await import('../src/admin.js')
})

function make(tag: string, props: Record<string, unknown>) {
  const element = document.createElement(tag) as Element
  Object.assign(element, props)
  document.body.append(element)
  return element
}

describe('ecms-color-field', () => {
  it('shows the value and emits changes', () => {
    const element = make('ecms-color-field', {
      value: '#2f6f5e',
      options: { presets: ['#2f6f5e', '#E8A33D'] },
      label: 'Color',
      uiLocale: 'en',
    })
    const root = element.shadowRoot as ShadowRoot
    const picker = root.querySelector<HTMLInputElement>('input[type="color"]')
    const text = root.querySelector<HTMLInputElement>('input[type="text"]')
    expect(picker?.value).toBe('#2f6f5e')
    expect(text?.value).toBe('#2f6f5e')
    expect(text?.getAttribute('aria-label')).toBe('Color: Color code')

    const changes = vi.fn()
    element.addEventListener('change', (e) => changes((e as CustomEvent).detail))
    const presets = root.querySelectorAll<HTMLButtonElement>('.preset')
    expect([...presets].map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false'])
    presets[1]?.click()
    expect(changes).toHaveBeenLastCalledWith('#e8a33d')

    if (!text) throw new Error('no text input')
    text.value = 'FFAA00'
    text.dispatchEvent(new Event('input'))
    expect(changes).toHaveBeenLastCalledWith('#ffaa00')
    text.value = ''
    text.dispatchEvent(new Event('input'))
    expect(changes).toHaveBeenLastCalledWith(null)
  })

  it('keeps the alpha when picking, and marks bad values', () => {
    const element = make('ecms-color-field', { value: '#2f6f5e80', options: { alpha: true } })
    const root = element.shadowRoot as ShadowRoot
    const changes = vi.fn()
    element.addEventListener('change', (e) => changes((e as CustomEvent).detail))
    const picker = root.querySelector<HTMLInputElement>('input[type="color"]')
    if (!picker) throw new Error('no picker')
    picker.value = '#112233'
    picker.dispatchEvent(new Event('input'))
    expect(changes).toHaveBeenLastCalledWith('#11223380')

    element.value = 'red'
    expect(root.querySelector('input[type="text"]')?.getAttribute('aria-invalid')).toBe('true')
  })

  it('is read-only and speaks Thai', () => {
    const element = make('ecms-color-field', {
      value: '',
      options: { presets: ['#2f6f5e'] },
      readOnly: true,
      uiLocale: 'th',
    })
    const root = element.shadowRoot as ShadowRoot
    expect(root.querySelector<HTMLInputElement>('input[type="color"]')?.disabled).toBe(true)
    expect(root.querySelector<HTMLInputElement>('input[type="text"]')?.readOnly).toBe(true)
    expect(root.querySelector<HTMLButtonElement>('.preset')?.disabled).toBe(true)
    expect(root.querySelector('.presets')?.getAttribute('aria-label')).toBe('สีแนะนำ')
  })
})

describe('ecms-color-cell', () => {
  it('shows a swatch and the code', () => {
    const element = make('ecms-color-cell', { value: '#2f6f5e' })
    const root = element.shadowRoot as ShadowRoot
    expect(root.querySelector('code')?.textContent).toBe('#2f6f5e')
    expect(root.querySelector<HTMLElement>('.swatch')?.hidden).toBe(false)
    element.value = null
    expect(root.querySelector('code')?.textContent).toBe('—')
    expect(root.querySelector<HTMLElement>('.swatch')?.hidden).toBe(true)
  })
})
