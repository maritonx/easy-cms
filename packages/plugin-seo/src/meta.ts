import { META_FIELD } from './shared.js'

type Doc = Record<string, unknown>

export interface SeoMetaOptions {
  /**
   * The site's public address, to make the canonical and image URLs absolute, e.g.
   * `https://example.com`. Default: `config.admin.siteUrl`, then `config.serverURL`.
   */
  readonly siteUrl?: string
  /** Your Easy CMS config, to read `admin.siteUrl` (and `serverURL`) from. */
  readonly config?: { readonly admin?: { readonly siteUrl?: string }; readonly serverURL?: string }
  /** The page's canonical address: absolute, or a path on the site. */
  readonly url?: string | ((doc: Doc) => string | null | undefined)
  /** The title when `meta.title` is empty. Default: the document's `title`. */
  readonly title?: (doc: Doc) => string | null | undefined
  /** The description when `meta.description` is empty. Default: `excerpt`, then `description`. */
  readonly description?: (doc: Doc) => string | null | undefined
  /** Shown as `og:site_name`. */
  readonly siteName?: string
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
  ogTitle?: string
  ogDescription?: string
  ogUrl?: string
  ogType?: 'website'
  ogSiteName?: string
  ogImage?: string
  ogImageAlt?: string
  ogImageWidth?: number
  ogImageHeight?: number
  twitterCard?: 'summary' | 'summary_large_image'
  twitterTitle?: string
  twitterDescription?: string
  twitterImage?: string
}

/** The part of Next.js `Metadata` that `seoMeta` fills. */
export interface NextSeoMetadata {
  title?: string
  description?: string
  alternates?: { canonical: string }
  openGraph: {
    type: 'website'
    title?: string
    description?: string
    url?: string
    siteName?: string
    images?: SeoImage[]
  }
  twitter: {
    card: 'summary' | 'summary_large_image'
    title?: string
    description?: string
    images?: string[]
  }
}

export interface SeoMeta {
  readonly title: string | undefined
  readonly description: string | undefined
  readonly canonical: string | undefined
  readonly image: SeoImage | undefined
  /** For Nuxt's `useSeoMeta()`. Add the canonical link with `useHead()`. */
  readonly nuxt: NuxtSeoMeta
  /** For Next.js `generateMetadata()`. */
  readonly next: NextSeoMetadata
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined

/** Joins a path to the site's address; leaves absolute URLs, and paths when there is no site. */
function absolute(url: string, site: string | undefined): string {
  if (/^https?:\/\//.test(url) || !site || !/^https?:\/\//.test(site)) return url
  return `${site.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`
}

/**
 * Page metadata from a document with SEO fields: the meta values, or fallbacks from the
 * document. Fetch the document with `depth` 1 or more so the share image has its URL.
 *
 * ```ts
 * const meta = seoMeta(post, { config, url: `/posts/${post.slug}` })
 * useSeoMeta(meta.nuxt)          // Nuxt
 * return meta.next               // Next.js generateMetadata()
 * ```
 */
export function seoMeta(doc: Doc, options: SeoMetaOptions = {}): SeoMeta {
  const meta = (doc[META_FIELD] ?? {}) as Doc
  const site = options.siteUrl ?? options.config?.admin?.siteUrl ?? options.config?.serverURL
  const title = text(meta.title) ?? text((options.title ?? ((d) => d.title as string))(doc))
  const description =
    text(meta.description) ??
    text((options.description ?? ((d) => (d.excerpt ?? d.description) as string))(doc))
  const url = typeof options.url === 'function' ? options.url(doc) : options.url
  const canonical = text(url) ? absolute(text(url) as string, site) : undefined

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

  const defined = <T extends Record<string, unknown>>(record: T) =>
    Object.fromEntries(Object.entries(record).filter(([, v]) => v !== undefined)) as {
      [K in keyof T]: Exclude<T[K], undefined>
    }
  const card = image ? ('summary_large_image' as const) : ('summary' as const)

  return {
    title,
    description,
    canonical,
    image,
    nuxt: defined({
      title,
      description,
      ogTitle: title,
      ogDescription: description,
      ogUrl: canonical,
      ogType: 'website' as const,
      ogSiteName: options.siteName,
      ogImage: image?.url,
      ogImageAlt: image?.alt,
      ogImageWidth: image?.width,
      ogImageHeight: image?.height,
      twitterCard: card,
      twitterTitle: title,
      twitterDescription: description,
      twitterImage: image?.url,
    }),
    next: defined({
      title,
      description,
      alternates: canonical ? { canonical } : undefined,
      openGraph: defined({
        title,
        description,
        url: canonical,
        siteName: options.siteName,
        type: 'website' as const,
        images: image ? [image] : undefined,
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
