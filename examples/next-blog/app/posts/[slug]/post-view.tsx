'use client'

import type { RichTextBlocks } from '@easy-cms/core'
import { useLivePreview } from '@easy-cms/next/live-preview'
import { escapeHtml, type RichTextInput, renderRichText } from '@easy-cms/richtext'
import type config from '@/easy-cms.config'

type Section =
  | { id: string; blockType: 'quote'; text: string; author?: string | null }
  | { id: string; blockType: 'callout'; text: string; tone?: string | null }

interface Post {
  title: string
  status?: string
  body?: RichTextInput | null
  cover?: unknown
  gallery?: unknown[]
  sections?: Section[]
}

type BodyBlock = RichTextBlocks<typeof config, 'posts', 'body'>

/** A related post or page's address; `null` until it is populated (or when it can't be read). */
function linkOf(doc: BodyBlock & { blockType: 'card' }): { href: string; title: string } | null {
  const { relationTo, value } = doc.fields.doc
  if (typeof value !== 'object' || value === null) return null
  const page = value as { slug?: string | null; path?: string | null; title?: string | null }
  const href = relationTo === 'posts' ? `/posts/${page.slug}` : (page.path ?? `/${page.slug}`)
  return { href, title: page.title ?? '' }
}

/** Renders a post; in the admin's live preview it follows the form as you type, unsaved. */
export function PostView({ post: initial }: { post: Post }) {
  const post = useLivePreview(initial)
  // Blocks between paragraphs: a card for another post or page, and a callout.
  const html = renderRichText<BodyBlock>(post.body, {
    blocks: {
      card: (_fields, block) => {
        const link = linkOf(block)
        return link
          ? `<a class="doc-card" href="${escapeHtml(link.href)}">${escapeHtml(link.title)}</a>`
          : ''
      },
      callout: (fields) =>
        `<aside class="callout ${fields.tone === 'warning' ? 'warning' : 'info'}">${escapeHtml(fields.text)}</aside>`,
    },
  })
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
      <Gallery images={post.gallery} />
    </article>
  )
}

interface Image {
  id: string | number
  url: string
  alt?: string | null
  sizes?: Record<string, { url?: string }>
}

/** The post's gallery: populated media documents (ids while the live preview catches up). */
function Gallery({ images = [] }: { images?: unknown[] | undefined }) {
  const shown = images.filter((m): m is Image => typeof m === 'object' && m !== null && 'url' in m)
  if (shown.length === 0) return null
  return (
    <ul className="gallery">
      {shown.map((image) => (
        <li key={image.id}>
          <a href={image.url}>
            {/* biome-ignore lint/performance/noImgElement: CMS media URLs; next/image would need remotePatterns */}
            <img
              src={image.sizes?.thumbnail?.url ?? image.url}
              alt={image.alt ?? ''}
              loading="lazy"
            />
          </a>
        </li>
      ))}
    </ul>
  )
}
