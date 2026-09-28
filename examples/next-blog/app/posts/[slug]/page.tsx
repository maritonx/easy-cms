import { getEasyCMS, getEasyCMSUser } from '@easy-cms/next'
import { seoMeta } from '@easy-cms/plugin-seo'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import config from '@/easy-cms.config'
import { PostView } from './post-view'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

// Search and share metadata from the post's SEO fields.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const cms = await getEasyCMS(config)
  const { docs } = await cms.find('posts', {
    where: { slug: { equals: decodeURIComponent(slug) } },
    limit: 1,
  })
  const post = docs[0]
  if (!post) return {}
  // Absolute URLs for the canonical link and share image: this request's origin.
  const request = await headers()
  const origin = `${request.get('x-forwarded-proto') ?? 'http'}://${request.get('host')}`
  return seoMeta(post, { siteUrl: origin, url: `/posts/${post.slug}` }).next
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params
  const cms = await getEasyCMS(config)
  // Logged-in editors can preview drafts: access rules decide, drafts included for them.
  const user = await getEasyCMSUser(config)
  const { docs } = await cms.find('posts', {
    where: { slug: { equals: decodeURIComponent(slug) } },
    limit: 1,
    overrideAccess: false,
    user,
    draft: user !== null,
  })
  const post = docs[0]
  if (!post) notFound()
  return <PostView post={post} />
}
