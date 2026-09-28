import type { AdminField } from '@easy-cms/core'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { computed, defineComponent, h, provide, ref } from 'vue'
import PluginElement from '../app/src/components/PluginElement.vue'
import FieldRenderer from '../app/src/fields/FieldRenderer.vue'
import { API_VERSION, FORM, setPath } from '../app/src/lib/plugins'

describe('setPath', () => {
  it('replaces nested values without touching the original', () => {
    const data = { title: 'a', meta: { title: 'm' }, links: [{ url: 'x' }, { url: 'y' }] }
    const next = setPath(data, 'meta.title', 'n')
    expect(next).toEqual({ ...data, meta: { title: 'n' } })
    expect(data.meta.title).toBe('m')
    expect(setPath(data, 'links.1.url', 'z').links).toEqual([{ url: 'x' }, { url: 'z' }])
    expect(setPath({}, 'meta.image', 5)).toEqual({ meta: { image: 5 } })
    expect(setPath(data, 'title', null).title).toBeNull()
  })
})

/** A test element that records what the admin sets and can send events back. */
class TestElement extends HTMLElement {
  declare value: unknown
  declare doc: Record<string, unknown>
  declare options: Record<string, unknown>
  declare apiVersion: number
  declare path: string
}
customElements.define('ecms-test', TestElement)

/** Mounts `inner` inside an edit page that provides the form context. */
function withForm(inner: () => ReturnType<typeof h>, initial: Record<string, unknown>) {
  const form = ref(initial)
  const Page = defineComponent({
    setup() {
      provide(FORM, {
        doc: form,
        setField: (path, value) => {
          form.value = setPath(form.value, path, value)
        },
        collection: 'posts',
        id: computed(() => 1),
      })
      return inner
    },
  })
  return { wrapper: mount(Page, { attachTo: document.body }), form }
}

describe('PluginElement', () => {
  it('passes the context as properties and applies set-field', async () => {
    const { wrapper, form } = withForm(
      () =>
        h(PluginElement, { component: { tag: 'ecms-test', props: { max: 60 } }, readOnly: false }),
      { title: 'Hello', meta: { title: '' } },
    )
    await flushPromises()
    const element = wrapper.element.querySelector('ecms-test') as TestElement
    expect(element).toBeTruthy()
    expect(element.apiVersion).toBe(API_VERSION)
    expect(element.options).toEqual({ max: 60 })
    expect(element.doc).toEqual({ title: 'Hello', meta: { title: '' } })

    element.dispatchEvent(
      new CustomEvent('set-field', { detail: { path: 'meta.title', value: 'Hi' } }),
    )
    await flushPromises()
    expect(form.value).toEqual({ title: 'Hello', meta: { title: 'Hi' } })
    // The element sees the new form.
    expect(element.doc.meta).toEqual({ title: 'Hi' })
    wrapper.unmount()
  })

  it('shows a hint when no module defines the tag', async () => {
    const wrapper = mount(PluginElement, { props: { component: { tag: 'ecms-nowhere' } } })
    await flushPromises()
    expect(wrapper.text()).toContain('ecms-nowhere')
  })
})

describe('FieldRenderer with components', () => {
  it('uses a component instead of the input and emits its change events', async () => {
    const field: AdminField = {
      name: 'color',
      type: 'text',
      admin: { component: { tag: 'ecms-test' }, after: [{ tag: 'ecms-test' }] },
    }
    const wrapper = mount(FieldRenderer, {
      props: { field, modelValue: '#fff', path: 'color', errors: {}, readOnly: false },
      attachTo: document.body,
    })
    await flushPromises()
    expect(wrapper.find('input').exists()).toBe(false)
    const [input, after] = wrapper.element.querySelectorAll('ecms-test') as unknown as TestElement[]
    expect(input?.value).toBe('#fff')
    expect(after?.path).toBe('color')

    // A native change event from inside the element is not a value.
    input?.dispatchEvent(new Event('change', { bubbles: true }))
    input?.dispatchEvent(new CustomEvent('change', { detail: '#000' }))
    expect(wrapper.emitted('update:modelValue')).toEqual([['#000']])
    wrapper.unmount()
  })
})
