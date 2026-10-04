// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { FormStats } from '../src/admin-overview.js'

type Element = HTMLElement & Record<string, unknown>

const stats = (days: number): FormStats => ({
  days,
  timeZone: 'Asia/Bangkok',
  dates: Array.from({ length: days }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`),
  total: 5,
  perDay: Array.from({ length: days }, (_, i) => (i === days - 1 ? 5 : 0)),
  forms: [
    { id: 1, slug: 'contact', title: 'Contact', total: 4, perDay: [] },
    { id: 2, slug: 'news', title: 'Newsletter', total: 1, perDay: [] },
    { id: 3, slug: 'quiet', title: 'Quiet', total: 0, perDay: [] },
  ],
})

beforeAll(async () => {
  await import('../src/admin.js')
})

const options = { forms: 'forms', submissions: 'form-submissions', adminPath: '/admin' }
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

async function make(tag: string, props: Record<string, unknown>) {
  const api = vi.fn(async (_method: string, path: string) =>
    stats(path.includes('days=30') ? 30 : 7),
  )
  const element = document.createElement(tag) as Element
  Object.assign(element, { options, uiLocale: 'en', api, ...props })
  document.body.append(element)
  await flush()
  return { element, api, root: element.shadowRoot as ShadowRoot }
}

describe('ecms-forms-overview', () => {
  it('shows the totals per form for the range in the address', async () => {
    const { root, api } = await make('ecms-forms-overview', {
      route: { subpath: '', query: { range: '30' } },
    })
    expect(api).toHaveBeenCalledWith(
      'GET',
      expect.stringMatching(/^\/form\/stats\.json\?days=30&tz=/),
    )
    expect(root.querySelector('.total')?.textContent).toBe('5 submissions')
    expect(root.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(
      'Submissions per day: 5 in total',
    )
    expect(root.querySelectorAll('.bars.big .bar')).toHaveLength(30)
    const rows = [...root.querySelectorAll('tbody tr')].map(
      (r) => r.querySelector('td')?.textContent,
    )
    expect(rows).toEqual(['Contact', 'Newsletter', 'Quiet'])
    const pressed = [...root.querySelectorAll('button')].map((b) => b.getAttribute('aria-pressed'))
    expect(pressed).toEqual(['false', 'true'])
  })

  it('changes the range and opens submissions through the admin', async () => {
    const { element, root } = await make('ecms-forms-overview', {
      route: { subpath: '', query: {} },
    })
    const navigate = vi.fn()
    element.addEventListener('navigate', (e) => navigate((e as CustomEvent).detail))
    root.querySelector<HTMLButtonElement>('button[data-days="30"]')?.click()
    expect(navigate).toHaveBeenLastCalledWith('/p/forms-overview?range=30')

    const link = root.querySelector<HTMLAnchorElement>('a[data-to]')
    expect(link?.getAttribute('href')).toBe('/admin/collections/form-submissions?f_form=1')
    link?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    expect(navigate).toHaveBeenLastCalledWith('/collections/form-submissions?f_form=1')
  })

  it('says when the numbers could not be loaded, in Thai', async () => {
    const element = document.createElement('ecms-forms-overview') as Element
    Object.assign(element, {
      options,
      uiLocale: 'th',
      route: { subpath: '', query: {} },
      api: async () => {
        throw new Error('403')
      },
    })
    document.body.append(element)
    await flush()
    expect(element.shadowRoot?.textContent).toContain('โหลดตัวเลขไม่สำเร็จ')
  })
})

describe('ecms-forms-widget', () => {
  it('shows the last 7 days and the busiest forms', async () => {
    const { root, api } = await make('ecms-forms-widget', {})
    expect(api).toHaveBeenCalledWith('GET', expect.stringContaining('days=7'))
    expect(root.querySelector('h2')?.textContent).toBe('Form submissions')
    expect(root.querySelector('.total')?.textContent).toBe('5 submissions')
    // Forms without submissions are left out.
    expect([...root.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      'Contact4',
      'Newsletter1',
    ])
    expect(root.querySelector('a')?.getAttribute('href')).toBe('/admin/p/forms-overview')
  })
})
