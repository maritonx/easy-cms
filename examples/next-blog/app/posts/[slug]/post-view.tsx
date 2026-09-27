'use client'

import { useLivePreview } from '@easy-cms/next/live-preview'
import { type RichTextInput, renderRichText } from '@easy-cms/richtext'

interface Post {
  title: string
  status?: string
  body?: RichTextInput | null
  cover?: unknown
}

/** Renders a post; in the admin's live preview it follows the form as you type, unsaved. */
export function PostView({ post: initial }: { post: Post }) {
  const post = useLivePreview(initial)
  const html = renderRichText(post.body)
  const cover =
    typeof post.cover === 'object' && post.cover
      ? (post.cover as { url: string; alt?: string })
      : null
  return (
    <article>
      {post.status === 'draft' ? (
        <p>
          <strong>Draft preview</strong>
        </p>
      ) : null}
      {/* biome-ignore lint/performance/noImgElement: CMS media URLs; next/image would need remotePatterns */}
      {cover ? <img src={cover.url} alt={cover.alt ?? ''} className="cover" /> : null}
      <h1>{post.title}</h1>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: renderRichText escapes text and drops unsafe URLs */}
      <div className="body" dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  )
}
