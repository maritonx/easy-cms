import { getEasyCMS, getEasyCMSUser } from '@easy-cms/next'
import { findByPath } from '@easy-cms/plugin-nested-docs'
import { jsonLdScript, seoMeta } from '@easy-cms/plugin-seo'
import { renderRichText } from '@easy-cms/richtext'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import config from '@/easy-cms.config'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ path: string[] }>
  searchParams: Promise<{ locale?: string }>
}

/** A page by its full path (/p/about/team), Thai by default and English at `?locale=en`. */
async function load({ params, searchParams }: Props, preview: boolean) {
  const path = `/${(await params).path.join('/')}`
  const locale: 'th' | 'en' = (await searchParams).locale === 'en' ? 'en' : 'th'
  const cms = await getEasyCMS(config)
  // Logged-in editors can preview drafts, like posts.
  const user = preview ? await getEasyCMSUser(config) : null
  const page = await findByPath(cms, 'pages', path, {
    locale,
    overrideAccess: false,
    user,
    draft: user !== null,
  })
  return { page, locale }
}

/** Metadata, with BreadcrumbList JSON-LD so search results can show where the page sits. */
type PageDoc = NonNullable<Awaited<ReturnType<typeof load>>['page']>

async function seoFor(page: PageDoc, locale: 'th' | 'en') {
  const request = await headers()
  const origin = `${request.get('x-forwarded-proto') ?? 'http'}://${request.get('host')}`
  // Like pageURL in easy-cms.config.ts.
  const href = (path: string) => `/p${path}${locale === 'en' ? '?locale=en' : ''}`
  return seoMeta(page, {
    siteUrl: origin,
    config,
    locale,
    url: (p) => (typeof p.path === 'string' ? href(p.path) : null),
    breadcrumbs: page.breadcrumbs.map((b) => ({ name: b.label ?? '', url: href(b.url ?? '') })),
  })
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { page, locale } = await load(props, false)
  return page ? (await seoFor(page, locale)).next : {}
}

export default async function Page(props: Props) {
  const { page, locale } = await load(props, true)
  if (!page) notFound()
  const seo = await seoFor(page, locale)
  const query = locale === 'en' ? '?locale=en' : ''
  const breadcrumbs = page.breadcrumbs
  return (
    <article>
      {[seo.jsonLd, seo.breadcrumbList].filter(Boolean).map((data, i) => (
        <script
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list of two
          key={i}
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: jsonLdScript escapes "<"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(data as Record<string, unknown>) }}
        />
      ))}
      {breadcrumbs.length > 1 ? (
        <nav aria-label="Breadcrumb" className="breadcrumbs">
          <ol>
            {breadcrumbs.map((crumb, i) => (
              <li key={crumb.id}>
                {i < breadcrumbs.length - 1 ? (
                  <Link href={`/p${crumb.url}${query}`}>{crumb.label}</Link>
                ) : (
                  <span aria-current="page">{crumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      {page.status === 'draft' ? (
        <p>
          <strong>Draft preview</strong>
        </p>
      ) : null}
      <h1>{String(page.title)}</h1>
      <div
        className="body"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: renderRichText escapes text and drops unsafe URLs
        dangerouslySetInnerHTML={{ __html: renderRichText(page.body) }}
      />
    </article>
  )
}
