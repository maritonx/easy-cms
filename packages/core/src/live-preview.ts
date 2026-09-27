/// <reference lib="dom" />
// Browser-side live preview: runs in the site's page inside the admin's preview frame.
// No Node.js imports: this file is bundled into frontends as `@easy-cms/core/live-preview`.

/** Sent by the admin to the preview frame whenever the form changes. */
export interface LivePreviewMessage<T = Record<string, unknown>> {
  readonly type: 'easy-cms:preview'
  /** Collection slug, or `undefined` for a global. */
  readonly collection?: string
  /** Global slug, or `undefined` for a collection. */
  readonly global?: string
  /** The document as it would be read after saving, relationships populated. */
  readonly doc: T
}

/** Sent by the page to the admin when it is ready, so the admin sends the current state. */
export const READY_MESSAGE = 'easy-cms:preview-ready'

export interface LivePreviewOptions {
  /**
   * Origin(s) of the admin allowed to send updates. Default: the page's own origin, which fits
   * the Nuxt and Next.js adapters (admin and site share it). Set it for a standalone server,
   * e.g. `'https://cms.example.com'`.
   */
  readonly origin?: string | readonly string[]
}

/** True when the page is shown inside a frame (e.g. the admin's preview). */
export function isLivePreview(): boolean {
  return typeof window !== 'undefined' && window.parent !== window
}

/**
 * Calls `onChange` with the document each time the admin's form changes. Returns a function
 * that stops listening. Does nothing outside a frame, so it is safe to call on every page.
 *
 * ```ts
 * const stop = subscribeLivePreview<Post>((doc) => render(doc))
 * ```
 */
export function subscribeLivePreview<T = Record<string, unknown>>(
  onChange: (doc: T, message: LivePreviewMessage<T>) => void,
  options: LivePreviewOptions = {},
): () => void {
  if (!isLivePreview()) return () => {}
  const allowed = [options.origin ?? window.location.origin].flat()
  const listener = (event: MessageEvent) => {
    if (!allowed.includes(event.origin)) return
    const message = event.data as LivePreviewMessage<T> | undefined
    if (message?.type !== 'easy-cms:preview' || typeof message.doc !== 'object') return
    onChange(message.doc, message)
  }
  window.addEventListener('message', listener)
  // The ready ping carries no data, so any admin origin may receive it.
  window.parent.postMessage({ type: READY_MESSAGE }, '*')
  return () => window.removeEventListener('message', listener)
}
