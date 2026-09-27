'use client'

import { useLivePreview } from '@easy-cms/next/live-preview'
import { type RichTextInput, renderRichText } from '@easy-cms/richtext'

type Section =
  | { id: string; blockType: 'quote'; text: string; author?: string | null }
  | { id: string; blockType: 'callout'; text: string; tone?: string | null }

interface Post {
  title: string
  status?: string
  body?: RichTextInput | null
  cover?: unknown
  sections?: Section[]
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
      {post.sections?.map((section) =>
        section.blockType === 'quote' ? (
          <blockquote key={section.id} className="quote">
            {section.text}
            {section.author ? <footer>— {section.author}</footer> : null}
          </blockquote>
        ) : (
          <aside key={section.id} className={`callout ${section.tone ?? 'info'}`}>
            {section.text}
          </aside>
        ),
      )}
    </article>
  )
}
