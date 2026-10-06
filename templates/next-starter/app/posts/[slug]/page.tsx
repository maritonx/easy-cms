import { getEasyCMS, getEasyCMSUser } from '@easy-cms/next'
import { seoMeta } from '@easy-cms/plugin-seo'
import { renderRichText } from '@easy-cms/richtext'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import config from '@/easy-cms.config'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

async function findPost(slug: string) {
  const cms = await getEasyCMS(config)
  // Signed-in editors also see drafts (live preview from the admin).
  const user = await getEasyCMSUser(config)
  const { docs } = await cms.find('posts', {
    where: { slug: { equals: decodeURIComponent(slug) } },
    limit: 1,
    overrideAccess: false,
    user,
    draft: user !== null,
  })
  return docs[0]
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await findPost((await params).slug)
  if (!post) return {}
  const request = await headers()
  const origin = `${request.get('x-forwarded-proto') ?? 'https'}://${request.get('host')}`
  const seo = await seoMeta(post, { siteUrl: origin, config, url: (p) => `/posts/${p.slug}` })
  return seo.next
}

export default async function PostPage({ params }: Props) {
  const post = await findPost((await params).slug)
  if (!post) notFound()
  const cover = typeof post.cover === 'object' && post.cover ? post.cover : null
  return (
    <article>
      {post.status === 'draft' ? (
        <p>
          <strong>Draft preview</strong>
        </p>
      ) : null}
      {/* biome-ignore lint/performance/noImgElement: CMS media URLs; next/image would need remotePatterns */}
      {cover ? <img src={cover.url ?? ''} alt={cover.alt ?? ''} className="cover" /> : null}
      <h1>{post.title}</h1>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: renderRichText escapes text and drops unsafe URLs */}
      <div className="body" dangerouslySetInnerHTML={{ __html: renderRichText(post.body) }} />
    </article>
  )
}
