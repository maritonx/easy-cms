// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from 'vitest'

beforeAll(async () => {
  await import('../src/admin.js')
})

const flush = async () => {
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}
type El = HTMLElement & Record<string, unknown>
async function make(tag: string, props: Record<string, unknown>): Promise<El> {
  const element = document.createElement(tag) as El
  Object.assign(element, { doc: {}, uiLocale: 'en', readOnly: false, id: null, ...props })
  document.body.append(element)
  await flush()
  return element
}
// The text people see: without the shadow root's styles.
const text = (element: HTMLElement) =>
  [...(element.shadowRoot?.childNodes ?? [])]
    .filter((n) => n.nodeName !== 'STYLE')
    .map((n) => n.textContent ?? '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
const channels = {
  channels: [
    { id: 'social-webhook:Make', label: 'Webhook (social) · Make' },
    { id: 'x:Main', label: 'X · Main', maxLength: 10 },
  ],
  canPost: true,
}

describe('ecms-social-channel', () => {
  it('lists the connected channels and says when one is picked', async () => {
    const api = vi.fn(async () => channels)
    const picker = await make('ecms-social-channel', {
      value: '',
      api,
      path: 'channels.0.connection',
    })
    const select = picker.shadowRoot?.querySelector('select') as HTMLSelectElement
    expect([...select.options].map((o) => o.textContent)).toEqual([
      'Choose a channel',
      'Webhook (social) · Make',
      'X · Main',
    ])
    const picked: unknown[] = []
    picker.addEventListener('change', (e) => picked.push((e as CustomEvent).detail))
    select.value = 'x:Main'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    expect(picked).toEqual(['x:Main'])
  })

  it('keeps a channel that is no longer connected, and locks one that posted', async () => {
    const api = vi.fn(async () => channels)
    const picker = await make('ecms-social-channel', {
      value: 'old:Gone',
      api,
      doc: { delivery: { channels: { 'old:Gone': { state: 'posted', attempts: 1 } } } },
    })
    const select = picker.shadowRoot?.querySelector('select') as HTMLSelectElement
    expect(select.disabled).toBe(true)
    expect(text(picker)).toContain('old:Gone (not connected)')
  })
})

describe('ecms-social-count', () => {
  it('counts against the tightest channel that uses the text', async () => {
    const api = vi.fn(async () => channels)
    const count = await make('ecms-social-count', {
      value: 'Hello there',
      path: 'text',
      api,
      doc: { channels: [{ connection: 'social-webhook:Make' }, { connection: 'x:Main' }] },
    })
    expect(text(count)).toBe('11 / 10 characters · Too long for X · Main')
    count.doc = {
      channels: [{ connection: 'social-webhook:Make' }, { connection: 'x:Main', text: 'Hi' }],
    }
    await flush()
    expect(text(count)).toBe('11 characters')
  })
})

describe('ecms-social-panel', () => {
  it('shows each channel, posts now after asking, and retries a failed one', async () => {
    const api = vi.fn(async (method: string, path: string, body?: unknown) => {
      if (path === '/social/channels') return channels
      if (path === '/social/post')
        return {
          delivery: {
            channels: {
              'social-webhook:Make': { state: 'posted', attempts: 1, url: 'https://x.test/1' },
              'x:Main': { state: 'failed', attempts: 1, error: 'refused' },
            },
          },
          body,
        }
      return { method }
    })
    const panel = await make('ecms-social-panel', {
      id: 7,
      collection: 'social-posts',
      api,
      value: { channels: {} },
      doc: { channels: [{ connection: 'social-webhook:Make' }, { connection: 'x:Main' }] },
    })
    expect(text(panel)).toContain('Webhook (social) · Make Not posted')
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    panel.shadowRoot?.querySelector<HTMLButtonElement>('[data-action="now"]')?.click()
    await flush()
    expect(api).toHaveBeenCalledWith('POST', '/social/post', { post: 7, action: 'now' })
    expect(text(panel)).toContain('Posted View post')
    expect(text(panel)).toContain('Failed refused Retry')
    panel.shadowRoot?.querySelector<HTMLButtonElement>('[data-action="retry"]')?.click()
    await flush()
    expect(api).toHaveBeenCalledWith('POST', '/social/post', {
      post: 7,
      action: 'retry',
      channel: 'x:Main',
    })
    vi.unstubAllGlobals()
  })

  it('asks to save first, and hides the actions from who may not post', async () => {
    const api = vi.fn(async () => ({ ...channels, canPost: false }))
    const unsaved = await make('ecms-social-panel', { id: null, api })
    expect(text(unsaved)).toBe('Save the post first, then post it.')
    const writer = await make('ecms-social-panel', {
      id: 3,
      api,
      value: { channels: {} },
      doc: { channels: [{ connection: 'x:Main' }] },
    })
    expect(writer.shadowRoot?.querySelector('[data-action="now"]')).toBeNull()
    expect(text(writer)).toContain('someone who may post sends it')
  })
})

describe('ecms-social-share', () => {
  it('creates a post from the document and goes to it', async () => {
    const api = vi.fn(async () => ({ id: 9, path: '/collections/social-posts/9' }))
    const share = await make('ecms-social-share', { id: 4, collection: 'posts', api })
    const went: unknown[] = []
    share.addEventListener('navigate', (e) => went.push((e as CustomEvent).detail))
    share.shadowRoot?.querySelector<HTMLButtonElement>('[data-action="share"]')?.click()
    await flush()
    expect(api).toHaveBeenCalledWith('POST', '/social/share', { collection: 'posts', id: 4 })
    expect(went).toEqual(['/collections/social-posts/9'])
  })
})
