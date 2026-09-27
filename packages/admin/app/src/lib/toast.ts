import { type Ref, ref, watch } from 'vue'

export interface Toast {
  kind: 'success' | 'error'
  text: string
  /** Changes with every message, so the same text shown twice still animates. */
  id: number
}

/** One message at a time: a new one replaces the last. */
export const toast = ref<Toast | null>(null)

let timer: ReturnType<typeof setTimeout> | undefined
let next = 0

/** Success messages go away by themselves; errors stay until the next action or page. */
export function notify(kind: Toast['kind'], text: string) {
  clearTimeout(timer)
  toast.value = { kind, text, id: ++next }
  if (kind === 'success') timer = setTimeout(clearToast, 5000)
}

export function clearToast() {
  clearTimeout(timer)
  toast.value = null
}

/** Shows a page's `message` (kept by the page as before) as the toast. */
export function showMessages(message: Ref<{ kind: Toast['kind']; text: string } | null>) {
  watch(
    message,
    (value) => {
      if (value) notify(value.kind, value.text)
      else if (toast.value?.kind === 'error') clearToast()
    },
    { immediate: true },
  )
}
