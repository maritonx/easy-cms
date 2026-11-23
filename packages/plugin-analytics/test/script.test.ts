import { Window } from 'happy-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyticsScript, DEFAULT_TEXTS, type ScriptSettings } from '../src/index.js'

const settings: ScriptSettings = {
  gtm: 'GTM-ABC1234',
  banner: true,
  record: true,
  region: 'everywhere',
  version: 'v1',
  texts: DEFAULT_TEXTS,
  api: '/api/cms',
}

const windows: Window[] = []
afterEach(async () => {
  for (const w of windows.splice(0)) await w.happyDOM.close()
})

/** A page that loads the script; `fetch` is recorded. */
function page(
  options: { url?: string; lang?: string; cookie?: string; frame?: boolean } = {},
  s = settings,
) {
  const window = new Window({ url: options.url ?? 'https://site.test/posts/hello' })
  windows.push(window)
  const w = window as unknown as Record<string, any>
  window.document.documentElement.lang = options.lang ?? 'en'
  window.document.body.innerHTML = '<a href="#" data-easy-consent>Cookie settings</a>'
  if (options.cookie) window.document.cookie = options.cookie
  const sent: unknown[] = []
  w.fetch = vi.fn(async (_url: string, init: { body: string; credentials: string }) => {
    // Without the session cookie: a signed-in visitor would otherwise need a CSRF token.
    expect(init.credentials).toBe('omit')
    sent.push(JSON.parse(init.body))
    return new Response(null, { status: 204 })
  })
  if (options.frame) Object.defineProperty(w, 'parent', { value: {} })
  window.eval(analyticsScript(s))
  const banner = () =>
    window.document.querySelector('[data-easy-consent-banner]')?.shadowRoot ?? null
  const click = (action: string) =>
    (banner()!.querySelector(`button[data-a="${action}"]`) as unknown as HTMLElement).click()
  const layer = () =>
    (w.dataLayer as unknown[]).map((e) =>
      e && typeof e === 'object' && 'length' in (e as object) ? [...(e as unknown[])] : e,
    )
  return { window, w, sent, banner, click, layer }
}

describe('analytics.js', () => {
  it('denies by default, then loads Tag Manager', () => {
    const { window, layer } = page()
    const entries = layer()
    expect(entries[0]).toEqual([
      'consent',
      'default',
      expect.objectContaining({
        analytics_storage: 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
      }),
    ])
    const gtm = entries.findIndex((e) => (e as { event?: string }).event === 'gtm.js')
    expect(gtm).toBeGreaterThan(0)
    const script = window.document.querySelector('script[src*="googletagmanager"]')
    expect(script?.getAttribute('src')).toBe(
      'https://www.googletagmanager.com/gtm.js?id=GTM-ABC1234',
    )
  })

  it('asks with equal Accept and Reject, remembers the choice and records it', () => {
    const { window, banner, click, layer, sent, w } = page()
    expect(banner()?.textContent).toContain('Accept all')
    expect(banner()?.textContent).toContain('Reject all')
    click('reject')
    expect(banner()).toBeNull()
    expect(layer()).toContainEqual([
      'consent',
      'update',
      {
        analytics_storage: 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
      },
    ])
    expect(window.document.cookie).toContain('easy_consent=')
    expect(sent).toEqual([
      {
        id: expect.stringMatching(/^[A-Za-z0-9-]{8,64}$/),
        analytics: false,
        marketing: false,
        version: 'v1',
      },
    ])
    expect(w.easyConsent.get()).toEqual({ analytics: false, marketing: false })
  })

  it('picks categories in Settings, and reopens from a link', () => {
    const { window, banner, click, layer } = page()
    click('settings')
    const form = banner()?.querySelector('form') as unknown as HTMLFormElement & {
      analytics: HTMLInputElement
    }
    expect(form.hidden).toBe(false)
    form.analytics.checked = true
    click('save')
    expect(layer()).toContainEqual([
      'consent',
      'update',
      {
        analytics_storage: 'granted',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
      },
    ])
    ;(window.document.querySelector('[data-easy-consent]') as unknown as HTMLElement).click()
    expect(
      (banner()!.querySelector('input[name="analytics"]') as unknown as HTMLInputElement).checked,
    ).toBe(true)
  })

  it('applies a stored choice for this version without asking, and asks again for a new one', () => {
    const choice = (v: string) =>
      `easy_consent=${encodeURIComponent(JSON.stringify({ v, id: 'abcd1234', a: 1, m: 1, t: 1 }))}`
    const same = page({ cookie: choice('v1') })
    expect(same.banner()).toBeNull()
    expect(same.layer()).toContainEqual([
      'consent',
      'update',
      expect.objectContaining({ ad_storage: 'granted' }),
    ])
    const changed = page({ cookie: choice('old') })
    expect(changed.banner()).not.toBeNull()
  })

  it('speaks Thai on Thai pages', () => {
    const { banner } = page({ lang: 'th' })
    expect(banner()?.textContent).toContain('ปฏิเสธทั้งหมด')
  })

  it('does nothing in the admin preview, but keeps the helpers callable', () => {
    for (const options of [{ frame: true }, { url: 'https://site.test/posts/hello?preview=abc' }]) {
      const { w, window, banner } = page(options)
      expect(w.dataLayer).toBeUndefined()
      expect(banner()).toBeNull()
      expect(window.document.querySelector('script[src*="googletagmanager"]')).toBeNull()
      expect(() => w.easyAnalytics.track('x')).not.toThrow()
    }
  })

  it('works without a banner (own consent tool) or a container', () => {
    const { banner, w, window } = page({}, { ...settings, banner: false, gtm: null })
    expect(banner()).toBeNull()
    expect(window.document.querySelector('script[src*="googletagmanager"]')).toBeNull()
    w.easyAnalytics.track('sign_up', { method: 'email' })
    expect(w.dataLayer.at(-1)).toEqual({ event: 'sign_up', method: 'email' })
  })
})
