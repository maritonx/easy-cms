import { type LivePreviewOptions, subscribeLivePreview } from '@easy-cms/core/live-preview'
import { onBeforeUnmount, onMounted, type Ref } from 'vue'

/**
 * Live preview for a page: while the page is shown in the admin's preview, `data` is replaced
 * with the document being edited on every change, unsaved. Elsewhere it does nothing.
 *
 * ```ts
 * const { data: post } = await useFetch(`/api/posts/${slug}`)
 * useLivePreview(post)
 * ```
 */
export function useLivePreview<T>(data: Ref<T>, options: LivePreviewOptions = {}): void {
  let stop: (() => void) | undefined
  onMounted(() => {
    stop = subscribeLivePreview<T>((doc) => {
      data.value = doc
    }, options)
  })
  onBeforeUnmount(() => stop?.())
}
