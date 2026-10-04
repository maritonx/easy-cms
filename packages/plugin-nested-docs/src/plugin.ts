import {
  type AfterChangeHook,
  type AfterDeleteHook,
  type BeforeChangeHook,
  type BeforeDeleteHook,
  type BeforeValidateHook,
  type CliCommand,
  type CollectionConfig,
  type Config,
  definePlugin,
  type Endpoint,
  type Field,
  type FilterOptions,
  NotFoundError,
  type TypedPlugin,
  ValidationError,
} from '@easy-cms/core'
import { getTree, rebuildNestedDocs } from './helpers.js'
import { INFO } from './info.js'
import { type ID, idOf, NESTED_SOURCE, type NestedCollection, type NestedSource } from './shared.js'
import { descendants, liveChildren, syncChildren, trailData, trailOf } from './tree.js'

export interface NestedDocsPluginOptions {
  /** Collections whose documents can have a parent in the same collection, e.g. `['pages']`. */
  readonly collections: readonly string[]
  /** The slug field each page adds to its parent's path. Default `slug`. */
  readonly slugField?: string
  /** The field shown in breadcrumbs. Default the collection's `useAsTitle`, else the slug. */
  readonly titleField?: string
  /** Names of the fields the plugin adds. Default `parent`, `breadcrumbs` and `path`. */
  readonly fields?: {
    readonly parent?: string
    readonly breadcrumbs?: string
    readonly path?: string
  }
  /** Levels of pages, top level included. Default 10. */
  readonly maxDepth?: number
  /**
   * Deleting a page that has pages under it: `restrict` refuses (move or delete them first),
   * `orphan` moves them to the top level (their addresses change). Default `restrict`.
   */
  readonly onDeleteParent?: 'restrict' | 'orphan'
}

const ADMIN_MODULE = '@easy-cms/plugin-nested-docs/admin'

/**
 * Pages inside pages: a parent for each document, its breadcrumbs and its full path
 * (`/about/team`), kept up to date when a page above it moves or changes its slug, and a tree
 * in the admin's list.
 */
/** The fields the plugin adds to collection `S`, as the inferred document types see them. */
export type NestedDocsFields<
  S extends string,
  P extends string = 'parent',
  B extends string = 'breadcrumbs',
  T extends string = 'path',
> = readonly [
  { readonly name: P; readonly type: 'relationship'; readonly to: S },
  { readonly name: T; readonly type: 'text' },
  {
    readonly name: B
    readonly type: 'array'
    readonly fields: readonly [
      { readonly name: 'doc'; readonly type: 'relationship'; readonly to: S },
      { readonly name: 'label'; readonly type: 'text' },
      { readonly name: 'url'; readonly type: 'text' },
    ]
  },
]

/** What `nestedDocsPlugin(options)` adds: its fields on each of its collections. */
export type NestedDocsPluginTypes<
  S extends string,
  P extends string = 'parent',
  B extends string = 'breadcrumbs',
  T extends string = 'path',
> = { readonly fields: { readonly [K in S]: NestedDocsFields<K, P, B, T> } }

export function nestedDocsPlugin<
  const S extends string,
  const P extends string = 'parent',
  const B extends string = 'breadcrumbs',
  const T extends string = 'path',
>(
  options: NestedDocsPluginOptions & {
    readonly collections: readonly S[]
    readonly fields?: { readonly parent?: P; readonly breadcrumbs?: B; readonly path?: T }
  },
): TypedPlugin<NestedDocsPluginTypes<S, P, B, T>> {
  return definePlugin<NestedDocsPluginTypes<S, P, B, T>>((config: Config): Config => {
    const slugs = options.collections ?? []
    if (!Array.isArray(slugs) || slugs.length === 0)
      throw new Error("nestedDocsPlugin: list the collections, e.g. { collections: ['pages'] }")
    const missing = slugs.filter((s) => !config.collections?.some((c) => c.slug === s))
    if (missing.length > 0)
      throw new Error(
        `nestedDocsPlugin: unknown collection ${missing.map((s) => `"${s}"`).join(', ')}`,
      )
    const maxDepth = options.maxDepth ?? 10
    if (!Number.isInteger(maxDepth) || maxDepth < 1)
      throw new Error('nestedDocsPlugin: maxDepth must be a whole number of at least 1')
    const onDeleteParent = options.onDeleteParent ?? 'restrict'
    if (onDeleteParent !== 'restrict' && onDeleteParent !== 'orphan')
      throw new Error("nestedDocsPlugin: onDeleteParent must be 'restrict' or 'orphan'")

    const localization = config.localization
    const source: NestedSource & { collections: Map<string, NestedCollection> } = {
      collections: new Map(),
      locales: localization?.locales ?? [],
      defaultLocale: localization?.defaultLocale ?? null,
    }

    const withNesting = (collection: CollectionConfig): CollectionConfig => {
      if (!slugs.includes(collection.slug)) return collection
      const where = `nestedDocsPlugin: "${collection.slug}"`
      const slugField = options.slugField ?? 'slug'
      const slug = collection.fields.find((f) => f.name === slugField)
      if (!slug || (slug.type !== 'slug' && slug.type !== 'text'))
        throw new Error(`${where} needs a slug field "${slugField}" (or set \`slugField\`)`)
      const titleField = options.titleField ?? collection.useAsTitle ?? slugField
      if (!collection.fields.some((f) => f.name === titleField))
        throw new Error(`${where} has no field "${titleField}" for breadcrumbs`)
      const names = {
        parent: options.fields?.parent ?? 'parent',
        breadcrumbs: options.fields?.breadcrumbs ?? 'breadcrumbs',
        path: options.fields?.path ?? 'path',
      }
      // A parent field the collection already has is kept, e.g. when adding the plugin later.
      const ownParent = collection.fields.find((f) => f.name === names.parent)
      if (
        ownParent &&
        !(
          ownParent.type === 'relationship' &&
          ownParent.to === collection.slug &&
          !ownParent.hasMany
        )
      )
        throw new Error(
          `${where} has a field "${names.parent}" that is not a relationship to "${collection.slug}"; set \`fields\``,
        )
      for (const name of [names.breadcrumbs, names.path])
        if (collection.fields.some((f) => f.name === name))
          throw new Error(`${where} already has a field "${name}"; set \`fields\``)
      const localized = !!localization && slug.localized === true
      const nested: NestedCollection = {
        slug: collection.slug,
        parentField: names.parent,
        breadcrumbsField: names.breadcrumbs,
        pathField: names.path,
        slugField,
        titleField,
        localized,
        drafts: collection.drafts === true,
        maxDepth,
        onDeleteParent,
        sort: collection.admin?.list?.sort ?? titleField,
      }
      source.collections.set(collection.slug, nested)

      // Not the page itself, nor a page under it: that would make a loop.
      const notBelowItself: FilterOptions = async ({ id, cms }) =>
        id === undefined ? true : { id: { not_in: [id, ...(await descendants(cms, nested, id))] } }
      const readOnly = { update: () => false }
      const parentField: Field = {
        label: { en: 'Parent page', th: 'หน้าแม่' },
        position: 'sidebar',
        ...ownParent,
        name: names.parent,
        type: 'relationship',
        to: collection.slug,
        filterOptions: notBelowItself,
      }
      const added: Field[] = [
        ...(ownParent ? [] : [parentField]),
        {
          name: names.path,
          type: 'text',
          label: { en: 'Path', th: 'เส้นทาง (path)' },
          index: true,
          localized,
          position: 'sidebar',
          access: readOnly,
        },
        {
          name: names.breadcrumbs,
          type: 'array',
          label: { en: 'Breadcrumbs', th: 'เส้นทางนำทาง' },
          localized,
          position: 'sidebar',
          access: readOnly,
          admin: {
            component: {
              tag: 'ecms-nested-breadcrumbs',
              props: {
                adminPath: `/${(config.admin?.path ?? '/admin').replace(/^\/+|\/+$/g, '')}`,
                parentField: names.parent,
              },
            },
          },
          fields: [
            { name: 'doc', type: 'relationship', to: collection.slug },
            { name: 'label', type: 'text' },
            { name: 'url', type: 'text' },
          ],
        },
      ]

      // The stored trail is replaced before saving: it must not fail checks first (e.g. a
      // breadcrumb of a page that was deleted).
      const clearTrail: BeforeValidateHook = ({ data }) => ({
        ...data,
        [names.breadcrumbs]: localized
          ? Object.fromEntries(source.locales.map((l) => [l, []]))
          : [],
      })
      const computeTrail: BeforeChangeHook = async ({ data, originalDoc, cms }) => {
        const selfId = idOf(originalDoc?.id)
        const parentId = idOf(data[names.parent])
        // Saving checks `filterOptions` too; this also catches a loop made by two saves at once.
        if (
          parentId !== null &&
          selfId !== null &&
          parentId !== idOf(originalDoc?.[names.parent]) &&
          (String(parentId) === String(selfId) ||
            (await descendants(cms, nested, selfId)).some((d) => String(d) === String(parentId)))
        ) {
          throw new ValidationError(collection.slug, [
            { field: names.parent, message: 'cannot be this page or a page under it' },
          ])
        }
        const trail = await trailOf(cms, source, nested, data, selfId)
        const depth = Math.max(...[...trail.breadcrumbs.values()].map((rows) => rows.length))
        if (depth > maxDepth) {
          throw new ValidationError(collection.slug, [
            { field: names.parent, message: `is too deep: pages go at most ${maxDepth} levels` },
          ])
        }
        for (const [locale, path] of trail.path) {
          if (!path) continue
          const taken = await cms.find(collection.slug, {
            where: {
              and: [
                { [names.path]: { equals: path } },
                ...(selfId === null ? [] : [{ id: { not_equals: selfId } }]),
              ],
            },
            limit: 1,
            depth: 0,
            draft: true,
            ...(locale ? { locale } : {}),
          })
          if (taken.totalDocs > 0) {
            throw new ValidationError(collection.slug, [
              { field: slugField, message: `another page already has the path ${path}` },
            ])
          }
        }
        return { ...data, ...trailData(nested, trail) }
      }

      const updateChildren: AfterChangeHook = async ({ doc, operation, cms }) => {
        const id = idOf(doc.id)
        if (id === null) return
        // A new page's own breadcrumb gets its id now that it has one.
        if (operation === 'create') {
          await cms.update(collection.slug, id, {}, { live: true })
          return
        }
        await syncChildren(cms, source, nested, id)
      }

      const guardChildren: BeforeDeleteHook = async ({ id, cms }) => {
        if (onDeleteParent !== 'restrict') return
        const children = await liveChildren(cms, source, nested, id)
        if (children.length > 0) {
          throw new ValidationError(collection.slug, [
            {
              field: names.parent,
              message: `this page has ${children.length} page${children.length === 1 ? '' : 's'} under it: move or delete ${children.length === 1 ? 'it' : 'them'} first`,
            },
          ])
        }
      }
      const orphanChildren: AfterDeleteHook = async ({ id, cms }) => {
        if (onDeleteParent !== 'orphan') return
        for (const child of await liveChildren(cms, source, nested, id))
          await cms.update(
            collection.slug,
            child.id as ID,
            { [names.parent]: null },
            { live: true },
          )
      }

      // Slugs only need to differ among pages with the same parent.
      const fields = collection.fields.map((f) =>
        f === slug && f.type === 'slug' && f.uniqueWithin === undefined
          ? { ...f, uniqueWithin: names.parent }
          : f === ownParent
            ? parentField
            : f,
      )
      const hooks = { ...collection.hooks }
      hooks.beforeValidate = [...(hooks.beforeValidate ?? []), clearTrail]
      hooks.beforeChange = [...(hooks.beforeChange ?? []), computeTrail]
      hooks.afterChange = [...(hooks.afterChange ?? []), updateChildren]
      hooks.beforeDelete = [...(hooks.beforeDelete ?? []), guardChildren]
      hooks.afterDelete = [...(hooks.afterDelete ?? []), orphanChildren]
      return {
        ...collection,
        fields: [...fields, ...added],
        hooks,
        admin: {
          ...collection.admin,
          list: { ...collection.admin?.list, tree: collection.admin?.list?.tree ?? names.parent },
        },
      }
    }

    const collections = (config.collections ?? []).map(withNesting)

    const tree: Endpoint = {
      path: '/tree/:collection',
      method: 'get',
      // Lets the helpers find these options from the resolved config.
      handler: Object.assign(
        async ({ params, url, user, cms }: Parameters<Endpoint['handler']>[0]) => {
          const collection = params.collection as string
          if (!source.collections.has(collection)) throw new NotFoundError('tree', collection)
          const locale = url.searchParams.get('locale')
          const depth = Number(url.searchParams.get('depth'))
          const nodes = await getTree(cms, collection, {
            ...(locale ? { locale } : {}),
            ...(Number.isInteger(depth) && depth > 0 ? { depth } : {}),
            user,
            overrideAccess: false,
          })
          return Response.json(nodes, { headers: { 'cache-control': 'public, max-age=60' } })
        },
        { [NESTED_SOURCE]: source },
      ),
    }

    const rebuild: CliCommand = {
      name: 'nested:rebuild',
      description: 'Work out the breadcrumbs and paths of nested pages again',
      help: `Usage: easy-cms nested:rebuild [collection…] [options]

Works out every page's breadcrumbs and path again, top-level pages first, and saves the pages
whose values changed: after adding the plugin to a collection that has pages, or to repair
pages after an error. Default: every collection of nestedDocsPlugin (${slugs.join(', ')}).
`,
      run: async ({ cms, args, log }) => {
        const unknown = args.filter((a) => !slugs.includes(a))
        if (unknown.length > 0) {
          log(`Not nested: ${unknown.join(', ')} (nested: ${slugs.join(', ')})`)
          return 1
        }
        for (const collection of args.length > 0 ? args : slugs) {
          const result = await rebuildNestedDocs(cms, collection)
          log(`${collection}: checked ${result.checked}, updated ${result.updated}`)
        }
        return 0
      },
    }

    return {
      ...config,
      collections,
      endpoints: [...(config.endpoints ?? []), tree],
      commands: [...(config.commands ?? []), rebuild],
      admin: {
        ...config.admin,
        modules: [...new Set([...(config.admin?.modules ?? []), ADMIN_MODULE])],
      },
    }
  }, INFO)
}
