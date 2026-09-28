import { META_FIELD } from './shared.js'

type Doc = Record<string, unknown>

/** What `sitemap()` needs from the plugin's options; kept on the plugin's endpoint handler. */
export interface SitemapSource {
  readonly collections: readonly string[]
  readonly globals: readonly string[]
  readonly generateURL:
    | ((args: {
        doc: Doc
        id: string | number | null
        locale: string | null
        collection?: string
        global?: string
        cms: never
        user: null
      }) => unknown)
    | undefined
}

/**
 * A key in the global symbol registry, not a module-level WeakMap: Next.js bundles the plugin
 * once per server layer, and the instance may come from the other layer's copy.
 */
export const SITEMAP_SOURCE = Symbol.for('easy-cms.plugin-seo.sitemap')

/** The part of the Local API `sitemap()` uses; a structural type, so core isn't imported. */
interface SitemapCMS {
  readonly config: {
    readonly admin: { readonly siteUrl?: string }
    readonly serverURL?: string
    readonly localization: {
      readonly locales: readonly string[]
      readonly defaultLocale: string
    } | null
    readonly endpoints: readonly { readonly handler: unknown }[]
  }
  find(
    collection: string,
    options: Record<string, unknown>,
  ): Promise<{ docs: Doc[]; hasNextPage: boolean }>
  findGlobal(global: string, options: Record<string, unknown>): Promise<Doc>
}

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
}

export interface SitemapXmlOptions extends SitemapOptions {
  /** Which part of a large sitemap (over 50,000 URLs) to render, from 1. */
  readonly page?: number | string | null
  /** Address of this sitemap, for the index of a large one. Default `<siteUrl>/sitemap.xml`. */
  readonly base?: string
}

/** Google's limit of URLs in one sitemap file. */
export const SITEMAP_LIMIT = 50_000
const BATCH = 500

/**
 * Every page with SEO fields that a visitor can see: documents read without a login (so only
 * published ones, as the read access allows), with a URL from `generateURL` and not hidden with
 * "noindex". Returns the shape Next.js `app/sitemap.ts` expects.
 */
export async function sitemap(
  cms: SitemapCMS,
  options: SitemapOptions = {},
): Promise<SitemapEntry[]> {
  const source = findSource(cms)
  const site = options.siteUrl ?? (cms.config.admin.siteUrl || cms.config.serverURL)
  const localization = cms.config.localization
  const locales: (string | null)[] = localization ? [...localization.locales] : [null]
  const generateURL = source.generateURL
  if (!generateURL) return []

  /** Pages by key (`c:<slug>:<id>` or `g:<slug>`), each with its URL per locale. */
  type Page = { urls: Map<string | null, string>; lastModified?: string }
  const pages = new Map<string, Page>()
  const add = async (key: string, doc: Doc, locale: string | null, target: object) => {
    if ((doc[META_FIELD] as Doc | undefined)?.noindex === true) return
    const id = (doc.id as string | number | undefined) ?? null
    const url = await generateURL({
      doc,
      id,
      locale,
      cms: cms as never,
      user: null,
      ...target,
    })
    if (typeof url !== 'string' || url.trim() === '') return
    const page: Page = pages.get(key) ?? { urls: new Map() }
    page.urls.set(locale, absolute(url.trim(), site))
    if (typeof doc.updatedAt === 'string') page.lastModified = doc.updatedAt
    pages.set(key, page)
  }

  for (const collection of source.collections) {
    for (const locale of locales) {
      for (let page = 1; ; page++) {
        const result = await visitor(() =>
          cms.find(collection, {
            overrideAccess: false,
            user: null,
            depth: 0,
            sort: 'id',
            limit: BATCH,
            page,
            ...(locale ? { locale } : {}),
          }),
        )
        if (!result) break
        for (const doc of result.docs)
          await add(`c:${collection}:${doc.id}`, doc, locale, { collection })
        if (!result.hasNextPage) break
      }
    }
  }
  for (const global of source.globals) {
    for (const locale of locales) {
      const doc = await visitor(() =>
        cms.findGlobal(global, {
          overrideAccess: false,
          user: null,
          depth: 0,
          ...(locale ? { locale } : {}),
        }),
      )
      if (doc && doc.status !== 'draft') await add(`g:${global}`, doc, locale, { global })
    }
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
export async function sitemapXml(
  cms: SitemapCMS,
  options: SitemapXmlOptions = {},
): Promise<string> {
  const entries = await sitemap(cms, options)
  const page = Number(options.page ?? 0)
  if (entries.length > SITEMAP_LIMIT && !(page >= 1)) {
    const site = options.siteUrl ?? (cms.config.admin.siteUrl || cms.config.serverURL) ?? ''
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

function findSource(cms: SitemapCMS): SitemapSource {
  for (const endpoint of cms.config.endpoints) {
    const source = (endpoint.handler as { [SITEMAP_SOURCE]?: SitemapSource })[SITEMAP_SOURCE]
    if (source) return source
  }
  throw new Error('sitemap: add seoPlugin() to the plugins in your Easy CMS config')
}

/** Runs a read as a visitor; `undefined` when visitors may not read it at all. */
async function visitor<T>(read: () => Promise<T>): Promise<T | undefined> {
  try {
    return await read()
  } catch (error) {
    const status = (error as { status?: number }).status
    if (status === 401 || status === 403 || status === 404) return undefined
    throw error
  }
}

/** Joins a path to the site's address; leaves absolute URLs, and paths when there is no site. */
export function absolute(url: string, site: string | undefined): string {
  if (/^https?:\/\//.test(url) || !site || !/^https?:\/\//.test(site)) return url
  return `${site.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`
}

const xml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c] as string,
  )
