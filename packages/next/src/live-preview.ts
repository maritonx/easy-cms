import { type LivePreviewOptions, subscribeLivePreview } from '@easy-cms/core/live-preview'
import { useEffect, useState } from 'react'

/**
 * Live preview for a Client Component: returns `initial` (e.g. the document a Server Component
 * loaded), replaced by the document being edited while the page is shown in the admin's
 * preview. Elsewhere it returns `initial` unchanged.
 *
 * ```tsx
 * 'use client'
 * export function PostView({ post }: { post: Post }) {
 *   const live = useLivePreview(post)
 *   return <h1>{live.title}</h1>
 * }
 * ```
 */
export function useLivePreview<T>(initial: T, options: LivePreviewOptions = {}): T {
  const [doc, setDoc] = useState(initial)
  const origin = [options.origin ?? []].flat().join(',')
  useEffect(() => setDoc(initial), [initial])
  // biome-ignore lint/correctness/useExhaustiveDependencies: `origin` stands for options.origin
  useEffect(() => subscribeLivePreview<T>(setDoc, options), [origin])
  return doc
}
