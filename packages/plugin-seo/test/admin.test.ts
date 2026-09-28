// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from 'vitest'

beforeAll(async () => {
  await import('../src/admin.js')
})

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

type SeoElement = HTMLElement & Record<string, unknown>

async function make(tag: string, props: Record<string, unknown>): Promise<SeoElement> {
  const element = document.createElement(tag) as SeoElement
  Object.assign(element, { doc: {}, uiLocale: 'en', readOnly: false, ...props })
  document.body.append(element)
  await flush()
  return element
}

const text = (element: HTMLElement) => element.shadowRoot?.textContent?.replace(/\s+/g, ' ').trim()

describe('ecms-seo-meter', () => {
  const options = { kind: 'title', min: 5, max: 10, generate: true }

  it('shows the length against the good range', async () => {
    const meter = await make('ecms-seo-meter', { value: 'Hi', options })
    const row = () => meter.shadowRoot?.querySelector('.row')
    expect(row()?.getAttribute('data-state')).toBe('short')
    expect(text(meter)).toContain('2 / 10 characters')
    meter.value = 'Just right'
    await flush()
    expect(row()?.getAttribute('data-state')).toBe('good')
    meter.value = 'Far too long a title'
    await flush()
    expect(row()?.getAttribute('data-state')).toBe('long')
    meter.uiLocale = 'th'
    await flush()
    expect(text(meter)).toContain('ยาวไป')
  })

  it('counts Thai letters with their vowel and tone marks as one', async () => {
    const meter = await make('ecms-seo-meter', { value: 'น้ำ', options })
    expect(text(meter)).toContain('1 / 10')
  })

  it('generates through the API and sets the field', async () => {
    const api = vi.fn(async () => ({ value: 'Generated' }))
    const meter = await make('ecms-seo-meter', {
      value: '',
      path: 'meta.title',
      collection: 'posts',
      id: 3,
      doc: { title: 'Hello' },
      locale: 'th',
      options,
      api,
    })
    const events: unknown[] = []
    meter.addEventListener('set-field', (e) => events.push((e as CustomEvent).detail))
    meter.shadowRoot?.querySelector<HTMLButtonElement>('[data-action="generate"]')?.click()
    await flush()
    expect(api).toHaveBeenCalledWith('POST', '/seo/generate', {
      kind: 'title',
      collection: 'posts',
      id: 3,
      doc: { title: 'Hello' },
      locale: 'th',
    })
    expect(events).toEqual([{ path: 'meta.title', value: 'Generated' }])
  })

  it('says when there is nothing to generate, and hides the button when read-only', async () => {
    const meter = await make('ecms-seo-meter', {
      path: 'meta.title',
      options,
      api: async () => ({ value: null }),
    })
    meter.shadowRoot?.querySelector<HTMLButtonElement>('[data-action="generate"]')?.click()
    await flush()
    await flush()
    expect(text(meter)).toContain('Nothing to generate from yet')
    meter.readOnly = true
    await flush()
    expect(meter.shadowRoot?.querySelector('button')).toBeNull()
  })
})

describe('ecms-seo-preview', () => {
  it('shows the meta title, falls back to the document title and shows the site', async () => {
    const preview = await make('ecms-seo-preview', {
      path: 'meta',
      doc: { title: 'Doc title', meta: { title: '', description: 'A description' } },
      options: { titleField: 'title', url: false, siteUrl: 'https://blog.test' },
    })
    expect(text(preview)).toContain('blog.test')
    expect(text(preview)).toContain('Doc title')
    expect(text(preview)).toContain('A description')
    preview.doc = { title: 'Doc title', meta: { title: 'Meta <b>title</b>' } }
    await flush()
    expect(text(preview)).toContain('Meta <b>title</b>')
    expect(preview.shadowRoot?.querySelector('b')).toBeNull()
  })

  it('asks the server for the page URL once the form settles', async () => {
    const api = vi.fn(async () => ({ value: 'https://blog.test/posts/hello' }))
    const preview = await make('ecms-seo-preview', {
      path: 'meta',
      collection: 'posts',
      doc: { slug: 'hello' },
      options: { titleField: 'title', url: true, siteUrl: '' },
      api,
    })
    await new Promise((resolve) => setTimeout(resolve, 500))
    await flush()
    expect(api).toHaveBeenCalledTimes(1)
    expect(api).toHaveBeenCalledWith(
      'POST',
      '/seo/generate',
      expect.objectContaining({ kind: 'url' }),
    )
    expect(text(preview)).toContain('blog.test › posts › hello')
  })
})
