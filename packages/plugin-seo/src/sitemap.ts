import type { RequestContext } from '@easy-cms/core'
import { findSource, type SeoCMS, siteOf, visiblePages } from './source.js'

/** One page in the sitemap, in the shape of Next.js `MetadataRoute.Sitemap`. */
export interface SitemapEntry {
  readonly url: string
  /** ISO date of the last change (`updatedAt`). */
  readonly lastModified?: string
  /** The page in each content locale, and `x-default`. */
  readonly alternates?: { readonly languages: Readonly<Record<string, string>> }
}

export interface SitemapOptions {
  /**
   * The site's public address, to make relative URLs from `generateURL` absolute. Default:
   * `admin.siteUrl`, then `serverURL`.
   */
  readonly siteUrl?: string
  /**
   * The context to read in, e.g. the tenant of the requesting domain (`cms.forRequest(request)`,
   * or `context` of an endpoint). Default: none.
   */
  readonly context?: RequestContext
}

export interface SitemapXmlOptions extends SitemapOptions {
  /** Which part of a large sitemap (over 50,000 URLs) to render, from 1. */
  readonly page?: number | string | null
  /** Address of this sitemap, for the index of a large one. Default `<siteUrl>/sitemap.xml`. */
  readonly base?: string
}

/** Google's limit of URLs in one sitemap file. */
export const SITEMAP_LIMIT = 50_000

/**
 * Every page with SEO fields that a visitor can see: documents read without a login (so only
 * published ones, as the read access allows), with a URL from `generateURL` and not hidden with
 * "noindex". Returns the shape Next.js `app/sitemap.ts` expects.
 */
export async function sitemap(cms: SeoCMS, options: SitemapOptions = {}): Promise<SitemapEntry[]> {
  const source = findSource(cms, 'sitemap')
  const site = siteOf(cms, options.siteUrl)
  const localization = cms.config.localization
  const locales: (string | null)[] = localization ? [...localization.locales] : [null]

  /** Pages by key, each with its URL per locale. */
  type Page = { urls: Map<string | null, string>; lastModified?: string }
  const pages = new Map<string, Page>()
  for (const locale of locales) {
    await visiblePages(cms, source, {
      locale,
      site,
      ...(options.context ? { context: options.context } : {}),
      each: ({ key, doc, url }) => {
        const page: Page = pages.get(key) ?? { urls: new Map() }
        page.urls.set(locale, url)
        if (typeof doc.updatedAt === 'string') page.lastModified = doc.updatedAt
        pages.set(key, page)
      },
    })
  }

  const entries: SitemapEntry[] = []
  for (const { urls, lastModified } of pages.values()) {
    const distinct = new Set(urls.values())
    const languages: Record<string, string> = {}
    if (localization && distinct.size > 1) {
      for (const [locale, url] of urls) languages[locale as string] = url
      const fallback = urls.get(localization.defaultLocale)
      if (fallback) languages['x-default'] = fallback
    }
    for (const url of distinct) {
      if (!/^https?:\/\//.test(url))
        throw new Error(
          `sitemap: "${url}" is not an absolute URL. Set admin.siteUrl in the config, or pass siteUrl.`,
        )
      entries.push({
        url,
        ...(lastModified ? { lastModified } : {}),
        ...(Object.keys(languages).length > 0 ? { alternates: { languages } } : {}),
      })
    }
  }
  return entries
}

/**
 * The sitemap as XML. Over 50,000 URLs, it is an index of pages `<base>?page=1`, `?page=2`…,
 * and `page` renders one of them.
 */
export async function sitemapXml(cms: SeoCMS, options: SitemapXmlOptions = {}): Promise<string> {
  const entries = await sitemap(cms, options)
  const page = Number(options.page ?? 0)
  if (entries.length > SITEMAP_LIMIT && !(page >= 1)) {
    const site = siteOf(cms, options.siteUrl) ?? ''
    const base = options.base ?? `${site.replace(/\/+$/, '')}/sitemap.xml`
    const pages = Math.ceil(entries.length / SITEMAP_LIMIT)
    const items = Array.from(
      { length: pages },
      (_, i) => `  <sitemap><loc>${xml(`${base}?page=${i + 1}`)}</loc></sitemap>`,
    )
    return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items.join('\n')}
</sitemapindex>
`
  }
  const slice =
    entries.length > SITEMAP_LIMIT
      ? entries.slice((page - 1) * SITEMAP_LIMIT, page * SITEMAP_LIMIT)
      : entries
  const localized = slice.some((e) => e.alternates)
  const urls = slice.map((entry) => {
    const lines = [`    <loc>${xml(entry.url)}</loc>`]
    if (entry.lastModified) lines.push(`    <lastmod>${xml(entry.lastModified)}</lastmod>`)
    for (const [lang, href] of Object.entries(entry.alternates?.languages ?? {}))
      lines.push(`    <xhtml:link rel="alternate" hreflang="${xml(lang)}" href="${xml(href)}"/>`)
    return `  <url>\n${lines.join('\n')}\n  </url>`
  })
  const namespaces = `xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${
    localized ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml"' : ''
  }`
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset ${namespaces}>
${urls.join('\n')}
</urlset>
`
}

const xml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c] as string,
  )
