import { reactive } from 'vue'
import type { Router } from 'vue-router'
import { navState } from './nav'

/** The command palette (⌘K) and the shortcuts list (?), shown over the admin. */
export const overlays = reactive({ palette: false, help: false })

export const openPalette = () => {
  overlays.help = false
  overlays.palette = true
}

/** Pages that save listen for these: ⌘S saves, ⌘⇧P publishes. */
export const SAVE_EVENT = 'easy-cms:save'
export const PUBLISH_EVENT = 'easy-cms:publish'

const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
/** ⌘ on a Mac, Ctrl elsewhere. */
export const modKey = () => (isMac() ? '⌘' : 'Ctrl')

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return (
    el.isContentEditable ||
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT'
  )
}

let installed = false
let pendingG = 0

/** The admin's keyboard shortcuts; `?` lists them. */
export function installShortcuts(router: Router) {
  if (installed) return
  installed = true
  window.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.isComposing) return
    const mod = event.metaKey || event.ctrlKey
    const key = event.key.toLowerCase()
    if (mod && !event.altKey && key === 'k') {
      event.preventDefault()
      if (overlays.palette) overlays.palette = false
      else openPalette()
      return
    }
    if (mod && !event.altKey && !event.shiftKey && key === 's') {
      // Never the browser's "Save page": the open document is saved instead.
      event.preventDefault()
      window.dispatchEvent(new CustomEvent(SAVE_EVENT))
      return
    }
    if (mod && event.shiftKey && key === 'p') {
      event.preventDefault()
      window.dispatchEvent(new CustomEvent(PUBLISH_EVENT))
      return
    }
    if (mod || event.altKey || typing(event.target) || overlays.palette) return
    if (event.key === '?') {
      event.preventDefault()
      overlays.help = !overlays.help
    } else if (event.key === '/') {
      event.preventDefault()
      openPalette()
    } else if (event.key === '[' && window.matchMedia('(min-width: 1024px)').matches) {
      navState.rail = !navState.rail
    } else if (key === 'g') {
      pendingG = Date.now()
    } else if (key === 'd' && Date.now() - pendingG < 1200) {
      pendingG = 0
      void router.push('/')
    }
  })
}
