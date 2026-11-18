// The code a built module runs in the admin, as text written into its entry. It wraps a framework
// component in a custom element that takes the admin's properties and sends its events.

/** The properties the admin sets on every element (`ElementContext` in the admin). */
const PROPS = [
  'apiVersion',
  'value',
  'path',
  'field',
  'label',
  'doc',
  'collection',
  'global',
  'id',
  'locale',
  'uiLocale',
  'readOnly',
  'options',
  'user',
  'route',
  'api',
]

/** `define(tag, adapter)`: the custom element around a framework's component. */
export function defineRuntime(): string {
  return `const PROPS = ${JSON.stringify(PROPS)}
// The module's CSS, put in each element's shadow root (filled in when the module is built).
const CSS = "__EASY_CMS_ADMIN_CSS__"

function define(tag, adapter) {
  if (customElements.get(tag)) return
  class AdminComponent extends HTMLElement {
    #props = {}
    #view
    #queued = false
    #target
    #events
    static {
      for (const name of PROPS)
        Object.defineProperty(this.prototype, name, {
          configurable: true,
          get() {
            return this.#props[name]
          },
          set(value) {
            this.#props[name] = value
            this.#render()
          },
        })
    }
    constructor() {
      super()
      const root = this.attachShadow({ mode: 'open' })
      if (CSS) {
        const style = document.createElement('style')
        style.textContent = CSS
        root.append(style)
      }
      this.#target = document.createElement('div')
      root.append(this.#target)
      const send = (type, detail) => this.dispatchEvent(new CustomEvent(type, { detail }))
      this.#events = {
        change: (value) => send('change', value),
        setField: (path, value) => send('set-field', { path, value }),
        navigate: (path) => send('navigate', path),
      }
    }
    connectedCallback() {
      // Properties set before the element was defined shadow the setters: set them again.
      for (const name of PROPS)
        if (Object.hasOwn(this, name)) {
          const value = this[name]
          delete this[name]
          this[name] = value
        }
      this.#view ??= adapter.mount(this.#target, this.#all())
    }
    disconnectedCallback() {
      // Moved, not removed, when it is back by the next microtask.
      queueMicrotask(() => {
        if (this.isConnected || !this.#view) return
        this.#view.unmount()
        this.#view = undefined
      })
    }
    #all() {
      return { ...this.#props, ...this.#events }
    }
    #render() {
      if (!this.#view || this.#queued) return
      this.#queued = true
      queueMicrotask(() => {
        this.#queued = false
        this.#view?.update(this.#all())
      })
    }
  }
  customElements.define(tag, AdminComponent)
}
`
}

/** The Vue and React adapters, as text for the entry. */
export const FRAMEWORK_CODE: Record<'vue' | 'react', string> = {
  vue: `import { createApp as __createApp, h as __h, shallowReactive as __shallowReactive } from 'vue'
// Only the props the component declares: Vue would put the others on its root element as attributes.
function __declared(component, props) {
  const declared = component.props
  const names = Array.isArray(declared) ? declared : Object.keys(declared ?? {})
  return Object.fromEntries(names.filter((n) => n in props).map((n) => [n, props[n]]))
}
const vue = (component) => ({
  mount(target, props) {
    const state = __shallowReactive(__declared(component, props))
    const app = __createApp({ render: () => __h(component, state) })
    app.mount(target)
    return {
      update(next) {
        Object.assign(state, __declared(component, next))
      },
      unmount() {
        app.unmount()
      },
    }
  },
})`,
  react: `import { createElement as __createElement } from 'react'
import { createRoot as __createRoot } from 'react-dom/client'
const react = (component) => ({
  mount(target, props) {
    const root = __createRoot(target)
    root.render(__createElement(component, props))
    return {
      update(next) {
        root.render(__createElement(component, next))
      },
      unmount() {
        root.unmount()
      },
    }
  },
})`,
}

/** The Svelte adapter: a `.svelte.js` module, so its props can be a `$state`. */
export const SVELTE_ADAPTER = `import { mount, unmount } from 'svelte'

export const svelte = (component) => ({
  mount(target, initial) {
    const props = $state({ ...initial })
    const app = mount(component, { target, props })
    return {
      update(next) {
        Object.assign(props, next)
      },
      unmount() {
        unmount(app)
      },
    }
  },
})
`
