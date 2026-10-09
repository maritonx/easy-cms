import { writeFile } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import {
  type CliCommand,
  type Config,
  definePlugin,
  type EasyCMS,
  type Endpoint,
  type Plugin,
  type ResolvedConfig,
} from '@easy-cms/core'
import { API_KEYS, checkRenamedOptions, INTERNAL_COLLECTIONS } from '@easy-cms/core/internal'
import { type GraphQLSchema, printSchema } from 'graphql'
import { DEFAULT_DOCUMENTS } from './context.js'
import { handleGraphQL } from './http.js'
import { INFO } from './info.js'
import { DEFAULT_DEPTH } from './limits.js'
import { buildGraphQLSchema, checkNames, type SchemaOptions } from './schema.js'

export interface GraphQLPluginOptions extends SchemaOptions {
  /** Path under the REST API. Default `/graphql`, so the endpoint is `/api/cms/graphql`. */
  readonly path?: string
  readonly limits?: {
    /** Most levels of fields in one query. Default 7. */
    readonly depth?: number
    /** Most documents one request loads, relationships included. Default 2000. */
    readonly documents?: number
  }
  /** Let clients read the schema (`__schema`), as codegen and GraphiQL do. Default true. */
  readonly introspection?: boolean
  /**
   * GraphiQL for browsers that open the endpoint. Default: outside production
   * (`NODE_ENV !== 'production'`).
   */
  readonly graphiql?: boolean
}

/** Slugs the schema will have, from a config before the built-in collections are added. */
function plannedSlugs(config: Config, options: GraphQLPluginOptions) {
  const collections = new Set(['users', 'media'])
  if (config.upload?.folders === true) collections.add('media-folders')
  for (const c of config.collections ?? []) collections.add(c.slug)
  const only = (list: readonly string[] | undefined) => (slug: string) =>
    list === undefined || list.includes(slug)
  return {
    collections: [...collections]
      .filter((slug) => !INTERNAL_COLLECTIONS.has(slug) && slug !== API_KEYS)
      .filter(only(options.collections)),
    globals: (config.globals ?? []).map((g) => g.slug).filter(only(options.globals)),
  }
}

/**
 * A GraphQL API at `/api/cms/graphql`: a type per collection and global, queries and mutations
 * through the Local API with the same access rules as REST (sessions, Bearer tokens and API
 * keys), batched relationship loading, and limits on depth and documents per request.
 */
export function graphqlPlugin(options: GraphQLPluginOptions = {}): Plugin {
  checkRenamedOptions('graphqlPlugin', options, {
    exclude: 'collections (and `globals`): the ones in the schema, not the ones left out',
  })
  return definePlugin((config: Config): Config => {
    // Clashing names stop the app from starting; plugins after this one are checked on first use.
    const planned = plannedSlugs(config, options)
    checkNames(planned.collections, planned.globals, options.names)

    const schemas = new WeakMap<ResolvedConfig, GraphQLSchema>()
    const schemaOf = (cms: EasyCMS) => {
      let schema = schemas.get(cms.config)
      if (!schema) {
        schema = buildGraphQLSchema(cms.config, options)
        schemas.set(cms.config, schema)
      }
      return schema
    }
    const handler: Endpoint['handler'] = (args) =>
      handleGraphQL(args, {
        schema: schemaOf(args.cms),
        depth: options.limits?.depth ?? DEFAULT_DEPTH,
        documents: options.limits?.documents ?? DEFAULT_DOCUMENTS,
        introspection: options.introspection ?? true,
        graphiql: options.graphiql ?? process.env.NODE_ENV !== 'production',
      })
    const path = options.path ?? '/graphql'

    const generate: CliCommand = {
      name: 'generate:graphql',
      description: 'Write the GraphQL schema (SDL) to a file, for codegen',
      help: `Usage: easy-cms generate:graphql [file] [options]

Writes the schema of the GraphQL API (graphqlPlugin) as SDL, for GraphQL Code Generator and
other tools. Default file: schema.graphql. Opens the database like the other commands.
`,
      run: async ({ cms, args, log }) => {
        const out = args[0] ?? 'schema.graphql'
        const file = isAbsolute(out) ? out : resolve(cms.cwd, out)
        await writeFile(file, `${printSchema(schemaOf(cms))}\n`)
        log(`Wrote ${file}`)
        return 0
      },
    }

    return {
      ...config,
      endpoints: [
        ...(config.endpoints ?? []),
        { path, method: 'get', handler },
        { path, method: 'post', handler },
      ],
      cliCommands: [...(config.cliCommands ?? []), generate],
    }
  }, INFO)
}
