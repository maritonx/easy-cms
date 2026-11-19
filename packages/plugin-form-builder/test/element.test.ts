// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PublicForm } from '../src/shared.js'

const form: PublicForm = {
  slug: 'contact',
  title: 'Contact',
  fields: [
    { kind: 'text', name: 'name', label: 'Name', required: true, width: 'half' },
    { kind: 'email', name: 'email', label: 'Email', required: true, width: 'half' },
    {
      kind: 'select',
      name: 'topic',
      label: 'Topic',
      required: false,
      width: 'full',
      options: [
        { label: 'Sales', value: 'sales' },
        { label: 'Support', value: 'support' },
      ],
      display: 'radio',
      multiple: false,
    },
    { kind: 'message', name: '', label: '', required: false, width: 'full', html: '<p>Note</p>' },
    {
      kind: 'checkbox',
      name: 'agree',
      label: 'I agree',
      required: true,
      width: 'full',
      defaultValue: false,
    },
  ],
  submitLabel: 'Send it',
  token: '123.sig',
  honeypot: 'website',
  turnstile: null,
  locale: 'en',
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

async function mount(respond: (body: Record<string, unknown>) => Response, served: object = form) {
  const sent: Record<string, unknown>[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>
        sent.push(body)
        return respond(body)
      }
      expect(url).toBe('/api/cms/form/contact?locale=en')
      return Response.json(served)
    }),
  )
  await import('../src/element.js')
  document.documentElement.lang = 'en'
  const element = document.createElement('easy-form')
  element.setAttribute('form', 'contact')
  document.body.append(element)
  await vi.waitFor(() => expect(element.querySelector('form')).not.toBeNull())
  return { element, sent }
}

describe('<easy-form>', () => {
  it('renders the fields and sends the values', async () => {
    const { element, sent } = await mount(() =>
      Response.json({ confirmation: { type: 'message', html: '<p>Thanks!</p>' } }),
    )
    expect(element.querySelector('.easy-form__field--half')).not.toBeNull()
    expect(element.querySelector('.easy-form__message')?.innerHTML).toBe('<p>Note</p>')
    expect(element.querySelector('button')?.textContent).toBe('Send it')
    ;(element.querySelector('[name="name"]') as HTMLInputElement).value = 'Somchai'
    ;(element.querySelector('[name="email"]') as HTMLInputElement).value = 'somchai@x.test'
    ;(element.querySelector('[value="support"]') as HTMLInputElement).checked = true
    ;(element.querySelector('[name="agree"]') as HTMLInputElement).checked = true
    const submitted = vi.fn()
    element.addEventListener('easy-form:submitted', submitted)
    element.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }))
    await vi.waitFor(() => expect(submitted).toHaveBeenCalled())
    expect(sent[0]).toMatchObject({
      data: { name: 'Somchai', email: 'somchai@x.test', topic: 'support', agree: true },
      token: '123.sig',
      website: '',
      locale: 'en',
    })
    expect(element.querySelector('.easy-form__confirmation')?.innerHTML).toBe('<p>Thanks!</p>')
  })

  it('shows errors next to their fields', async () => {
    const { element } = await mount(() =>
      Response.json(
        { errors: [{ field: 'email', message: 'must be an email address' }] },
        { status: 400 },
      ),
    )
    element.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }))
    await vi.waitFor(() =>
      expect(element.querySelector('.easy-form__status')?.textContent).toBe(
        'Please check the fields marked below.',
      ),
    )
    const error = [...element.querySelectorAll<HTMLElement>('.easy-form__error')].find(
      (e) => !e.hidden,
    )
    expect(error?.textContent).toBe('must be an email address')
    expect(element.querySelector('[name="email"]')?.getAttribute('aria-invalid')).toBe('true')
  })

  it('takes properties as well as attributes (Vue and React set properties)', async () => {
    const { element } = await mount(() => Response.json({}))
    const el = element as HTMLElement & { locale: string | null; form: string | null }
    expect(el.form).toBe('contact')
    el.locale = 'th'
    expect(el.getAttribute('locale')).toBe('th')
    el.locale = null
    expect(el.hasAttribute('locale')).toBe(false)
  })
  it('waits for Turnstile, and sends each of its tokens once', async () => {
    const widget: {
      callback?: ((token: string) => void) | undefined
      expired?: (() => void) | undefined
      error?: (() => void) | undefined
    } = {}
    const reset = vi.fn()
    vi.stubGlobal('turnstile', {
      render: (_: Element, options: Record<string, () => void>) => {
        widget.callback = options.callback as (token: string) => void
        widget.expired = options['expired-callback']
        widget.error = options['error-callback']
        return 'w1'
      },
      reset,
    })
    const { element, sent } = await mount(
      () =>
        Response.json(
          { errors: [{ field: 'email', message: 'must be an email address' }] },
          { status: 400 },
        ),
      { ...form, turnstile: 'site-key' },
    )
    const button = element.querySelector('button') as HTMLButtonElement
    const status = () => element.querySelector('.easy-form__status')?.textContent
    // No token yet: nothing to send.
    expect(button.disabled).toBe(true)
    expect(status()).toBe('Checking you are not a bot…')
    await vi.waitFor(() => expect(widget.callback).toBeDefined())
    widget.callback?.('first')
    expect(button.disabled).toBe(false)
    expect(status()).toBe('')
    // A token lasts 5 minutes.
    widget.expired?.()
    expect(button.disabled).toBe(true)
    widget.callback?.('second')
    element.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }))
    await vi.waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]?.turnstile).toBe('second')
    // Cloudflare took that token: the next try waits for a new one.
    await vi.waitFor(() => expect(reset).toHaveBeenCalledWith('w1'))
    expect(button.disabled).toBe(true)
    widget.error?.()
    expect(status()).toBe('Could not check that you are not a bot. Reload the page and try again.')
  })
})
