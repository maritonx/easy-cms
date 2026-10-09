import type { EasyCMS } from '@easy-cms/core'

export type ID = string | number
export type Doc = Record<string, unknown>

/** One step of a page's trail, from the top-level page down to the page itself. */
export interface Breadcrumb {
  /** The page's id; `null` on the page's own step while it is being created. */
  readonly doc: ID | null
  readonly label: string
  /** The page's path, e.g. `/about/team`. */
  readonly url: string
}

/** What the plugin knows about one collection, kept for the helpers. */
export interface NestedCollection {
  readonly slug: string
  readonly parentField: string
  readonly breadcrumbsField: string
  readonly pathField: string
  readonly slugField: string
  readonly titleField: string
  /** The trail and path have one value per locale (the slug is localized). */
  readonly localized: boolean
  readonly drafts: boolean
  readonly maxDepth: number
  readonly onDeleteParent: 'restrict' | 'orphan'
  readonly sort: string
}

export interface NestedSource {
  readonly collections: ReadonlyMap<string, NestedCollection>
  readonly locales: readonly string[]
  readonly defaultLocale: string | null
}

/**
 * A key in the global symbol registry, not a module-level WeakMap: Next.js bundles the plugin
 * once per server layer, and the instance may come from the other layer's copy.
 */
export const NESTED_SOURCE = Symbol.for('easy-cms.plugin-nested-docs.source')

/**
 * What the helpers use of `EasyCMS`: an instance typed with your config fits (its methods take
 * your collection slugs, not any string).
 */
export interface NestedCMS {
  readonly config: { readonly endpoints: readonly { readonly handler: unknown }[] }
  find(collection: string, options?: Record<string, unknown>): Promise<unknown>
}

/** The helpers' argument as the Local API it is. */
export const localApi = (cms: NestedCMS) => cms as unknown as EasyCMS

/** The plugin's settings for `collection`, from the resolved config. */
export function nestedOf(
  cms: NestedCMS,
  collection: string,
): { source: NestedSource; nested: NestedCollection } {
  for (const endpoint of cms.config.endpoints) {
    const source = (endpoint.handler as unknown as Record<symbol, NestedSource | undefined>)[
      NESTED_SOURCE
    ]
    const nested = source?.collections.get(collection)
    if (source && nested) return { source, nested }
  }
  throw new Error(
    `nestedDocsPlugin: "${collection}" is not nested; add it to nestedDocsPlugin({ collections })`,
  )
}

/** An id from a relationship value (`3`, `'a1'` or `{ id: 3 }`). */
export function idOf(value: unknown): ID | null {
  if (value && typeof value === 'object' && 'id' in value) return idOf((value as Doc).id)
  return typeof value === 'number' || (typeof value === 'string' && value !== '') ? value : null
}

/** `/about/team` from what a visitor's URL or an editor typed: one leading slash, none at the end. */
export function normalizePath(path: string): string {
  const parts = path
    .split(/[?#]/)[0]
    ?.split('/')
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part)
      } catch {
        return part
      }
    })
  return `/${(parts ?? []).join('/')}`
}

/**
 * What a page's slug is unique within besides its parent (e.g. its tenant, from
 * `uniqueWithin`): paths only need to differ among pages that share these.
 */
export function pathScopeFields(cms: EasyCMS, nested: NestedCollection): string[] {
  const slug = cms.config.collections
    .find((c) => c.slug === nested.slug)
    ?.fields.find((f) => f.name === nested.slugField)
  const within = slug?.uniqueWithin === undefined ? [] : [slug.uniqueWithin].flat()
  return within.filter((name) => name !== nested.parentField)
}
