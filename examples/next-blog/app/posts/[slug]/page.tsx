import { getEasyCMS, getEasyCMSUser } from '@easy-cms/next'
import { jsonLdScript, seoMeta } from '@easy-cms/plugin-seo'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import config from '@/easy-cms.config'
import { PostView } from './post-view'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ locale?: string }>
}

/** Thai by default, English at `?locale=en`. */
async function localeOf(searchParams: Props['searchParams']) {
  return (await searchParams).locale === 'en' ? 'en' : 'th'
}

/**
 * Search and share metadata from the post's SEO fields: title, description, Open Graph,
 * "noindex", the canonical and hreflang links, and JSON-LD.
 */
async function seoFor(post: Record<string, unknown>, locale: 'th' | 'en') {
  // Absolute URLs for the canonical link and share image: this request's origin.
  const request = await headers()
  const origin = `${request.get('x-forwarded-proto') ?? 'http'}://${request.get('host')}`
  return seoMeta(post, {
    siteUrl: origin,
    config,
    locale,
    // The same address as generateURL in easy-cms.config.ts.
    url: (p, l) => `/posts/${p.slug}${l === 'en' ? '?locale=en' : ''}`,
    type: 'article',
  })
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params
  const locale = await localeOf(searchParams)
  const cms = await getEasyCMS(config)
  const { docs } = await cms.find('posts', {
    where: { slug: { equals: decodeURIComponent(slug) } },
    limit: 1,
    locale,
  })
  const post = docs[0]
  if (!post) return {}
  return (await seoFor(post, locale)).next
}

export default async function PostPage({ params, searchParams }: Props) {
  const { slug } = await params
  const locale = await localeOf(searchParams)
  const cms = await getEasyCMS(config)
  // Logged-in editors can preview drafts: access rules decide, drafts included for them.
  const user = await getEasyCMSUser(config)
  const { docs } = await cms.find('posts', {
    where: { slug: { equals: decodeURIComponent(slug) } },
    limit: 1,
    locale,
    overrideAccess: false,
    user,
    draft: user !== null,
  })
  const post = docs[0]
  if (!post) notFound()
  const seo = await seoFor(post, locale)
  return (
    <>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: jsonLdScript escapes "<"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(seo.jsonLd) }}
      />
      <PostView post={post} />
    </>
  )
}
