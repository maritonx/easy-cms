import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { LOADING_DELAY, LOADING_MIN, useDelayedLoading } from '../app/src/lib/loading'

/** Sets `loading` and lets the watcher run. */
async function set(loading: { value: boolean }, value: boolean) {
  loading.value = value
  await nextTick()
}

describe('useDelayedLoading', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows nothing for an answer quicker than the delay', async () => {
    const loading = ref(true)
    const shown = useDelayedLoading(loading)
    vi.advanceTimersByTime(LOADING_DELAY - 1)
    await set(loading, false)
    vi.advanceTimersByTime(1000)
    expect(shown.value).toBe(false)
  })

  it('shows after the delay and stays at least the minimum', async () => {
    const loading = ref(true)
    const shown = useDelayedLoading(loading)
    vi.advanceTimersByTime(LOADING_DELAY)
    expect(shown.value).toBe(true)
    // The answer comes right after: the indicator stays a little longer.
    await set(loading, false)
    expect(shown.value).toBe(true)
    vi.advanceTimersByTime(LOADING_MIN - 1)
    expect(shown.value).toBe(true)
    vi.advanceTimersByTime(1)
    expect(shown.value).toBe(false)
  })

  it('hides at once when it was shown long enough', async () => {
    const loading = ref(true)
    const shown = useDelayedLoading(loading)
    vi.advanceTimersByTime(LOADING_DELAY + LOADING_MIN)
    await set(loading, false)
    expect(shown.value).toBe(false)
  })

  it('stays shown when loading starts again before it hides', async () => {
    const loading = ref(true)
    const shown = useDelayedLoading(loading)
    vi.advanceTimersByTime(LOADING_DELAY)
    await set(loading, false)
    await set(loading, true)
    vi.advanceTimersByTime(LOADING_MIN * 2)
    expect(shown.value).toBe(true)
  })

  it('takes its own delay and minimum', async () => {
    const loading = ref(false)
    const shown = useDelayedLoading(loading, { delay: 0, min: 0 })
    await set(loading, true)
    vi.advanceTimersByTime(0)
    expect(shown.value).toBe(true)
    await set(loading, false)
    expect(shown.value).toBe(false)
  })

  it('stops its timers with its scope', async () => {
    const scope = effectScope()
    const loading = ref(true)
    const shown = scope.run(() => useDelayedLoading(loading))
    scope.stop()
    vi.advanceTimersByTime(LOADING_DELAY)
    expect(shown?.value).toBe(false)
  })
})
