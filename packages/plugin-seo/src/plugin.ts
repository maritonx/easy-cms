// Types only: `seoMeta()` from this package runs in browsers too, so no core code is imported.
import type {
  AfterChangeHook,
  AfterDeleteHook,
  AuthUser,
  BeforeChangeHook,
  CollectionConfig,
  Config,
  EasyCMS,
  Endpoint,
  Field,
  GlobalConfig,
  Label,
  LayoutNode,
  Plugin,
  TypedPlugin,
} from '@easy-cms/core'
import { createIndexNow, INDEXNOW_KEY, INDEXNOW_SOURCE, type IndexNowOptions } from './indexnow.js'
import { INFO } from './info.js'
import { llmsFullTxt, llmsTxt } from './llms.js'
import { type RobotsTxtOptions, robotsTxt } from './robots.js'
import {
  DEFAULT_DESCRIPTION_LENGTH,
  DEFAULT_TITLE_LENGTH,
  GENERATE_KINDS,
  GENERATE_PATH,
  type GenerateKind,
  type ImageProps,
  META_FIELD,
  type MeterProps,
  type PreviewProps,
} from './shared.js'
import { sitemapXml } from './sitemap.js'
import { absolute, type LlmsOptions, SEO_SOURCE, type SeoSource } from './source.js'

type MaybePromise<T> = T | Promise<T>

export interface GenerateArgs {
  /** The document as edited in the admin (not saved yet), or as saved with `autoGenerate`. */
  readonly doc: Record<string, unknown>
  /** The document's id; `null` while it is being created. */
  readonly id: string | number | null
  /** The content locale being edited; `null` without localization or when saving. */
  readonly locale: string | null
  /** Slug of the collection, when the document is in one. */
  readonly collection?: string
  /** Slug of the global, when the document is a global. */
  readonly global?: string
  readonly cms: EasyCMS
  readonly user: AuthUser | null
}

export type Generate<T> = (args: GenerateArgs) => MaybePromise<T | null | undefined>

export interface SeoPluginOptions {
  /** Collections that get SEO fields, by slug. */
  readonly collections?: readonly string[]
  /** Globals that get SEO fields, by slug. */
  readonly globals?: readonly string[]
  /** `main`: below the other fields (room for the search preview). `sidebar`: the side column. Default `main`. */
  readonly position?: 'main' | 'sidebar'
  /**
   * With `position: 'main'`: the SEO fields in a tab of their own on the edit page, after the
   * others (`admin.layout`); its label, or `false` to leave them below the other fields. Default
   * `true` (labelled like the group).
   */
  readonly tab?: boolean | Label
  /** Suggests a meta title, e.g. `({ doc }) => \`${doc.title} | My Blog\``. Adds a Generate button. */
  readonly generateTitle?: Generate<string>
  /** Suggests a meta description, e.g. from an excerpt. Adds a Generate button. */
  readonly generateDescription?: Generate<string>
  /** Suggests a share image: the id of a media document, e.g. the post's cover. */
  readonly generateImage?: Generate<string | number>
  /** The page's address (absolute, or a path on `admin.siteUrl`), shown in the search preview. */
  readonly generateURL?: Generate<string>
  /** Fill empty meta fields with the generators when a document is saved. Default false. */
  readonly autoGenerate?: boolean
  /** Changes the fields of the group, e.g. `(defaults) => [...defaults, noindexField]`. */
  readonly fields?: (defaults: Field[]) => Field[]
  /** Length the admin marks as good for titles. Default 50–60 characters. */
  readonly titleLength?: { readonly min: number; readonly max: number }
  /** Length the admin marks as good for descriptions. Default 100–150 characters. */
  readonly descriptionLength?: { readonly min: number; readonly max: number }
  /** One value per content locale. Default: true when the config has `localization`. */
  readonly localized?: boolean
  /** Label of the group. Default "SEO". */
  readonly label?: Label
  /**
   * `robots.txt` for the standalone server (`easy-cms serve`), or `false` for none. Nuxt and
   * Next.js apps serve their own with `robotsTxt()`.
   */
  readonly robots?: Omit<RobotsTxtOptions, 'config'> | false
  /**
   * `llms.txt` and `llms-full.txt` for AI assistants: the title, summary, links to Markdown
   * versions and how many pages. The standalone server serves them; Nuxt and Next.js apps use
   * `llmsTxt()` and `llmsFullTxt()`. `false` turns the standalone routes off.
   */
  readonly llms?: LlmsOptions | false
  /** Markdown of a page in a collection or global, by slug, instead of the automatic one. */
  readonly markdown?: Readonly<Record<string, (doc: Record<string, unknown>) => string>>
  /** Tell Bing and other IndexNow search engines about changed pages as they are published. */
  readonly indexNow?: IndexNowOptions
}

const ADMIN_MODULE = '@easy-cms/plugin-seo/admin'

/** Text fields (and their generator) the plugin checks and fills. */
const TEXT_KINDS = ['title', 'description'] as const

/**
 * Adds a `meta` group (title, description, image) to the chosen collections and globals,
 * with length meters, a search result preview and Generate buttons in the admin.
 */
/** The `meta` group the plugin adds, as the inferred document types see it. */
export type SeoMetaField = {
  readonly name: 'meta'
  readonly type: 'group'
  readonly fields: readonly [
    { readonly name: 'title'; readonly type: 'text' },
    { readonly name: 'description'; readonly type: 'textarea' },
    { readonly name: 'image'; readonly type: 'upload' },
    { readonly name: 'noindex'; readonly type: 'boolean' },
  ]
}

/** What `seoPlugin(options)` adds: `meta` on the collections and globals it was given. */
export type SeoPluginTypes<C extends string, G extends string> = {
  readonly fields: { readonly [S in C]: readonly [SeoMetaField] }
  readonly globalFields: { readonly [S in G]: readonly [SeoMetaField] }
}

export function seoPlugin<const C extends string = never, const G extends string = never>(
  options: SeoPluginOptions & {
    readonly collections?: readonly C[]
    readonly globals?: readonly G[]
  } = {},
): TypedPlugin<SeoPluginTypes<C, G>> {
  // Like `definePlugin()` from core, without importing it.
  const plugin: Plugin = (config: Config): Config => {
    const collections = options.collections ?? []
    const globals = options.globals ?? []
    const known = (
      list: readonly { slug: string }[] | undefined,
      slugs: readonly string[],
      kind: string,
    ) => {
      const missing = slugs.filter((slug) => !list?.some((c) => c.slug === slug))
      if (missing.length > 0)
        throw new Error(`seoPlugin: unknown ${kind} ${missing.map((s) => `"${s}"`).join(', ')}`)
    }
    known(config.collections, collections, 'collection')
    known(config.globals, globals, 'global')

    const localized = options.localized ?? !!config.localization
    const generators = {
      title: options.generateTitle,
      description: options.generateDescription,
      image: options.generateImage,
      url: options.generateURL,
    }

    const group = (titleField: string | null): Field => {
      const meter = (kind: MeterProps['kind'], range: { min: number; max: number }) => ({
        tag: 'ecms-seo-meter',
        props: {
          kind,
          min: range.min,
          max: range.max,
          generate: !!generators[kind],
        } satisfies MeterProps,
      })
      const defaults: Field[] = [
        {
          name: 'title',
          type: 'text',
          label: { en: 'Meta title', th: 'ชื่อสำหรับค้นหา' },
          ...(localized ? { localized: true } : {}),
          admin: { after: [meter('title', options.titleLength ?? DEFAULT_TITLE_LENGTH)] },
        },
        {
          name: 'description',
          type: 'textarea',
          label: { en: 'Meta description', th: 'คำอธิบายสำหรับค้นหา' },
          ...(localized ? { localized: true } : {}),
          admin: {
            after: [meter('description', options.descriptionLength ?? DEFAULT_DESCRIPTION_LENGTH)],
          },
        },
        {
          name: 'image',
          type: 'upload',
          label: { en: 'Share image', th: 'รูปสำหรับแชร์' },
          ...(generators.image
            ? {
                admin: {
                  after: [
                    { tag: 'ecms-seo-image', props: { generate: true } satisfies ImageProps },
                  ],
                },
              }
            : {}),
        },
        {
          name: 'noindex',
          type: 'boolean',
          label: { en: 'Hide from search engines', th: 'ซ่อนจากเครื่องมือค้นหา' },
        },
      ]
      return {
        name: META_FIELD,
        type: 'group',
        label: options.label ?? 'SEO',
        ...(options.position === 'sidebar' ? { position: 'sidebar' as const } : {}),
        fields: options.fields ? options.fields(defaults) : defaults,
        admin: {
          after: [
            {
              tag: 'ecms-seo-preview',
              props: {
                titleField,
                url: !!generators.url,
                siteUrl: config.admin?.siteUrl ?? '',
              } satisfies PreviewProps,
            },
          ],
        },
      }
    }

    const hook: BeforeChangeHook | undefined = options.autoGenerate
      ? async ({ data, operation, originalDoc, cms, user, slug }) => {
          // A partial update without meta keeps the saved values.
          if (operation === 'update' && data[META_FIELD] === undefined) return data
          const saved = (originalDoc?.[META_FIELD] ?? {}) as Record<string, unknown>
          const meta = { ...saved, ...((data[META_FIELD] ?? {}) as Record<string, unknown>) }
          const doc = { ...originalDoc, ...data }
          const target = globals.includes(slug) ? { global: slug } : { collection: slug }
          for (const kind of [...TEXT_KINDS, 'image'] as const) {
            const generate = generators[kind]
            if (!generate || !isEmpty(meta[kind])) continue
            const id = (originalDoc?.id as string | number | undefined) ?? null
            const value = await generate({ doc, id, locale: null, cms, user, ...target })
            if (value !== null && value !== undefined && value !== '') meta[kind] = value
          }
          return { ...data, [META_FIELD]: meta }
        }
      : undefined

    if (options.indexNow && !INDEXNOW_KEY.test(options.indexNow.key ?? ''))
      throw new Error(
        'seoPlugin: indexNow.key must be 8–128 letters, digits or dashes, e.g. a UUID',
      )
    const indexNow = options.indexNow ? createIndexNow(options.indexNow) : undefined
    /** The page's addresses in every locale, for IndexNow. */
    const urlsOf = async (
      doc: Record<string, unknown>,
      target: { collection: string } | { global: string },
      cms: EasyCMS,
    ) => {
      if (!generators.url) return []
      const site = config.admin?.siteUrl || config.serverURL
      const locales = config.localization?.locales ?? [null]
      const urls = new Set<string>()
      for (const locale of locales) {
        const id = (doc.id as string | number | undefined) ?? null
        const url = await generators.url({ doc, id, locale, cms, user: null, ...target })
        if (typeof url === 'string' && url.trim()) urls.add(absolute(url.trim(), site))
      }
      return [...urls]
    }
    const live = (doc: Record<string, unknown> | undefined) =>
      !!doc && (doc.status === undefined || doc.status === 'published')
    /** Whether each document being updated is live, read before the change. */
    const wasLive = new Map<string, boolean>()
    const liveNow = async (cms: EasyCMS, slug: string, id: unknown) =>
      live(
        ((await cms.findById(slug, id as string | number, { depth: 0 })) ?? undefined) as
          | Record<string, unknown>
          | undefined,
      )
    const indexNowBefore: BeforeChangeHook = async ({
      data,
      operation,
      originalDoc,
      cms,
      slug,
    }) => {
      if (operation === 'update' && originalDoc?.id !== undefined && !globals.includes(slug))
        wasLive.set(`${slug}:${originalDoc.id}`, await liveNow(cms, slug, originalDoc.id))
      return data
    }
    const indexNowChange: AfterChangeHook = async ({ doc, previousDoc, cms, slug }) => {
      if (!indexNow) return
      if (globals.includes(slug)) {
        if (live(doc) || live(previousDoc))
          indexNow.submit(await urlsOf(doc, { global: slug }, cms), cms.logger)
        return
      }
      const key = `${slug}:${doc.id}`
      const before = wasLive.get(key)
      wasLive.delete(key)
      if (!live(doc)) {
        // Not live now: only an unpublish changes what visitors see, not a draft saved over a
        // published document (the live page stays) nor a draft that never was published.
        if (!before || (await liveNow(cms, slug, doc.id))) return
      }
      indexNow.submit(await urlsOf(doc, { collection: slug }, cms), cms.logger)
    }
    const indexNowDelete: AfterDeleteHook = async ({ doc, cms, slug }) => {
      if (indexNow && live(doc))
        indexNow.submit(await urlsOf(doc, { collection: slug }, cms), cms.logger)
    }

    const tabLabel: Label =
      typeof options.tab === 'string' || (typeof options.tab === 'object' && options.tab !== null)
        ? options.tab
        : (options.label ?? 'SEO')
    /** The edit page's layout with an SEO tab last: the rest goes in the first tab. */
    const withSeoTab = (layout: readonly LayoutNode[] | undefined): LayoutNode[] => {
      const seo: LayoutNode = { tab: tabLabel, fields: [META_FIELD] }
      const tabbed =
        (layout ?? []).length > 0 &&
        (layout ?? []).every((n) => typeof n === 'object' && 'tab' in n)
      if (tabbed) return [...(layout as LayoutNode[]), seo]
      return [{ tab: { en: 'Content', th: 'เนื้อหา' }, fields: [...(layout ?? [])] }, seo]
    }

    const withSeo = <T extends CollectionConfig | GlobalConfig>(
      container: T,
      titleField: string | null,
    ): T => {
      if (container.fields.some((f) => f.name === META_FIELD))
        throw new Error(`seoPlugin: "${container.slug}" already has a field named "${META_FIELD}"`)
      const hooks = { ...container.hooks } as Record<string, unknown[] | undefined>
      if (hook) hooks.beforeChange = [...(hooks.beforeChange ?? []), hook]
      if (indexNow) {
        hooks.beforeChange = [...(hooks.beforeChange ?? []), indexNowBefore]
        hooks.afterChange = [...(hooks.afterChange ?? []), indexNowChange]
        if (!globals.includes(container.slug))
          hooks.afterDelete = [...(hooks.afterDelete ?? []), indexNowDelete]
      }
      return {
        ...container,
        fields: [...container.fields, group(titleField)],
        ...(hook || indexNow ? { hooks } : {}),
        ...(options.position !== 'sidebar' && options.tab !== false
          ? { admin: { ...container.admin, layout: withSeoTab(container.admin?.layout) } }
          : {}),
      }
    }

    const endpoint: Endpoint = {
      path: GENERATE_PATH,
      method: 'post',
      handler: async ({ json, user, cms }) => {
        if (!user) return error(401, 'Log in to generate SEO values')
        const body = await json()
        const kind = body.kind as GenerateKind
        if (!GENERATE_KINDS.includes(kind))
          return error(400, `kind must be one of ${GENERATE_KINDS.join(', ')}`)
        const collection = typeof body.collection === 'string' ? body.collection : undefined
        const global = typeof body.global === 'string' ? body.global : undefined
        if (
          !(collection && collections.includes(collection)) &&
          !(global && globals.includes(global))
        )
          return error(404, 'No SEO fields on this collection or global')
        const generate = generators[kind]
        if (!generate) return error(404, `No generator for "${kind}"`)
        const doc =
          typeof body.doc === 'object' && body.doc !== null
            ? (body.doc as Record<string, unknown>)
            : {}
        const locale = typeof body.locale === 'string' ? body.locale : null
        const id = typeof body.id === 'string' || typeof body.id === 'number' ? body.id : null
        const value = await generate({
          doc,
          id,
          locale,
          cms,
          user,
          ...(collection ? { collection } : { global: global as string }),
        })
        return { value: value ?? null }
      },
    }

    const source: SeoSource = {
      collections,
      globals,
      generateURL: generators.url as SeoSource['generateURL'],
      llms: options.llms || {},
      markdown: options.markdown ?? {},
    }
    const xmlResponse = (body: string) =>
      new Response(body, {
        headers: {
          'content-type': 'application/xml; charset=utf-8',
          'cache-control': 'public, max-age=600',
        },
      })
    const api = config.routes?.api ?? '/api/cms'
    const sitemapHandler = (base: (origin: string) => string): Endpoint['handler'] =>
      Object.assign(
        async ({ url, cms, context }: Parameters<Endpoint['handler']>[0]) => {
          const site = config.admin?.siteUrl || config.serverURL || url.origin
          return xmlResponse(
            await sitemapXml(cms as never, {
              siteUrl: site,
              context,
              page: url.searchParams.get('page'),
              base: base(url.origin),
            }),
          )
        },
        // Lets `sitemap(cms)`, `llmsTxt(cms)`… find these options from the resolved config.
        { [SEO_SOURCE]: source },
      )
    const siteEndpoints: Endpoint[] = [
      {
        path: '/seo/sitemap.xml',
        method: 'get',
        handler: sitemapHandler((origin) => `${origin}${api}/seo/sitemap.xml`),
      },
      {
        path: '/sitemap.xml',
        method: 'get',
        root: true,
        handler: sitemapHandler((origin) => `${origin}/sitemap.xml`),
      },
    ]
    if (options.robots !== false) {
      const robots = options.robots ?? {}
      siteEndpoints.push({
        path: '/robots.txt',
        method: 'get',
        root: true,
        handler: ({ url }) =>
          new Response(robotsTxt({ sitemap: `${url.origin}/sitemap.xml`, ...robots, config }), {
            headers: { 'content-type': 'text/plain; charset=utf-8' },
          }),
      })
    }

    const textResponse = (body: string, type = 'text/plain') =>
      new Response(body, {
        headers: {
          'content-type': `${type}; charset=utf-8`,
          'cache-control': 'public, max-age=600',
        },
      })
    if (options.llms !== false) {
      const site = (origin: string) => config.admin?.siteUrl || config.serverURL || origin
      siteEndpoints.push(
        {
          path: '/llms.txt',
          method: 'get',
          root: true,
          handler: async ({ url, cms, context }) =>
            textResponse(
              await llmsTxt(cms as never, { siteUrl: site(url.origin), context }),
              'text/markdown',
            ),
        },
        {
          path: '/llms-full.txt',
          method: 'get',
          root: true,
          handler: async ({ url, cms, context }) =>
            textResponse(
              await llmsFullTxt(cms as never, { siteUrl: site(url.origin), context }),
              'text/markdown',
            ),
        },
      )
    }
    if (options.indexNow) {
      const key = options.indexNow.key
      siteEndpoints.push({
        path: `/${key}.txt`,
        method: 'get',
        root: true,
        // `indexNowKeyFile(cms, path)` finds the key here.
        handler: Object.assign(() => textResponse(key), { [INDEXNOW_SOURCE]: key }),
      })
    }

    return {
      ...config,
      collections: (config.collections ?? []).map((c) =>
        collections.includes(c.slug) ? withSeo(c, c.useAsTitle ?? null) : c,
      ),
      globals: (config.globals ?? []).map((g) => (globals.includes(g.slug) ? withSeo(g, null) : g)),
      admin: {
        ...config.admin,
        modules: [...new Set([...(config.admin?.modules ?? []), ADMIN_MODULE])],
      },
      endpoints: [...(config.endpoints ?? []), endpoint, ...siteEndpoints],
    }
  }
  // Not definePlugin(): this package's browser code must not import core's values.
  return Object.assign(plugin, { info: INFO }) as TypedPlugin<SeoPluginTypes<C, G>>
}

const isEmpty = (value: unknown) => value === null || value === undefined || value === ''

/**
 * An error in the REST API's format. Not Easy CMS's error classes: importing core at runtime
 * would pull server code into pages that only import `seoMeta`.
 */
function error(status: number, message: string): Response {
  return Response.json({ errors: [{ message }] }, { status })
}
