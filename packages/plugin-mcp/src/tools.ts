import {
  type AuthUser,
  type CollectionConfig,
  type EasyCMS,
  type GlobalConfig,
  type ID,
  type RequestContext,
  type Where,
} from '@easy-cms/core'
import { INTERNAL_COLLECTIONS, keyAllows } from '@easy-cms/core/internal'
import { type JsonSchema, objectSchema, prepareInput } from './schema.js'

type Data = Record<string, unknown>
type Operation = 'read' | 'create' | 'update' | 'delete' | 'publish'

export interface Tool {
  readonly name: string
  readonly description: string
  readonly inputSchema: JsonSchema
  run(args: Data): Promise<unknown>
}

export interface ToolOptions {
  /** Collections to offer (default: all the key may use). */
  readonly collections?: readonly string[]
  /** Globals to offer (default: all the key may use). */
  readonly globals?: readonly string[]
}

/** Collections an assistant never gets, whatever a key says. */
const NEVER = new Set(['users', 'api-keys'])
const MAX_LIMIT = 100

const id = { type: ['integer', 'string'], description: 'Document id' }
const localeProp = (cms: EasyCMS): JsonSchema =>
  cms.config.localization
    ? {
        locale: {
          type: 'string',
          enum: [...cms.config.localization.locales, 'all'],
          description: `Content language (default ${cms.config.localization.defaultLocale}); "all" returns every language`,
        },
      }
    : {}

const obj = (properties: JsonSchema, required: string[] = []): JsonSchema => ({
  type: 'object',
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
})

/**
 * The tools a user (normally an API key) may use: one per collection or global and operation,
 * only where the key allows it. Access rules are applied again on every call.
 */
export function buildTools(
  cms: EasyCMS,
  user: AuthUser,
  options: ToolOptions = {},
  context: RequestContext = {},
): Tool[] {
  const access = { user, context, overrideAccess: false } as const
  const may = (target: { collection: string } | { global: string }, op: Operation) =>
    keyAllows(user, target, op)
  const tools: Tool[] = []
  const locale = localeProp(cms)
  const pickLocale = (args: Data) =>
    typeof args.locale === 'string' ? { locale: args.locale } : {}

  const collections = cms.config.collections.filter(
    (c) =>
      !NEVER.has(c.slug) &&
      !INTERNAL_COLLECTIONS.has(c.slug) &&
      (!options.collections || options.collections.includes(c.slug)),
  )

  for (const c of collections) {
    const slug = c.slug
    const target = { collection: slug }
    const name = label(slug, c.labels?.plural)
    const drafts = c.drafts === true

    if (may(target, 'read')) {
      tools.push({
        name: `find_${slug}`,
        description: `List ${name}. Filter with where, e.g. { "title": { "like": "news" } } (operators: equals, not_equals, in, not_in, gt, gte, lt, lte, like, exists; combine with and/or).${drafts ? ' Includes drafts.' : ''}`,
        inputSchema: obj({
          where: { type: 'object', description: 'Filter' },
          sort: {
            type: 'string',
            description: 'Field to sort by; prefix with - for descending, e.g. -createdAt',
          },
          limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT, description: 'Default 10' },
          page: { type: 'integer', minimum: 1 },
          ...locale,
        }),
        run: async (args) =>
          cms.find(slug, {
            ...access,
            draft: true,
            depth: 0,
            ...(args.where ? { where: args.where as Where } : {}),
            ...(typeof args.sort === 'string' ? { sort: args.sort } : {}),
            limit: Math.min(MAX_LIMIT, Math.max(1, Number(args.limit ?? 10))),
            page: Math.max(1, Number(args.page ?? 1)),
            ...pickLocale(args),
          }),
      })
      tools.push({
        name: `get_${slug}`,
        description: `Read one ${name} document by id, with its relationships.`,
        inputSchema: obj({ id, ...locale }, ['id']),
        run: async (args) => {
          const doc = await cms.findById(slug, args.id as ID, {
            ...access,
            draft: true,
            depth: 1,
            ...pickLocale(args),
          })
          if (!doc) throw new Error(`No ${slug} document with id ${String(args.id)}`)
          return doc
        },
      })
    }

    if (slug !== 'media' && may(target, 'create')) {
      tools.push({
        name: `create_${slug}`,
        description: `Create a ${name} document.${drafts ? ` It is saved as a draft; call publish_${slug} to put it live.` : ''}`,
        inputSchema: obj({ data: objectSchema(c.fields, !drafts), ...locale }, ['data']),
        run: async (args) =>
          cms.create(slug, asDraft(c, prepareInput(c.fields, (args.data ?? {}) as Data)), {
            ...access,
            depth: 0,
            ...pickLocale(args),
          }),
      })
    }

    if (may(target, 'update')) {
      tools.push({
        name: `update_${slug}`,
        description: `Change fields of a ${name} document; fields left out stay as they are.${drafts ? ` Changes are saved as a draft; call publish_${slug} to put them live.` : ''}`,
        inputSchema: obj({ id, data: objectSchema(c.fields, false), ...locale }, ['id', 'data']),
        run: async (args) =>
          cms.update(
            slug,
            args.id as ID,
            asDraft(c, prepareInput(c.fields, (args.data ?? {}) as Data)),
            { ...access, depth: 0, ...pickLocale(args) },
          ),
      })
    }

    if (may(target, 'delete')) {
      tools.push({
        name: `delete_${slug}`,
        description: `Delete a ${name} document. This cannot be undone.`,
        inputSchema: obj({ id }, ['id']),
        run: async (args) => cms.delete(slug, args.id as ID, access),
      })
    }

    if (drafts && may(target, 'publish')) {
      tools.push({
        name: `publish_${slug}`,
        description: `Publish a ${name} document (with its latest draft), so the site shows it.`,
        inputSchema: obj({ id }, ['id']),
        run: async (args) =>
          cms.update(slug, args.id as ID, { status: 'published' }, { ...access, depth: 0 }),
      })
      tools.push({
        name: `unpublish_${slug}`,
        description: `Take a ${name} document off the site.`,
        inputSchema: obj({ id }, ['id']),
        run: async (args) => cms.unpublish(slug, args.id as ID, { ...access, depth: 0 }),
      })
      if (c.schedule) {
        tools.push({
          name: `schedule_${slug}`,
          description: `Publish or unpublish a ${name} document at a later time.`,
          inputSchema: obj(
            {
              id,
              action: { type: 'string', enum: ['publish', 'unpublish'] },
              at: { type: 'string', format: 'date-time', description: 'ISO 8601 time' },
            },
            ['id', 'action', 'at'],
          ),
          run: async (args) =>
            cms.schedule(
              slug,
              args.id as ID,
              { action: args.action as 'publish' | 'unpublish', at: String(args.at) },
              access,
            ),
        })
      }
    }
  }

  // Uploads: the file as base64 (URLs are not fetched, so the server never calls addresses it is given).
  if (
    cms.config.collections.some((c) => c.slug === 'media') &&
    (!options.collections || options.collections.includes('media')) &&
    may({ collection: 'media' }, 'create')
  ) {
    tools.push({
      name: 'upload_media',
      description: `Upload a file to the media library (at most ${cms.config.upload.maxFileSize} bytes). Returns the media document; use its id in upload fields.`,
      inputSchema: obj(
        {
          filename: { type: 'string', description: 'e.g. cover.jpg' },
          data: { type: 'string', description: 'The file, base64-encoded' },
          alt: { type: 'string', description: 'Alternative text for images' },
        },
        ['filename', 'data'],
      ),
      run: async (args) => {
        const bytes = Buffer.from(String(args.data), 'base64')
        return cms.upload(
          { data: new Uint8Array(bytes), name: String(args.filename) },
          typeof args.alt === 'string' ? { alt: args.alt } : {},
          { ...access, depth: 0 },
        )
      },
    })
  }

  for (const g of cms.config.globals) {
    if (options.globals && !options.globals.includes(g.slug)) continue
    const slug = g.slug
    const target = { global: slug }
    const name = label(slug, g.label)
    const drafts = g.drafts === true
    if (may(target, 'read')) {
      tools.push({
        name: `get_global_${slug}`,
        description: `Read the ${name} settings.`,
        inputSchema: obj({ ...locale }),
        run: async (args) =>
          cms.findGlobal(slug, { ...access, draft: true, depth: 1, ...pickLocale(args) }),
      })
    }
    if (may(target, 'update')) {
      tools.push({
        name: `update_global_${slug}`,
        description: `Change the ${name} settings; fields left out stay as they are.${drafts ? ` Saved as a draft; call publish_global_${slug} to put it live.` : ''}`,
        inputSchema: obj({ data: objectSchema(g.fields, false), ...locale }, ['data']),
        run: async (args) =>
          cms.updateGlobal(slug, asDraft(g, prepareInput(g.fields, (args.data ?? {}) as Data)), {
            ...access,
            depth: 0,
            ...pickLocale(args),
          }),
      })
    }
    if (drafts && may(target, 'publish')) {
      tools.push({
        name: `publish_global_${slug}`,
        description: `Publish the ${name} settings.`,
        inputSchema: obj({}),
        run: async () => cms.updateGlobal(slug, { status: 'published' }, { ...access, depth: 0 }),
      })
    }
  }
  return tools
}

/** Collections with drafts are always saved as drafts; publishing is its own tool. */
function asDraft(container: CollectionConfig | GlobalConfig, data: Data): Data {
  if (!container.drafts) return data
  const { status: _status, ...rest } = data
  return { ...rest, status: 'draft' }
}

/** How tools name a collection or global, e.g. `Posts (posts)`. */
function label(slug: string, value: unknown): string {
  const text = typeof value === 'string' ? value : (value as { en?: string } | undefined)?.en
  return text ? `${text} (${slug})` : `"${slug}"`
}
