import type { RequestContext } from '@easy-cms/core'
import { META_FIELD } from './shared.js'

export type Doc = Record<string, unknown>

export interface UrlArgs {
  doc: Doc
  id: string | number | null
  locale: string | null
  collection?: string
  global?: string
  cms: never
  user: null
}

/**
 * What the site-wide helpers (`sitemap`, `llmsTxt`, `docMarkdown`…) need from the plugin's
 * options. The plugin keeps it on its endpoint handlers, so the helpers find it in the config.
 */
export interface SeoSource {
  readonly collections: readonly string[]
  readonly globals: readonly string[]
  readonly generateURL: ((args: UrlArgs) => unknown) | undefined
  readonly llms: LlmsOptions
  readonly markdown: Readonly<Record<string, (doc: Doc) => string>>
}

export interface LlmsOptions {
  /** The heading of `llms.txt`. Default: the site name from a global with SEO fields. */
  readonly title?: string
  /** One or two sentences about the site, shown as the summary. */
  readonly description?: string
  /** Newest pages per collection in `llms.txt`. Default 100. */
  readonly limit?: number
  /** The content locale of `llms.txt` and `llms-full.txt`. Default: the default locale. */
  readonly locale?: string
  /**
   * The Markdown version of a page, for `llms.txt` links (e.g. `/posts/hello.md`). Default:
   * the page's address from `generateURL`.
   */
  readonly markdownURL?: (args: {
    doc: Doc
    locale: string | null
    collection?: string
    global?: string
  }) => string | null | undefined
}

/**
 * A key in the global symbol registry, not a module-level WeakMap: Next.js bundles the plugin
 * once per server layer, and the instance may come from the other layer's copy.
 */
export const SEO_SOURCE = Symbol.for('easy-cms.plugin-seo.sitemap')

type Label = string | Readonly<Record<string, string>>
export interface FieldLike {
  readonly name: string
  readonly type: string
  readonly fields?: readonly FieldLike[]
  readonly blocks?: readonly { readonly slug: string; readonly fields: readonly FieldLike[] }[]
}

/** The part of the Local API the helpers use; a structural type, so core isn't imported. */
export interface SeoCMS {
  readonly config: {
    readonly admin: { readonly siteUrl?: string }
    readonly serverURL?: string
    readonly localization: {
      readonly locales: readonly string[]
      readonly defaultLocale: string
    } | null
    readonly endpoints: readonly { readonly handler: unknown }[]
    readonly collections?: readonly {
      readonly slug: string
      readonly useAsTitle?: string
      readonly labels?: { readonly singular?: Label; readonly plural?: Label }
      readonly fields: readonly FieldLike[]
    }[]
    readonly globals?: readonly {
      readonly slug: string
      readonly label?: Label
      readonly fields: readonly FieldLike[]
    }[]
  }
  find(
    collection: string,
    options: Record<string, unknown>,
  ): Promise<{ docs: Doc[]; hasNextPage: boolean }>
  findGlobal(global: string, options: Record<string, unknown>): Promise<Doc>
}

export function findSource(cms: SeoCMS, helper: string): SeoSource {
  for (const endpoint of cms.config.endpoints) {
    const source = (endpoint.handler as { [SEO_SOURCE]?: SeoSource })[SEO_SOURCE]
    if (source) return source
  }
  throw new Error(`${helper}: add seoPlugin() to the plugins in your Easy CMS config`)
}

/** Runs a read as a visitor; `undefined` when visitors may not read it at all. */
export async function visitor<T>(read: () => Promise<T>): Promise<T | undefined> {
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

export const siteOf = (cms: SeoCMS, siteUrl?: string) =>
  siteUrl ?? (cms.config.admin.siteUrl || cms.config.serverURL)

/** A page visitors can see: a document or global with SEO fields and an address. */
export interface VisiblePage {
  /** `c:<slug>:<id>` or `g:<slug>`. */
  readonly key: string
  readonly collection?: string
  readonly global?: string
  readonly doc: Doc
  /** Absolute when the site's address is known. */
  readonly url: string
}

const BATCH = 500

/**
 * Pages visitors can see in one locale: documents read without a login (so only published
 * ones, as the read access allows), with an address from `generateURL`, not marked "noindex".
 */
export async function visiblePages(
  cms: SeoCMS,
  source: SeoSource,
  options: {
    readonly locale: string | null
    readonly site: string | undefined
    /** The context to read in, e.g. a tenant. */
    readonly context?: RequestContext
    readonly sort?: string
    /** Populate relationships and uploads, e.g. for images in Markdown. Default 0. */
    readonly depth?: number
    /** Documents per collection; all when left out. */
    readonly limit?: number
    /** Called for each page, in order; avoids holding them all. */
    readonly each: (page: VisiblePage) => unknown
  },
): Promise<void> {
  const generateURL = source.generateURL
  if (!generateURL) return
  const { locale, site } = options
  const pageOf = async (key: string, doc: Doc, target: object) => {
    if ((doc[META_FIELD] as Doc | undefined)?.noindex === true) return
    const id = (doc.id as string | number | undefined) ?? null
    const url = await generateURL({ doc, id, locale, cms: cms as never, user: null, ...target })
    if (typeof url !== 'string' || url.trim() === '') return
    await options.each({ key, doc, url: absolute(url.trim(), site), ...target })
  }

  for (const collection of source.collections) {
    let seen = 0
    for (let page = 1; ; page++) {
      const limit = options.limit === undefined ? BATCH : Math.min(BATCH, options.limit - seen)
      if (limit <= 0) break
      const result = await visitor(() =>
        cms.find(collection, {
          overrideAccess: false,
          user: null,
          ...(options.context ? { context: options.context } : {}),
          depth: options.depth ?? 0,
          sort: options.sort ?? 'id',
          limit,
          page: options.limit === undefined ? page : 1,
          ...(locale ? { locale } : {}),
        }),
      )
      if (!result) break
      for (const doc of result.docs) await pageOf(`c:${collection}:${doc.id}`, doc, { collection })
      seen += result.docs.length
      // With a limit, one read is enough (the limit is at most a batch in practice).
      if (!result.hasNextPage || options.limit !== undefined) break
    }
  }
  for (const global of source.globals) {
    const doc = await visitor(() =>
      cms.findGlobal(global, {
        overrideAccess: false,
        user: null,
        ...(options.context ? { context: options.context } : {}),
        depth: options.depth ?? 0,
        ...(locale ? { locale } : {}),
      }),
    )
    if (doc && doc.status !== 'draft') await pageOf(`g:${global}`, doc, { global })
  }
}

/** A label in the locale, English, or any. */
export function labelText(label: Label | undefined, locale: string | null, fallback: string) {
  if (!label) return fallback
  if (typeof label === 'string') return label
  return (locale && label[locale]) || label.en || Object.values(label)[0] || fallback
}
