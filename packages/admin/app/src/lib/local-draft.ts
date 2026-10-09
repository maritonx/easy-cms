import { onBeforeUnmount, type Ref, ref, watch } from 'vue'
import { snapshot } from './fields'

/** Unsaved changes kept in this browser, offered back when the page opens again. */
interface Saved {
  form: Record<string, unknown>
  at: string
}

const PREFIX = 'easy-cms-draft:'
/** Older ones are dropped: the document has probably moved on. */
const MAX_AGE = 7 * 24 * 3_600_000

function read(key: string): Saved | null {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFIX + key) ?? 'null') as Saved | null
    if (!saved || typeof saved.at !== 'string' || Date.now() - Date.parse(saved.at) > MAX_AGE)
      return null
    return saved
  } catch {
    return null
  }
}

/**
 * Keeps a form's unsaved changes in `localStorage` while it is edited, so a closed tab or crash
 * loses nothing. `check()` after loading offers what was kept, when it differs from what loaded.
 */
export function useLocalDraft(
  key: () => string,
  form: Ref<Record<string, unknown>>,
  dirty: Ref<boolean>,
) {
  const found = ref<Saved | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined
  const write = () => {
    try {
      if (dirty.value)
        localStorage.setItem(
          PREFIX + key(),
          JSON.stringify({ form: form.value, at: new Date().toISOString() }),
        )
    } catch {
      // Full or private: nothing kept.
    }
  }
  watch(
    form,
    () => {
      clearTimeout(timer)
      // Not while an earlier one waits to be restored: it would be overwritten.
      if (!found.value) timer = setTimeout(write, 800)
    },
    { deep: true },
  )
  onBeforeUnmount(() => clearTimeout(timer))

  return {
    /** What was kept, when it differs from the loaded form. */
    found,
    check() {
      const saved = read(key())
      found.value = saved && snapshot(saved.form) !== snapshot(form.value) ? saved : null
    },
    restore() {
      if (found.value) form.value = { ...form.value, ...found.value.form }
      found.value = null
    },
    clear() {
      clearTimeout(timer)
      found.value = null
      try {
        localStorage.removeItem(PREFIX + key())
      } catch {
        // Nothing kept.
      }
    },
  }
}
