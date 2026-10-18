import { getCurrentScope, onScopeDispose, type Ref, ref, type WatchSource, watch } from 'vue'

/** Answers quicker than this show no loading indicator at all. */
export const LOADING_DELAY = 250
/** Once shown, an indicator stays at least this long, so it doesn't flash. */
export const LOADING_MIN = 300

/**
 * Whether to show a loading indicator (a skeleton, the navigation bar) while `loading` is true:
 * only once it has lasted `delay`, and then for at least `min`, so a quick answer shows nothing
 * and a slow one doesn't flicker.
 */
export function useDelayedLoading(
  loading: WatchSource<boolean>,
  { delay = LOADING_DELAY, min = LOADING_MIN } = {},
): Ref<boolean> {
  const shown = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  let since = 0
  const clear = () => {
    clearTimeout(timer)
    timer = undefined
  }
  watch(
    loading,
    (now) => {
      clear()
      if (now) {
        if (shown.value) return
        timer = setTimeout(() => {
          shown.value = true
          since = Date.now()
        }, delay)
      } else if (shown.value) {
        const left = min - (Date.now() - since)
        if (left <= 0) shown.value = false
        else
          timer = setTimeout(() => {
            shown.value = false
          }, left)
      }
    },
    { immediate: true },
  )
  if (getCurrentScope()) onScopeDispose(clear)
  return shown
}

/** A route change is under way: its page's code and the session check (the router sets it). */
export const navigating = ref(false)
