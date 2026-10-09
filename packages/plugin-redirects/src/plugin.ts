import {
  type AfterChangeHook,
  type AfterDeleteHook,
  type BeforeChangeHook,
  type CollectionConfig,
  type Config,
  definePlugin,
  type EasyCMS,
  type Endpoint,
  type Field,
  type TypedPlugin,
} from '@easy-cms/core'
import { INFO } from './info.js'
import { clearRedirects, normalizePath, resolveRedirect } from './resolve.js'
import { REDIRECTS_SOURCE, type RedirectsSource, STATUSES, targetField } from './shared.js'

type Doc = Record<string, unknown>

export interface UrlArgs {
  readonly collection: string
  /** The document, as read for visitors. */
  readonly doc: Doc
  /** The content locale, or `null` without localization. */
  readonly locale: string | null
}

export interface RedirectsPluginOptions {
  /**
   * Collections a redirect can point to, as a document instead of a fixed address. The
   * redirect follows the document when its address changes, and pages in these collections
   * get a redirect automatically when their address changes (see `autoRedirect`).
   */
  readonly collections?: readonly string[]
  /**
   * A document's address, e.g. `({ doc }) => \`/posts/${doc.slug}\``. Needed with `collections`;
   * share one function with the SEO plugin's `generateURL`.
   */
  readonly url?: (args: UrlArgs) => string | null | undefined | Promise<string | null | undefined>
  /**
   * When a published page's address changes (a new slug), add a redirect from the old address.
   * Default true for all `collections`; or a list of them.
   */
  readonly autoRedirect?: boolean | readonly string[]
  /** Slug of the redirects collection. Default `redirects`. */
  readonly slug?: string
  /**
   * How long a server keeps the redirects in memory, in ms. Changes clear it at once on the
   * server that made them; other servers (serverless instances) catch up within this time.
   * Default 60000.
   */
  readonly cacheTTL?: number
}

/**
 * A `redirects` collection under Settings in the admin, `resolveRedirect()` for your app's
 * middleware, and automatic redirects when a page's address changes.
 */
/** `to_<slug>`: the field of a redirect that points to a document of collection `S`. */
type TargetField<S extends string> = `to_${Underscored<S>}`
type Underscored<S extends string> = S extends `${infer A}-${infer B}`
  ? `${A}_${Underscored<B>}`
  : S

/** The redirects collection, as the inferred document types see it. */
export type RedirectsCollection<R extends string, S extends string> = {
  readonly slug: R
  readonly fields: readonly [
    { readonly name: 'from'; readonly type: 'text'; readonly required: true },
    { readonly name: 'to'; readonly type: 'text' },
    { readonly name: 'locale'; readonly type: 'select'; readonly options: readonly string[] },
    {
      readonly name: 'type'
      readonly type: 'select'
      readonly options: readonly ['301', '302', '307', '308']
      readonly required: true
      readonly defaultValue: '301'
    },
    ...{
      [K in S]: { readonly name: TargetField<K>; readonly type: 'relationship'; readonly to: K }
    }[S][],
  ]
}

/** What `redirectsPlugin(options)` adds: the redirects collection. */
export type RedirectsPluginTypes<R extends string, S extends string> = {
  readonly collections: readonly [RedirectsCollection<R, S>]
}

export function redirectsPlugin<
  const S extends string = never,
  const R extends string = 'redirects',
>(
  options: RedirectsPluginOptions & {
    readonly collections?: readonly S[]
    readonly slug?: R
  } = {},
): TypedPlugin<RedirectsPluginTypes<R, S>> {
  return definePlugin<RedirectsPluginTypes<R, S>>((config: Config): Config => {
    const slug = options.slug ?? 'redirects'
    const collections = options.collections ?? []
    const missing = collections.filter((s) => !config.collections?.some((c) => c.slug === s))
    if (missing.length > 0)
      throw new Error(
        `redirectsPlugin: unknown collection ${missing.map((s) => `"${s}"`).join(', ')}`,
      )
    if (collections.length > 0 && !options.url)
      throw new Error(
        'redirectsPlugin: set `url` to give the address of documents in `collections`',
      )
    if (config.collections?.some((c) => c.slug === slug))
      throw new Error(`redirectsPlugin: there is already a collection "${slug}"; set \`slug\``)

    const locales = config.localization?.locales ?? []
    const auto =
      options.autoRedirect === false
        ? []
        : options.autoRedirect === true || options.autoRedirect === undefined
          ? collections
          : options.autoRedirect.filter((s) => collections.includes(s))

    const urlOf = async (cms: EasyCMS, collection: string, id: unknown, locale: string | null) => {
      const doc = await cms.findById(collection, id as string | number, {
        depth: 0,
        ...(locale ? { locale } : {}),
      })
      if (!doc || (doc.status !== undefined && doc.status !== 'published')) return null
      const url = await options.url?.({ collection, doc, locale })
      return typeof url === 'string' && url.trim() ? normalizePath(url) : null
    }
    const localeList = locales.length > 0 ? locales : [null]

    const source: RedirectsSource = {
      slug,
      collections,
      url: options.url,
      cacheTTL: options.cacheTTL ?? 60_000,
    }

    const targets: Field[] = collections.map((collection) => {
      const label = config.collections?.find((c) => c.slug === collection)?.labels?.singular
      return {
        name: targetField(collection),
        type: 'relationship',
        to: collection,
        label: label ?? collection,
      }
    })
    const redirectFields: Field[] = [
      {
        name: 'from',
        type: 'text',
        required: true,
        unique: true,
        label: { en: 'From', th: 'จาก' },
        validate: (value) =>
          value === null || value === undefined || normalizePath(String(value)) !== null
            ? true
            : 'must be a path like /old-page',
      },
      {
        name: 'to',
        type: 'text',
        label: { en: 'To (address)', th: 'ไปที่ (ที่อยู่)' },
        validate: (value, { data }) => {
          const set = [value, ...collections.map((c) => data[targetField(c)])].filter(
            (v) => v !== null && v !== undefined && v !== '',
          )
          if (set.length === 0)
            return collections.length > 0
              ? 'give an address or pick a document'
              : 'give an address, e.g. /new-page or https://example.com'
          if (set.length > 1) return 'give an address or a document, not both'
          if (typeof value === 'string' && value && !/^(\/|https?:\/\/)/.test(value.trim()))
            return 'must start with / or http(s)://'
          return true
        },
      },
      ...targets,
      ...(locales.length > 0 && collections.length > 0
        ? [
            {
              name: 'locale',
              type: 'select',
              options: [...locales],
              label: { en: 'Document locale', th: 'ภาษาของเอกสาร' },
            } as Field,
          ]
        : []),
      {
        name: 'type',
        type: 'select',
        options: STATUSES.map(String),
        defaultValue: '301',
        required: true,
        label: { en: 'Type', th: 'ชนิด' },
        position: 'sidebar',
      },
    ]

    const clear: AfterChangeHook & AfterDeleteHook = ({ cms }) => clearRedirects(cms)
    const redirects: CollectionConfig = {
      slug,
      labels: {
        singular: { en: 'Redirect', th: 'การเปลี่ยนเส้นทาง' },
        plural: { en: 'Redirects', th: 'การเปลี่ยนเส้นทาง' },
      },
      icon: 'link',
      useAsTitle: 'from',
      editIn: 'drawer',
      admin: { group: 'settings' },
      fields: redirectFields,
      hooks: {
        beforeChange: [
          ({ data }) =>
            typeof data.from === 'string'
              ? { ...data, from: normalizePath(data.from) ?? data.from }
              : data,
        ],
        afterChange: [clear],
        afterDelete: [clear],
      },
    }

    /** Addresses of documents being updated, read before the change: `<slug>:<id>` → by locale. */
    const before = new Map<string, (string | null)[]>()
    const remember: BeforeChangeHook = async ({ data, operation, originalDoc, cms, slug: s }) => {
      if (operation === 'update' && originalDoc?.id !== undefined)
        before.set(
          `${s}:${originalDoc.id}`,
          await Promise.all(localeList.map((l) => urlOf(cms, s, originalDoc.id, l))),
        )
      return data
    }
    const redirectOld: AfterChangeHook = async ({ doc, cms, slug: s }) => {
      clearRedirects(cms)
      const key = `${s}:${doc.id}`
      const old = before.get(key)
      before.delete(key)
      if (!old) return
      const now = await Promise.all(localeList.map((l) => urlOf(cms, s, doc.id, l)))
      const done = new Set<string>()
      for (const [i, locale] of localeList.entries()) {
        const from = old[i]
        const to = now[i]
        // Only a live page whose address changed: drafts and unpublished pages keep no redirect.
        // Locales that share an address need one redirect.
        if (!from || !to || from === to || done.has(from)) continue
        done.add(from)
        await addRedirect(cms, { from, collection: s, id: doc.id, locale, current: to, doc })
      }
    }

    /** A redirect from the old address to the document; none that would loop. */
    const addRedirect = async (
      cms: EasyCMS,
      args: {
        from: string
        collection: string
        id: unknown
        locale: string | null
        current: string
        doc: Record<string, unknown>
      },
    ) => {
      // Redirects kept per scope (`uniqueWithin` of `from`, e.g. a tenant): the page's scope.
      const from = cms.config.collections
        .find((c) => c.slug === slug)
        ?.fields.find((f) => f.name === 'from')
      const scope = Object.fromEntries(
        (from?.uniqueWithin === undefined ? [] : [from.uniqueWithin].flat()).map((name) => [
          name,
          args.doc[name] ?? null,
        ]),
      )
      const inScope = Object.entries(scope).map(([name, value]) => ({ [name]: { equals: value } }))
      const where = (path: string) => ({ and: [{ from: { equals: path } }, ...inScope] })
      // A redirect away from the page's new address would send visitors in a loop.
      const loops = await cms.find(slug, { where: where(args.current), limit: 100 })
      for (const loop of loops.docs) await cms.delete(slug, loop.id)
      const data = {
        from: args.from,
        to: null,
        [targetField(args.collection)]: args.id,
        ...(locales.length > 0 ? { locale: args.locale } : {}),
        type: '301',
        ...scope,
      }
      const existing = await cms.find(slug, { where: where(args.from), limit: 1 })
      if (existing.docs[0]) await cms.update(slug, existing.docs[0].id, data)
      else await cms.create(slug, data)
    }

    const withAuto = (c: CollectionConfig): CollectionConfig => {
      if (!collections.includes(c.slug)) return c
      const hooks = { ...c.hooks }
      if (auto.includes(c.slug)) {
        hooks.beforeChange = [...(hooks.beforeChange ?? []), remember]
        hooks.afterChange = [...(hooks.afterChange ?? []), redirectOld]
      } else {
        // Redirects to its documents follow their addresses: forget the cached ones.
        hooks.afterChange = [...(hooks.afterChange ?? []), clear]
      }
      hooks.afterDelete = [...(hooks.afterDelete ?? []), clear]
      return { ...c, hooks }
    }

    const endpoint: Endpoint = {
      path: '/resolve-redirect',
      method: 'get',
      // Lets `resolveRedirect(cms)` find these options from the resolved config.
      handler: Object.assign(
        async ({ url, cms, context }: Parameters<Endpoint['handler']>[0]) => {
          const path = url.searchParams.get('path')
          if (!path)
            return Response.json({ errors: [{ message: 'path is required' }] }, { status: 400 })
          const redirect = await resolveRedirect(cms, path, { context })
          if (!redirect)
            return Response.json({ errors: [{ message: 'No redirect' }] }, { status: 404 })
          return Response.json(redirect, { headers: { 'cache-control': 'public, max-age=60' } })
        },
        { [REDIRECTS_SOURCE]: source },
      ),
    }

    return {
      ...config,
      collections: [...(config.collections ?? []).map(withAuto), redirects],
      endpoints: [...(config.endpoints ?? []), endpoint],
    }
  }, INFO)
}
