import { META_FIELD } from './shared.js'
import { absolute } from './source.js'

type Doc = Record<string, unknown>
type Value = string | null | undefined

export interface SeoMetaOptions {
  /**
   * The site's public address, to make the canonical and image URLs absolute, e.g.
   * `https://example.com`. Default: `config.admin.siteURL`, then `config.serverURL`.
   */
  readonly siteURL?: string
  /** Your Easy CMS config, to read `admin.siteURL`, `serverURL` and `localization` from. */
  readonly config?: object
  /**
   * The page's canonical address: absolute, or a path on the site. As a function it gets the
   * locale too, which adds `hreflang` links to the page in every locale.
   */
  readonly url?: string | ((doc: Doc, locale?: string) => Value)
  /** The page's content locale, e.g. `en`. Shown as `og:locale`. */
  readonly locale?: string
  /** All content locales, for `hreflang`. Default: `config.localization.locales`. */
  readonly locales?: readonly string[]
  /** The locale for `x-default`. Default: `config.localization.defaultLocale`, then the first. */
  readonly defaultLocale?: string
  /** The title when `meta.title` is empty. Default: the document's `title`. */
  readonly title?: (doc: Doc) => Value
  /** The description when `meta.description` is empty. Default: `excerpt`, then `description`. */
  readonly description?: (doc: Doc) => Value
  /** Shown as `og:site_name`. */
  readonly siteName?: string
  /** `article` for posts: adds the published and modified times, and BlogPosting JSON-LD. */
  readonly type?: 'website' | 'article'
  /** When the article was published. Default: `publishedAt`, then `createdAt`. */
  readonly publishedTime?: (doc: Doc) => Value
  /** The article's author, e.g. `(post) => post.author?.name`. */
  readonly author?: string | ((doc: Doc) => Value)
  /** Schema.org type of an article's JSON-LD. Default `BlogPosting`. */
  readonly articleType?: 'Article' | 'BlogPosting' | 'NewsArticle'
  /**
   * The trail to the page, top level first and the page last, for BreadcrumbList JSON-LD
   * (search results can show it). URLs are absolute or paths on the site, e.g. from the nested
   * docs plugin: `page.breadcrumbs.map((b) => ({ name: b.label, url: \`/p${b.url}\` }))`.
   */
  readonly breadcrumbs?: readonly SeoBreadcrumb[]
}

export interface SeoBreadcrumb {
  readonly name: string
  readonly url?: string | null
}

/** What `seoMeta` reads from an Easy CMS config (raw or resolved). */
interface MetaConfig {
  readonly admin?: { readonly siteURL?: string }
  readonly serverURL?: string
  readonly localization?: {
    readonly locales: readonly string[]
    readonly defaultLocale?: string
  } | null
}

export interface SeoImage {
  readonly url: string
  readonly alt?: string
  readonly width?: number
  readonly height?: number
}

/** Keys of Nuxt's `useSeoMeta()` that `seoMeta` fills. */
export interface NuxtSeoMeta {
  title?: string
  description?: string
  robots?: string
  ogTitle?: string
  ogDescription?: string
  ogUrl?: string
  ogType?: 'website' | 'article'
  ogSiteName?: string
  ogLocale?: string
  ogLocaleAlternate?: string[]
  ogImage?: string
  ogImageAlt?: string
  ogImageWidth?: number
  ogImageHeight?: number
  articlePublishedTime?: string
  articleModifiedTime?: string
  articleAuthor?: string[]
  twitterCard?: 'summary' | 'summary_large_image'
  twitterTitle?: string
  twitterDescription?: string
  twitterImage?: string
}

/** Input for Nuxt's `useHead()`: the canonical and hreflang links, and the JSON-LD script. */
export interface NuxtSeoHead {
  link: { rel: 'canonical' | 'alternate'; href: string; hreflang?: string }[]
  script: { type: 'application/ld+json'; innerHTML: string }[]
}

/** The part of Next.js `Metadata` that `seoMeta` fills. */
export interface NextSeoMetadata {
  title?: string
  description?: string
  robots?: { index: false }
  alternates?: { canonical?: string; languages?: Record<string, string> }
  openGraph: {
    type: 'website' | 'article'
    title?: string
    description?: string
    url?: string
    siteName?: string
    locale?: string
    alternateLocale?: string[]
    images?: SeoImage[]
    publishedTime?: string
    modifiedTime?: string
    authors?: string[]
  }
  twitter: {
    card: 'summary' | 'summary_large_image'
    title?: string
    description?: string
    images?: string[]
  }
}

export type JsonLd = Record<string, unknown>

export interface SeoMeta {
  readonly title: string | undefined
  readonly description: string | undefined
  readonly canonical: string | undefined
  readonly image: SeoImage | undefined
  /** The editor ticked "Hide from search engines". */
  readonly noindex: boolean
  /** The page in each locale, and `x-default`; `undefined` without locales. */
  readonly alternates: Readonly<Record<string, string>> | undefined
  /** Schema.org data for the page: BlogPosting (or `articleType`) for articles, else WebPage. */
  readonly jsonLd: JsonLd
  /** BreadcrumbList JSON-LD from `breadcrumbs`; `undefined` without them. */
  readonly breadcrumbList: JsonLd | undefined
  /** For Nuxt's `useSeoMeta()`. */
  readonly nuxt: NuxtSeoMeta
  /** For Nuxt's `useHead()`: canonical and hreflang links, and the JSON-LD script. */
  readonly head: NuxtSeoHead
  /**
   * For Next.js `generateMetadata()`. Render `jsonLd` (and `breadcrumbList`) with
   * `jsonLdScript()` in the page.
   */
  readonly next: NextSeoMetadata
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined

/** `th-TH` → `th_TH`, the form Open Graph uses. */
const ogLocale = (locale: string) => locale.replace('-', '_')

const defined = <T extends Record<string, unknown>>(record: T) =>
  Object.fromEntries(Object.entries(record).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>
  }

/**
 * Page metadata from a document with SEO fields: the meta values, or fallbacks from the
 * document. Fetch the document with `depth` 1 or more so the share image has its URL.
 *
 * ```ts
 * const meta = seoMeta(post, { config, locale, url: (p, l) => `/${l}/posts/${p.slug}`, type: 'article' })
 * useSeoMeta(meta.nuxt); useHead(meta.head)   // Nuxt
 * return meta.next                             // Next.js generateMetadata()
 * ```
 */
export function seoMeta(doc: Doc, options: SeoMetaOptions = {}): SeoMeta {
  const config = options.config as MetaConfig | undefined
  const meta = (doc[META_FIELD] ?? {}) as Doc
  const site = options.siteURL ?? (config?.admin?.siteURL || config?.serverURL)
  const title = text(meta.title) ?? text((options.title ?? ((d) => d.title as string))(doc))
  const description =
    text(meta.description) ??
    text((options.description ?? ((d) => (d.excerpt ?? d.description) as string))(doc))
  const noindex = meta.noindex === true
  const article = options.type === 'article'

  const locale = options.locale
  const locales = options.locales ?? config?.localization?.locales ?? []
  const urlFor = (l: string | undefined) => {
    const url = typeof options.url === 'function' ? options.url(doc, l) : options.url
    return text(url) ? absolute(text(url) as string, site) : undefined
  }
  const canonical = urlFor(locale)
  let alternates: Record<string, string> | undefined
  if (typeof options.url === 'function' && locales.length > 1) {
    alternates = {}
    for (const l of locales) {
      const url = urlFor(l)
      if (url) alternates[l] = url
    }
    const fallback = options.defaultLocale ?? config?.localization?.defaultLocale ?? locales[0]
    if (fallback && alternates[fallback]) alternates['x-default'] = alternates[fallback]
    if (Object.keys(alternates).length === 0) alternates = undefined
  }

  const media = meta.image
  const image: SeoImage | undefined =
    typeof media === 'object' && media !== null && text((media as Doc).url)
      ? {
          url: absolute(text((media as Doc).url) as string, site),
          ...(text((media as Doc).alt) ? { alt: text((media as Doc).alt) as string } : {}),
          ...(typeof (media as Doc).width === 'number'
            ? { width: (media as Doc).width as number }
            : {}),
          ...(typeof (media as Doc).height === 'number'
            ? { height: (media as Doc).height as number }
            : {}),
        }
      : undefined

  const publishedTime = article
    ? text((options.publishedTime ?? ((d) => (d.publishedAt ?? d.createdAt) as string))(doc))
    : undefined
  const modifiedTime = article ? text(doc.updatedAt) : undefined
  const author = article
    ? text(typeof options.author === 'function' ? options.author(doc) : options.author)
    : undefined
  const otherLocales = locale ? locales.filter((l) => l !== locale).map(ogLocale) : []

  const card = image ? ('summary_large_image' as const) : ('summary' as const)
  const type = article ? ('article' as const) : ('website' as const)

  const jsonLd: JsonLd = article
    ? defined({
        '@context': 'https://schema.org',
        '@type': options.articleType ?? 'BlogPosting',
        headline: title,
        description,
        image: image ? [image.url] : undefined,
        datePublished: publishedTime,
        dateModified: modifiedTime,
        author: author ? { '@type': 'Person', name: author } : undefined,
        mainEntityOfPage: canonical,
        url: canonical,
        inLanguage: locale,
      })
    : defined({
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: title,
        description,
        url: canonical,
        primaryImageOfPage: image ? image.url : undefined,
        inLanguage: locale,
      })

  const trail = (options.breadcrumbs ?? []).filter((b) => text(b.name))
  const breadcrumbList: JsonLd | undefined =
    trail.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: trail.map((b, i) =>
            defined({
              '@type': 'ListItem',
              position: i + 1,
              name: text(b.name),
              // The last step is the page itself: Google takes its URL from the page.
              item: text(b.url) ? absolute(text(b.url) as string, site) : undefined,
            }),
          ),
        }
      : undefined

  const link: NuxtSeoHead['link'] = []
  if (canonical) link.push({ rel: 'canonical', href: canonical })
  for (const [hreflang, href] of Object.entries(alternates ?? {}))
    link.push({ rel: 'alternate', hreflang, href })

  return {
    title,
    description,
    canonical,
    image,
    noindex,
    alternates,
    jsonLd,
    breadcrumbList,
    head: {
      link,
      script: [jsonLd, ...(breadcrumbList ? [breadcrumbList] : [])].map((value) => ({
        type: 'application/ld+json' as const,
        innerHTML: jsonLdScript(value),
      })),
    },
    nuxt: defined({
      title,
      description,
      robots: noindex ? 'noindex' : undefined,
      ogTitle: title,
      ogDescription: description,
      ogUrl: canonical,
      ogType: type,
      ogSiteName: options.siteName,
      ogLocale: locale ? ogLocale(locale) : undefined,
      ogLocaleAlternate: otherLocales.length > 0 ? otherLocales : undefined,
      ogImage: image?.url,
      ogImageAlt: image?.alt,
      ogImageWidth: image?.width,
      ogImageHeight: image?.height,
      articlePublishedTime: publishedTime,
      articleModifiedTime: modifiedTime,
      articleAuthor: author ? [author] : undefined,
      twitterCard: card,
      twitterTitle: title,
      twitterDescription: description,
      twitterImage: image?.url,
    }),
    next: defined({
      title,
      description,
      robots: noindex ? ({ index: false } as const) : undefined,
      alternates:
        canonical || alternates
          ? defined({ canonical, languages: alternates ? { ...alternates } : undefined })
          : undefined,
      openGraph: defined({
        title,
        description,
        url: canonical,
        siteName: options.siteName,
        locale: locale ? ogLocale(locale) : undefined,
        alternateLocale: otherLocales.length > 0 ? otherLocales : undefined,
        type,
        images: image ? [image] : undefined,
        publishedTime,
        modifiedTime,
        authors: author ? [author] : undefined,
      }),
      twitter: defined({
        card,
        title,
        description,
        images: image ? [image.url] : undefined,
      }),
    }),
  }
}

export interface SiteJsonLdOptions {
  /** The organization or site name. */
  readonly name: string
  /** The site's address, e.g. `https://example.com`. */
  readonly url: string
  /** Address of the logo image. */
  readonly logo?: string
  /** Profiles elsewhere, e.g. Facebook or LinkedIn pages. */
  readonly sameAs?: readonly string[]
  /** The site's main language, e.g. `th`. */
  readonly inLanguage?: string
}

/** Organization and WebSite JSON-LD for the site's layout, once per page. */
export function siteJsonLd(options: SiteJsonLdOptions): JsonLd {
  const url = options.url.replace(/\/+$/, '')
  return {
    '@context': 'https://schema.org',
    '@graph': [
      defined({
        '@type': 'Organization',
        '@id': `${url}/#organization`,
        name: options.name,
        url: `${url}/`,
        logo: options.logo,
        sameAs: options.sameAs && options.sameAs.length > 0 ? [...options.sameAs] : undefined,
      }),
      defined({
        '@type': 'WebSite',
        '@id': `${url}/#website`,
        name: options.name,
        url: `${url}/`,
        inLanguage: options.inLanguage,
        publisher: { '@id': `${url}/#organization` },
      }),
    ],
  }
}

/**
 * JSON-LD as text for a `<script type="application/ld+json">`, safe to put in HTML: `<` and
 * line separators are escaped, so content can't close the script tag.
 */
export function jsonLdScript(value: JsonLd): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}
