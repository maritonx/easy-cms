import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The preview endpoint answers with a page on another site.
vi.mock('../app/src/lib/api', () => ({
  api: vi.fn(async () => ({
    doc: { id: 4, title: 'Draft' },
    url: 'http://localhost:5173/?post=4',
  })),
}))

const { default: LivePreview } = await import('../app/src/components/LivePreview.vue')

describe('live preview of a page on another site', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const open = async () => {
    const wrapper = mount(LivePreview, {
      props: { path: '/posts/4/preview', data: { title: 'Draft' }, collection: 'posts' },
    })
    await flushPromises()
    return wrapper
  }

  it('names the site, and says when it does not answer', async () => {
    const wrapper = await open()
    expect(wrapper.find('.site').text()).toBe('localhost:5173')
    expect(wrapper.find('.quiet').exists()).toBe(false)
    // Nothing from the page (the site is down, or has no live preview): a hint, not an error.
    await vi.advanceTimersByTimeAsync(10_000)
    expect(wrapper.find('[role="status"]').text()).toMatch(/localhost:5173/)
    wrapper.unmount()
  })

  it('says nothing once the page is ready', async () => {
    const wrapper = await open()
    const frame = wrapper.find('iframe').element as HTMLIFrameElement
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'easy-cms:preview-ready' },
        source: frame.contentWindow,
      }),
    )
    await vi.advanceTimersByTimeAsync(10_000)
    expect(wrapper.find('.quiet').exists()).toBe(false)
    wrapper.unmount()
  })
})
