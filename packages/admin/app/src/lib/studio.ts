/**
 * Studio mode (ADR-0074), outside semver. Studio frames the admin and its Service Worker answers
 * the API from a CMS in the browser, signing every request in. When the config changes Studio
 * starts that CMS again and posts `{ type: 'easy-cms:reload' }`: the admin loads the session and
 * schema again and shows the page it is on afresh, without reloading. It posts
 * `{ type: 'easy-cms:ready' }` once mounted and `{ type: 'easy-cms:reloaded' }` after each reload.
 * `{ type: 'easy-cms:theme', mode }` sets the theme Studio's own toggle chose, without keeping it.
 * Messages count only from the framing window at `settings.studio.origin`.
 */
import { ref } from 'vue'
import { settings } from './settings'
import { applyTheme, type ThemeMode, themeMode } from './theme'

const MODES = new Set<unknown>(['light', 'dark', 'system'])

/** Bumped after each reload; the page in view is keyed by it, so it mounts again. */
export const studioReloads = ref(0)

/** Whether the admin runs in Studio. */
export const inStudio = settings.studio !== undefined

export function installStudio(reload: () => Promise<void>): void {
  const origin = settings.studio?.origin
  if (!origin || window.parent === window) return
  const tell = (type: string) => window.parent.postMessage({ type }, origin)
  let queue = Promise.resolve()
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window.parent || event.origin !== origin) return
    const data = event.data as { type?: unknown; mode?: unknown } | null
    if (data?.type === 'easy-cms:theme' && MODES.has(data.mode)) {
      themeMode.value = data.mode as ThemeMode
      applyTheme()
      return
    }
    if (data?.type !== 'easy-cms:reload') return
    // One after another: a reload asked for during another follows it.
    queue = queue
      .then(async () => {
        await reload()
        studioReloads.value++
        tell('easy-cms:reloaded')
      })
      .catch((error: unknown) => console.error('Easy CMS Studio: reloading failed', error))
  })
  tell('easy-cms:ready')
}
