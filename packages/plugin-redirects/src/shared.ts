/** Kept on the plugin's endpoint handler, so helpers find the options in the resolved config. */
export interface RedirectsSource {
  readonly slug: string
  readonly collections: readonly string[]
  readonly url:
    | ((args: {
        collection: string
        doc: Record<string, unknown>
        locale: string | null
      }) => string | null | undefined | Promise<string | null | undefined>)
    | undefined
  readonly cacheMs: number
}

/**
 * A key in the global symbol registry, not a module-level WeakMap: Next.js bundles the plugin
 * once per server layer, and the instance may come from the other layer's copy.
 */
export const REDIRECTS_SOURCE = Symbol.for('easy-cms.plugin-redirects.source')

export const STATUSES = [301, 302, 307, 308] as const
export type RedirectStatus = (typeof STATUSES)[number]

/** The relationship field of a redirect that points to a document in `collection`. */
export const targetField = (collection: string) => `to_${collection.replace(/-/g, '_')}`
