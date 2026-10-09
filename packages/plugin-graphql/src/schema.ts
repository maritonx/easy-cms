import type {
  Block,
  CollectionConfig,
  Field,
  GlobalConfig,
  Label,
  ResolvedConfig,
  Where,
} from '@easy-cms/core'
import { API_KEYS, INTERNAL_COLLECTIONS, MEDIA, MEDIA_FOLDERS } from '@easy-cms/core/internal'
import {
  type GraphQLArgumentConfig,
  GraphQLBoolean,
  GraphQLEnumType,
  GraphQLError,
  type GraphQLFieldConfig,
  type GraphQLFieldConfigMap,
  GraphQLFloat,
  GraphQLID,
  type GraphQLInputFieldConfigMap,
  GraphQLInputObjectType,
  type GraphQLInputType,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  type GraphQLOutputType,
  GraphQLSchema,
  GraphQLString,
  type GraphQLType,
  GraphQLUnionType,
} from 'graphql'
import { type GraphQLContext, type ReadArgs, readOf, tag, toId } from './context.js'
import {
  type CollectionNames,
  collectionNames,
  type GlobalNames,
  globalNames,
  isValidName,
  type NameOverrides,
  pascal,
} from './names.js'
import { DateTimeScalar, JSONScalar } from './scalars.js'

type Data = Record<string, unknown>
// biome-ignore lint/suspicious/noExplicitAny: resolvers of any shape
type FieldConfig = GraphQLFieldConfig<any, GraphQLContext, any>

/** What `extend` adds to the schema, with graphql-js objects. */
export interface GraphQLExtension {
  /** More root queries, e.g. a search across collections. */
  readonly query?: Readonly<Record<string, FieldConfig>>
  /** More root mutations. */
  readonly mutation?: Readonly<Record<string, FieldConfig>>
  /** More fields on the generated types, by type name, e.g. `{ Post: { readingTime: … } }`. */
  readonly fields?: Readonly<Record<string, Readonly<Record<string, FieldConfig>>>>
}

export interface ExtendArgs {
  readonly config: ResolvedConfig
  /** The generated object types by name (`Post`, `Media`, `Settings`…), to return from resolvers. */
  readonly types: Readonly<Record<string, GraphQLObjectType>>
  /** One of `types`; throws when there is no such type. */
  type(name: string): GraphQLObjectType
  readonly scalars: { readonly JSON: typeof JSONScalar; readonly DateTime: typeof DateTimeScalar }
}

export interface SchemaOptions {
  /**
   * Names you choose, by collection or global slug, e.g. `{ news: { one: 'newsItem' } }`.
   * Default: from the slug, `categories` → type `Category`, queries `category` and `categories`.
   */
  readonly names?: NameOverrides
  /** Collections in the schema, by slug. Default: all (but internal ones and API keys). */
  readonly collections?: readonly string[]
  /** Globals in the schema, by slug. Default: all. */
  readonly globals?: readonly string[]
  /** Your own queries, mutations and fields. */
  readonly extend?: (args: ExtendArgs) => GraphQLExtension
}

/** The most documents one list returns, as in REST. */
export const MAX_LIMIT = 100

/** Type names the schema always has. */
const RESERVED = new Set([
  'Query',
  'Mutation',
  'Subscription',
  'String',
  'Int',
  'Float',
  'Boolean',
  'ID',
  'JSON',
  'DateTime',
  'Locale',
  'DocumentStatus',
  'DocumentStatusFilter',
  'StringFilter',
  'FloatFilter',
  'BooleanFilter',
  'DateTimeFilter',
  'IDFilter',
  'MediaSize',
  'MediaSizes',
])

/** File metadata is set by uploads, not written through the API. */
const MEDIA_SYSTEM_FIELDS = new Set([
  'filename',
  'originalName',
  'mimeType',
  'filesize',
  'width',
  'height',
  'sizes',
  'private',
])

const english = (label: Label | undefined): string | undefined =>
  typeof label === 'string' ? label : (label?.en ?? Object.values(label ?? {})[0])

const describe = (label: Label | undefined) => {
  const text = english(label)
  return text ? { description: text } : {}
}

/** `[T!]`, for output and input types alike. */
// biome-ignore lint/suspicious/noExplicitAny: graphql-js types lists of outputs and inputs apart
const list = (type: GraphQLType): GraphQLList<GraphQLNonNull<any>> =>
  // biome-ignore lint/suspicious/noExplicitAny: as above
  new GraphQLList(new GraphQLNonNull(type as any))

const hasMany = (field: Field) => 'hasMany' in field && field.hasMany === true

const userError = (message: string) =>
  new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT' } })

/** The collections the schema has: not internal ones, not API keys, only the ones listed. */
export function exposedCollections(
  config: Pick<ResolvedConfig, 'collections'>,
  only?: readonly string[],
): CollectionConfig[] {
  return config.collections.filter(
    (c) =>
      !INTERNAL_COLLECTIONS.has(c.slug) &&
      c.slug !== API_KEYS &&
      (only === undefined || only.includes(c.slug)),
  )
}

/**
 * Checks the names of collections and globals: valid, and none used twice. Throws one error
 * listing every problem, with how to choose other names.
 */
export function checkNames(
  collections: readonly string[],
  globals: readonly string[],
  overrides: NameOverrides = {},
): { collections: Map<string, CollectionNames>; globals: Map<string, GlobalNames> } {
  const problems: string[] = []
  const types = new Map<string, string>()
  const queries = new Map<string, string>([['me', 'the current user']])
  const mutations = new Map<string, string>()
  const claim = (map: Map<string, string>, kind: string, name: string, owner: string) => {
    if (!isValidName(name)) {
      problems.push(`${owner}: "${name}" is not a valid GraphQL name`)
      return
    }
    if (kind === 'type' && RESERVED.has(name)) {
      problems.push(`${owner}: the type name "${name}" is taken by the schema`)
      return
    }
    const other = map.get(name)
    if (other) problems.push(`${owner}: the ${kind} name "${name}" is also used by ${other}`)
    else map.set(name, owner)
  }
  const byCollection = new Map<string, CollectionNames>()
  for (const slug of collections) {
    const names = collectionNames(slug, overrides)
    const owner = `collection "${slug}"`
    byCollection.set(slug, names)
    claim(types, 'type', names.type, owner)
    claim(queries, 'query', names.one, owner)
    claim(queries, 'query', names.many, owner)
    for (const verb of ['create', 'update', 'delete'])
      claim(mutations, 'mutation', `${verb}${names.type}`, owner)
  }
  const byGlobal = new Map<string, GlobalNames>()
  for (const slug of globals) {
    const names = globalNames(slug, overrides)
    const owner = `global "${slug}"`
    byGlobal.set(slug, names)
    claim(types, 'type', names.type, owner)
    claim(queries, 'query', names.one, owner)
    claim(mutations, 'mutation', `update${names.type}`, owner)
  }
  if (problems.length > 0) {
    const example = collections[0] ?? globals[0] ?? 'news'
    throw new Error(
      `graphqlPlugin: names in the schema clash:\n${problems.map((p) => `  • ${p}`).join('\n')}\n    → Choose other names, e.g. graphqlPlugin({ names: { '${example}': { type: 'NewsItem', one: 'newsItem', many: 'news' } } })`,
    )
  }
  return { collections: byCollection, globals: byGlobal }
}

/** Plain text for rich text becomes a Tiptap document: paragraphs split on blank lines. */
export function textToDoc(text: string) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
  return {
    type: 'doc',
    content: paragraphs.map((paragraph) => ({
      type: 'paragraph',
      content: paragraph
        .split('\n')
        .flatMap((line, i) => [
          ...(i > 0 ? [{ type: 'hardBreak' }] : []),
          ...(line ? [{ type: 'text', text: line }] : []),
        ]),
    })),
  }
}

const idOf = (value: unknown): unknown =>
  value && typeof value === 'object' ? (value as { id?: unknown }).id : value

/**
 * The GraphQL schema of a config: a type per collection and global, queries to read them and
 * mutations to change them through the Local API, with the reader's access rules. Resolvers
 * expect a `GraphQLContext` (`createContext`).
 */
export function buildGraphQLSchema(
  config: ResolvedConfig,
  options: SchemaOptions = {},
): GraphQLSchema {
  return new Builder(config, options).schema()
}

class Builder {
  private readonly collections: CollectionConfig[]
  private readonly globals: GlobalConfig[]
  private readonly names: ReturnType<typeof checkNames>
  private readonly taken = new Set(RESERVED)
  private readonly objects = new Map<string, GraphQLObjectType>()
  private readonly extra = new Map<string, Record<string, FieldConfig>>()
  private readonly blockTypes = new Map<Block, GraphQLObjectType>()
  private readonly locale: GraphQLEnumType | undefined
  private readonly status = new GraphQLEnumType({
    name: 'DocumentStatus',
    values: { draft: { value: 'draft' }, published: { value: 'published' } },
  })
  private readonly filters: {
    String: GraphQLInputObjectType
    Float: GraphQLInputObjectType
    Boolean: GraphQLInputObjectType
    DateTime: GraphQLInputObjectType
    ID: GraphQLInputObjectType
    status: GraphQLInputObjectType
  }

  constructor(
    private readonly config: ResolvedConfig,
    private readonly options: SchemaOptions,
  ) {
    this.collections = exposedCollections(config, options.collections)
    const globals = options.globals
    this.globals = config.globals.filter((g) => globals === undefined || globals.includes(g.slug))
    this.names = checkNames(
      this.collections.map((c) => c.slug),
      this.globals.map((g) => g.slug),
      options.names,
    )
    for (const names of [...this.names.collections.values(), ...this.names.globals.values()])
      this.taken.add(names.type)
    const locales = config.localization?.locales ?? []
    this.locale = locales.length
      ? new GraphQLEnumType({
          name: 'Locale',
          values: Object.fromEntries(
            locales.map((l) => [
              l.replace(/[^_0-9A-Za-z]/g, '_').replace(/^(\d)/, '_$1'),
              { value: l },
            ]),
          ),
        })
      : undefined
    const filter = (name: string, type: GraphQLInputType, ordered: boolean) =>
      new GraphQLInputObjectType({
        name,
        fields: {
          equals: { type },
          not_equals: { type },
          ...(type === GraphQLBoolean
            ? {}
            : { in: { type: list(type) }, not_in: { type: list(type) } }),
          ...(ordered ? { gt: { type }, gte: { type }, lt: { type }, lte: { type } } : {}),
          ...(type === GraphQLString ? { like: { type: GraphQLString } } : {}),
          exists: { type: GraphQLBoolean },
        },
      })
    this.filters = {
      String: filter('StringFilter', GraphQLString, false),
      Float: filter('FloatFilter', GraphQLFloat, true),
      Boolean: filter('BooleanFilter', GraphQLBoolean, false),
      DateTime: filter('DateTimeFilter', DateTimeScalar, true),
      ID: filter('IDFilter', GraphQLID, false),
      status: filter('DocumentStatusFilter', this.status, false),
    }
  }

  /** A type name of its own: `PostSeo`, else `PostSeo2`… */
  private claim(name: string): string {
    let unique = name
    for (let n = 2; this.taken.has(unique); n++) unique = `${name}${n}`
    this.taken.add(unique)
    return unique
  }

  private exposed(slug: string) {
    return this.names.collections.has(slug)
  }

  schema(): GraphQLSchema {
    for (const c of this.collections) {
      const { type } = this.names.collections.get(c.slug) as CollectionNames
      this.objects.set(c.slug, this.collectionType(c, type))
    }
    const globalTypes = new Map<string, GraphQLObjectType>()
    for (const g of this.globals) {
      const { type } = this.names.globals.get(g.slug) as GlobalNames
      globalTypes.set(g.slug, this.globalType(g, type))
    }

    const query: Record<string, FieldConfig> = {}
    const mutation: Record<string, FieldConfig> = {}
    for (const c of this.collections) this.collectionOperations(c, query, mutation)
    for (const g of this.globals)
      this.globalOperations(g, globalTypes.get(g.slug) as GraphQLObjectType, query, mutation)
    const users = this.objects.get('users')
    if (users) {
      query.me = {
        type: users,
        description: 'The logged-in user (or the owner of the API key), or null.',
        resolve: (_source, _args, ctx: GraphQLContext) =>
          ctx.user ? ctx.load('users', ctx.user.id) : null,
      }
    }

    if (this.options.extend) {
      const types = Object.fromEntries(
        [...this.objects.values(), ...globalTypes.values()].map((t) => [t.name, t]),
      )
      const extension = this.options.extend({
        config: this.config,
        types,
        type: (name) => {
          const found = types[name]
          if (!found)
            throw new Error(`graphqlPlugin: extend asks for the type "${name}", which is not here`)
          return found
        },
        scalars: { JSON: JSONScalar, DateTime: DateTimeScalar },
      })
      for (const [typeName, fields] of Object.entries(extension.fields ?? {})) {
        if (!types[typeName])
          throw new Error(
            `graphqlPlugin: extend adds fields to "${typeName}", which is not a type here`,
          )
        this.extra.set(typeName, { ...this.extra.get(typeName), ...fields })
      }
      const add = (target: Record<string, FieldConfig>, more: object | undefined, kind: string) => {
        for (const [name, field] of Object.entries(more ?? {})) {
          if (target[name])
            throw new Error(`graphqlPlugin: extend adds the ${kind} "${name}", which exists`)
          target[name] = field as FieldConfig
        }
      }
      add(query, extension.query, 'query')
      add(mutation, extension.mutation, 'mutation')
    }

    return new GraphQLSchema({
      query: new GraphQLObjectType({ name: 'Query', fields: query }),
      ...(Object.keys(mutation).length
        ? { mutation: new GraphQLObjectType({ name: 'Mutation', fields: mutation }) }
        : {}),
    })
  }

  // ---- Reading -------------------------------------------------------------------------------

  /** `locale` and `fallbackLocale` arguments, with localization. */
  private localeArgs(): Record<string, GraphQLArgumentConfig> {
    return this.locale
      ? {
          locale: {
            type: this.locale,
            description: 'Content language. Default: the default locale.',
          },
          fallbackLocale: {
            type: GraphQLBoolean,
            description: "Use the default locale's value when a value is empty.",
          },
        }
      : {}
  }

  private readArgs(drafts: boolean): Record<string, GraphQLArgumentConfig> {
    return {
      ...this.localeArgs(),
      ...(drafts
        ? {
            draft: {
              type: GraphQLBoolean,
              description: 'Include drafts (logged-in users and API keys only).',
            },
          }
        : {}),
    }
  }

  private collectionType(c: CollectionConfig, name: string): GraphQLObjectType {
    const media = c.slug === MEDIA
    return new GraphQLObjectType({
      name,
      ...describe(c.labels?.singular),
      fields: () => {
        const fields: GraphQLFieldConfigMap<Data, GraphQLContext> = {
          id: { type: new GraphQLNonNull(GraphQLID) },
          ...this.outputFields(media ? c.fields.filter((f) => f.name !== 'sizes') : c.fields, name),
        }
        if (media) {
          fields.url = { type: GraphQLString, description: 'Where the file is served.' }
          const sizes = this.mediaSizes()
          if (sizes) fields.sizes = { type: sizes, description: 'Resized copies of images.' }
        }
        if (c.slug === MEDIA_FOLDERS)
          fields.level = {
            type: GraphQLString,
            description: 'What you may do in this folder: view, edit or manage.',
          }
        if (c.drafts) fields.status = { type: this.status }
        fields.createdAt = { type: new GraphQLNonNull(DateTimeScalar) }
        fields.updatedAt = { type: new GraphQLNonNull(DateTimeScalar) }
        return { ...fields, ...this.extra.get(name) }
      },
    })
  }

  private globalType(g: GlobalConfig, name: string): GraphQLObjectType {
    return new GraphQLObjectType({
      name,
      ...describe(g.label),
      fields: () => ({
        ...this.outputFields(g.fields, name),
        ...(g.drafts ? { status: { type: this.status } } : {}),
        updatedAt: {
          type: DateTimeScalar,
          description: 'Null until the global is saved for the first time.',
        },
        ...this.extra.get(name),
      }),
    })
  }

  private mediaSizeTypes: GraphQLObjectType | null | undefined
  /** `sizes { thumbnail { url width height } }`, from `upload.imageSizes`. */
  private mediaSizes(): GraphQLObjectType | null {
    if (this.mediaSizeTypes !== undefined) return this.mediaSizeTypes
    const names = (this.config.upload.imageSizes ?? []).map((s) => s.name).filter(isValidName)
    if (names.length === 0) {
      this.mediaSizeTypes = null
      return null
    }
    const size = new GraphQLObjectType({
      name: 'MediaSize',
      fields: {
        filename: { type: GraphQLString },
        url: { type: GraphQLString },
        width: { type: GraphQLInt },
        height: { type: GraphQLInt },
      },
    })
    this.mediaSizeTypes = new GraphQLObjectType({
      name: 'MediaSizes',
      fields: Object.fromEntries(names.map((n) => [n, { type: size }])),
    })
    return this.mediaSizeTypes
  }

  private outputFields(
    fields: readonly Field[],
    path: string,
  ): GraphQLFieldConfigMap<Data, GraphQLContext> {
    const out: GraphQLFieldConfigMap<Data, GraphQLContext> = {}
    for (const field of fields) {
      if (field.hidden || !isValidName(field.name)) continue
      out[field.name] = { ...describe(field.label), ...this.outputField(field, path) }
    }
    return out
  }

  private outputField(field: Field, path: string): FieldConfig {
    const many = (type: GraphQLOutputType) => (hasMany(field) ? list(type) : type)
    switch (field.type) {
      case 'number':
        return { type: GraphQLFloat }
      case 'boolean':
        return { type: GraphQLBoolean }
      case 'date':
        return { type: DateTimeScalar }
      case 'json':
      case 'richText':
        return { type: JSONScalar }
      case 'select':
        return { type: many(this.selectType(field, path) ?? GraphQLString) }
      case 'relationship':
      case 'upload':
        return this.relationField(field)
      case 'group': {
        const type = new GraphQLObjectType({
          name: this.claim(`${path}${pascal(field.name)}`),
          fields: () => this.outputFields(field.fields, `${path}${pascal(field.name)}`),
        })
        return {
          type,
          resolve: (source: Data) => tag(source[field.name] ?? null, readOf(source)),
        }
      }
      case 'array': {
        const name = this.claim(`${path}${pascal(field.name)}Row`)
        const type = new GraphQLObjectType({
          name,
          fields: () => ({ id: { type: GraphQLString }, ...this.outputFields(field.fields, name) }),
        })
        return { type: list(type), resolve: (source: Data) => this.rows(source, field.name) }
      }
      case 'blocks': {
        const members = field.blocks.map((block) => this.blockType(block, path))
        const union = new GraphQLUnionType({
          name: this.claim(`${path}${pascal(field.name)}Block`),
          types: members,
          resolveType: (row: Data) =>
            members[field.blocks.findIndex((b) => b.slug === row.blockType)]?.name,
        })
        return {
          type: list(union),
          resolve: (source: Data) =>
            this.rows(source, field.name).filter((row) =>
              field.blocks.some((b) => b.slug === (row as Data).blockType),
            ),
        }
      }
      default:
        // text, textarea, email, slug, and added field types built on them.
        return { type: GraphQLString }
    }
  }

  private rows(source: Data, name: string): unknown[] {
    const value = source[name]
    const read = readOf(source)
    return Array.isArray(value) ? value.map((row) => tag(row, read)) : []
  }

  /** A block's type: shared by the fields that use the same block object (`HeroBlock`). */
  private blockType(block: Block, path: string): GraphQLObjectType {
    const known = this.blockTypes.get(block)
    if (known) return known
    const base = `${pascal(block.slug)}Block`
    const name = this.claim(this.taken.has(base) ? `${path}${base}` : base)
    const type = new GraphQLObjectType({
      name,
      ...describe(block.labels?.singular),
      fields: () => ({
        id: { type: GraphQLString },
        blockType: { type: new GraphQLNonNull(GraphQLString) },
        ...this.outputFields(block.fields, name),
      }),
    })
    this.blockTypes.set(block, type)
    return type
  }

  private selectEnums = new Map<Field, GraphQLEnumType | null>()
  /** An enum of the options, when every value is a valid GraphQL name. */
  private selectType(field: Field & { type: 'select' }, path: string): GraphQLEnumType | null {
    if (this.selectEnums.has(field)) return this.selectEnums.get(field) ?? null
    const values = field.options.map((o) => (typeof o === 'string' ? o : o.value))
    const valid =
      values.length > 0 &&
      values.every((v) => isValidName(v) && v !== 'true' && v !== 'false' && v !== 'null')
    const type = valid
      ? new GraphQLEnumType({
          name: this.claim(`${path}${pascal(field.name)}`),
          values: Object.fromEntries(values.map((v) => [v, { value: v }])),
        })
      : null
    this.selectEnums.set(field, type)
    return type
  }

  private relationField(field: Field & { type: 'relationship' | 'upload' }): FieldConfig {
    const target = field.type === 'upload' ? MEDIA : field.to
    const many = hasMany(field)
    const type = this.objects.get(target)
    if (!type || !this.exposed(target)) {
      // A collection the schema leaves out: its ids.
      return {
        type: many ? list(GraphQLID) : GraphQLID,
        resolve: (source: Data) => {
          const value = source[field.name]
          if (value === null || value === undefined) return many ? [] : null
          return Array.isArray(value) ? value.map(idOf) : idOf(value)
        },
      }
    }
    return {
      type: many ? list(type) : type,
      args: this.localeArgs(),
      resolve: async (source: Data, args: Data, ctx: GraphQLContext) => {
        const read = { ...readOf(source), ...this.localeOf(args) }
        const value = source[field.name]
        if (value === null || value === undefined) return many ? [] : null
        const ids = (Array.isArray(value) ? value : [value]).map(idOf)
        const docs = await Promise.all(
          ids.map((id) =>
            id === null || id === undefined ? null : ctx.load(target, toId(id), read),
          ),
        )
        return many ? docs.filter((d) => d !== null) : (docs[0] ?? null)
      },
    }
  }

  private localeOf(args: Data): ReadArgs {
    return {
      ...(typeof args.locale === 'string' ? { locale: args.locale } : {}),
      ...(typeof args.fallbackLocale === 'boolean' ? { fallbackLocale: args.fallbackLocale } : {}),
    }
  }

  /** What a query asked for: drafts only for staff and API keys, as in REST. */
  private readOf(args: Data, ctx: GraphQLContext): ReadArgs {
    const staff = ctx.user !== null && ctx.user !== undefined && ctx.user.member !== true
    return { ...this.localeOf(args), ...(args.draft === true && staff ? { draft: true } : {}) }
  }

  // ---- Filtering and sorting -----------------------------------------------------------------

  private whereType(fields: readonly Field[], name: string, drafts: boolean, root: boolean) {
    const type: GraphQLInputObjectType = new GraphQLInputObjectType({
      name: this.claim(`${name}Where`),
      fields: () => {
        const out: GraphQLInputFieldConfigMap = {}
        if (root) {
          out.id = { type: this.filters.ID }
          out.createdAt = { type: this.filters.DateTime }
          out.updatedAt = { type: this.filters.DateTime }
          if (drafts) out.status = { type: this.filters.status }
        }
        for (const field of fields) {
          if (field.hidden || !isValidName(field.name)) continue
          const filter = this.filterOf(field, name)
          if (filter) out[field.name] = { type: filter }
        }
        if (root) {
          out.AND = { type: list(type) }
          out.OR = { type: list(type) }
        }
        return out
      },
    })
    return type
  }

  private enumFilters = new Map<GraphQLEnumType, GraphQLInputObjectType>()
  private filterOf(field: Field, path: string): GraphQLInputType | undefined {
    switch (field.type) {
      case 'text':
      case 'textarea':
      case 'email':
      case 'slug':
        return this.filters.String
      case 'number':
        return this.filters.Float
      case 'boolean':
        return this.filters.Boolean
      case 'date':
        return this.filters.DateTime
      case 'relationship':
      case 'upload':
        return this.filters.ID
      case 'select': {
        const type = this.selectType(field, path)
        if (!type) return this.filters.String
        let filter = this.enumFilters.get(type)
        if (!filter) {
          filter = new GraphQLInputObjectType({
            name: this.claim(`${type.name}Filter`),
            fields: {
              equals: { type },
              not_equals: { type },
              in: { type: list(type) },
              not_in: { type: list(type) },
              exists: { type: GraphQLBoolean },
            },
          })
          this.enumFilters.set(type, filter)
        }
        return filter
      }
      case 'group':
        return this.whereType(field.fields, `${path}${pascal(field.name)}`, false, false)
      default:
        // json, richText, arrays and blocks are not filtered on.
        return field.type === 'json' ||
          field.type === 'richText' ||
          field.type === 'array' ||
          field.type === 'blocks'
          ? undefined
          : this.filters.String
    }
  }

  private sortType(c: CollectionConfig, name: string): GraphQLEnumType {
    const sortable = c.fields.filter(
      (f) =>
        !f.hidden &&
        isValidName(f.name) &&
        !hasMany(f) &&
        ['text', 'textarea', 'email', 'slug', 'number', 'date', 'boolean', 'select'].includes(
          f.type,
        ),
    )
    const values: Record<string, { value: string }> = {}
    for (const field of ['id', ...sortable.map((f) => f.name), 'createdAt', 'updatedAt']) {
      values[`${field}_ASC`] = { value: field }
      values[`${field}_DESC`] = { value: `-${field}` }
    }
    return new GraphQLEnumType({ name: this.claim(`${name}Sort`), values })
  }

  // ---- Operations ----------------------------------------------------------------------------

  private collectionOperations(
    c: CollectionConfig,
    query: Record<string, FieldConfig>,
    mutation: Record<string, FieldConfig>,
  ) {
    const slug = c.slug
    const names = this.names.collections.get(slug) as CollectionNames
    const type = this.objects.get(slug) as GraphQLObjectType
    const drafts = c.drafts === true
    const where = this.whereType(c.fields, names.type, drafts, true)
    const access = (ctx: GraphQLContext) =>
      ({ user: ctx.user, context: ctx.context, overrideAccess: false }) as const

    query[names.one] = {
      type,
      ...describe(c.labels?.singular),
      args: { id: { type: new GraphQLNonNull(GraphQLID) }, ...this.readArgs(drafts) },
      resolve: async (_source, args: Data, ctx: GraphQLContext) => {
        const read = this.readOf(args, ctx)
        const doc = await ctx.cms.findById(slug, toId(args.id), {
          ...access(ctx),
          depth: 0,
          ...read,
        })
        if (doc) ctx.count(1)
        return tag(doc, read)
      },
    }

    const page = new GraphQLObjectType({
      name: this.claim(`${names.type}List`),
      fields: {
        docs: { type: new GraphQLNonNull(list(type)) },
        totalDocs: { type: new GraphQLNonNull(GraphQLInt) },
        limit: { type: new GraphQLNonNull(GraphQLInt) },
        page: { type: new GraphQLNonNull(GraphQLInt) },
        totalPages: { type: new GraphQLNonNull(GraphQLInt) },
        hasNextPage: { type: new GraphQLNonNull(GraphQLBoolean) },
        hasPrevPage: { type: new GraphQLNonNull(GraphQLBoolean) },
      },
    })
    const fields = c.fields
    query[names.many] = {
      type: new GraphQLNonNull(page),
      ...describe(c.labels?.plural),
      args: {
        where: { type: where },
        sort: { type: list(this.sortType(c, names.type)) },
        limit: { type: GraphQLInt, defaultValue: 10, description: `1 to ${MAX_LIMIT}.` },
        page: { type: GraphQLInt, defaultValue: 1 },
        ...this.readArgs(drafts),
      },
      resolve: async (_source, args: Data, ctx: GraphQLContext) => {
        const limit = args.limit as number
        if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT)
          throw userError(`limit must be between 1 and ${MAX_LIMIT}`)
        const read = this.readOf(args, ctx)
        const result = await ctx.cms.find(slug, {
          ...access(ctx),
          depth: 0,
          limit,
          page: args.page as number,
          ...(args.where ? { where: toWhere(args.where as Data, fields) } : {}),
          ...(Array.isArray(args.sort) && args.sort.length ? { sort: args.sort as string[] } : {}),
          ...read,
        })
        ctx.count(result.docs.length)
        return { ...result, docs: result.docs.map((d) => tag(d, read)) }
      },
    }

    // Writing.
    const written = (doc: unknown, args: Data) => tag(doc, this.localeOf(args))
    const status = (data: Data, args: Data): Data =>
      drafts && typeof args.draft === 'boolean'
        ? { ...data, status: args.draft ? 'draft' : 'published' }
        : data
    const writeArgs = {
      ...this.localeArgsForWrite(),
      ...(drafts
        ? {
            draft: {
              type: GraphQLBoolean,
              description:
                'true: save as a draft. false: publish. Default: as the collection does.',
            },
          }
        : {}),
    }
    const inputFields =
      slug === MEDIA ? fields.filter((f) => !MEDIA_SYSTEM_FIELDS.has(f.name)) : fields
    const extraInput: GraphQLInputFieldConfigMap =
      slug === 'users' ? { password: { type: GraphQLString } } : {}

    if (slug !== MEDIA) {
      const createInput = this.inputType(
        `${names.type}CreateInput`,
        inputFields,
        names.type,
        true,
        extraInput,
      )
      mutation[`create${names.type}`] = {
        type,
        args: { data: { type: new GraphQLNonNull(createInput) }, ...writeArgs },
        resolve: async (_source, args: Data, ctx: GraphQLContext) => {
          const data = status(toInput(args.data as Data, fields), args)
          const doc = await ctx.cms.create(slug, data as never, {
            ...access(ctx),
            depth: 0,
            ...this.localeOf(args),
          })
          return written(doc, args)
        },
      }
    }
    const updateInput = this.inputType(
      `${names.type}UpdateInput`,
      inputFields,
      names.type,
      false,
      extraInput,
    )
    mutation[`update${names.type}`] = {
      type,
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) },
        data: { type: new GraphQLNonNull(updateInput) },
        ...writeArgs,
      },
      resolve: async (_source, args: Data, ctx: GraphQLContext) => {
        const data = status(toInput(args.data as Data, fields), args)
        const doc = await ctx.cms.update(slug, toId(args.id), data as never, {
          ...access(ctx),
          depth: 0,
          ...this.localeOf(args),
        })
        return written(doc, args)
      },
    }
    mutation[`delete${names.type}`] = {
      type,
      description: 'Deletes the document and returns it. Cannot be undone.',
      args: { id: { type: new GraphQLNonNull(GraphQLID) } },
      resolve: async (_source, args: Data, ctx: GraphQLContext) =>
        written(await ctx.cms.delete(slug, toId(args.id), access(ctx)), {}),
    }
  }

  private globalOperations(
    g: GlobalConfig,
    type: GraphQLObjectType,
    query: Record<string, FieldConfig>,
    mutation: Record<string, FieldConfig>,
  ) {
    const slug = g.slug
    const names = this.names.globals.get(slug) as GlobalNames
    const drafts = g.drafts === true
    const access = (ctx: GraphQLContext) =>
      ({ user: ctx.user, context: ctx.context, overrideAccess: false }) as const
    query[names.one] = {
      type,
      ...describe(g.label),
      args: this.readArgs(drafts),
      resolve: async (_source, args: Data, ctx: GraphQLContext) => {
        const read = this.readOf(args, ctx)
        return tag(await ctx.cms.findGlobal(slug, { ...access(ctx), depth: 0, ...read }), read)
      },
    }
    const input = this.inputType(`${names.type}Input`, g.fields, names.type, false, {})
    mutation[`update${names.type}`] = {
      type,
      args: {
        data: { type: new GraphQLNonNull(input) },
        ...this.localeArgsForWrite(),
        ...(drafts
          ? {
              draft: {
                type: GraphQLBoolean,
                description: 'true: save as a draft. false: publish.',
              },
            }
          : {}),
      },
      resolve: async (_source, args: Data, ctx: GraphQLContext) => {
        let data = toInput(args.data as Data, g.fields)
        if (drafts && typeof args.draft === 'boolean')
          data = { ...data, status: args.draft ? 'draft' : 'published' }
        const doc = await ctx.cms.updateGlobal(slug, data as never, {
          ...access(ctx),
          depth: 0,
          ...this.localeOf(args),
        })
        return tag(doc, this.localeOf(args))
      },
    }
  }

  private localeArgsForWrite(): Record<string, GraphQLArgumentConfig> {
    return this.locale
      ? { locale: { type: this.locale, description: 'The language the data is in.' } }
      : {}
  }

  // ---- Input ---------------------------------------------------------------------------------

  private inputType(
    name: string,
    fields: readonly Field[],
    path: string,
    strict: boolean,
    extra: GraphQLInputFieldConfigMap,
  ): GraphQLInputObjectType {
    return new GraphQLInputObjectType({
      name: this.claim(name),
      fields: () => ({ ...this.inputFields(fields, path, strict), ...extra }),
    })
  }

  private nestedInputs = new Map<Field, GraphQLInputObjectType>()
  private inputFields(
    fields: readonly Field[],
    path: string,
    strict: boolean,
  ): GraphQLInputFieldConfigMap {
    const out: GraphQLInputFieldConfigMap = {}
    for (const field of fields) {
      if (field.hidden || !isValidName(field.name)) continue
      const type = this.inputOf(field, path)
      const required =
        strict &&
        field.required === true &&
        field.defaultValue === undefined &&
        !['slug', 'group', 'array', 'blocks'].includes(field.type)
      out[field.name] = {
        type: required ? new GraphQLNonNull(type as never) : type,
        ...describe(field.label),
      }
    }
    return out
  }

  private inputOf(field: Field, path: string): GraphQLInputType {
    const many = (type: GraphQLInputType) => (hasMany(field) ? list(type) : type)
    switch (field.type) {
      case 'number':
        return GraphQLFloat
      case 'boolean':
        return GraphQLBoolean
      case 'date':
        return DateTimeScalar
      case 'json':
        return JSONScalar
      case 'richText':
        return JSONScalar
      case 'select':
        return many(this.selectType(field, path) ?? GraphQLString)
      case 'relationship':
      case 'upload':
        return many(GraphQLID)
      case 'blocks':
        return list(JSONScalar)
      case 'group':
      case 'array': {
        let type = this.nestedInputs.get(field)
        if (!type) {
          const base = `${path}${pascal(field.name)}`
          const name = field.type === 'group' ? `${base}Input` : `${base}RowInput`
          type = new GraphQLInputObjectType({
            name: this.claim(name),
            fields: () => ({
              ...(field.type === 'array' ? { id: { type: GraphQLString } } : {}),
              ...this.inputFields(field.fields, base, false),
            }),
          })
          this.nestedInputs.set(field, type)
        }
        return field.type === 'group' ? type : list(type)
      }
      default:
        return GraphQLString
    }
  }
}

/** A typed `where` as the Local API takes it: `AND`/`OR`, groups as dotted paths, ids. */
function toWhere(input: Data, fields: readonly Field[], prefix = ''): Where {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue
    if (key === 'AND' || key === 'OR') {
      out[key.toLowerCase()] = (value as Data[]).map((w) => toWhere(w, fields))
      continue
    }
    const field = fields.find((f) => f.name === key)
    if (field?.type === 'group') {
      Object.assign(out, toWhere(value as Data, field.fields, `${prefix}${key}.`))
      continue
    }
    const ids = key === 'id' || field?.type === 'relationship' || field?.type === 'upload'
    out[`${prefix}${key}`] = ids ? mapOperators(value as Data, toId) : value
  }
  return out as Where
}

function mapOperators(ops: Data, map: (value: unknown) => unknown): Data {
  return Object.fromEntries(
    Object.entries(ops).map(([op, v]) => [
      op,
      op === 'exists' || v === null ? v : Array.isArray(v) ? v.map(map) : map(v),
    ]),
  )
}

/** Input as the Local API takes it: ids, rich text from plain text, rows and groups inside. */
function toInput(data: Data, fields: readonly Field[]): Data {
  const out: Data = { ...data }
  for (const field of fields) {
    const value = out[field.name]
    if (value === undefined || value === null) continue
    switch (field.type) {
      case 'relationship':
      case 'upload':
        out[field.name] = Array.isArray(value) ? value.map(toId) : toId(value)
        break
      case 'richText':
        if (typeof value === 'string') out[field.name] = textToDoc(value)
        break
      case 'group':
        out[field.name] = toInput(value as Data, field.fields)
        break
      case 'array':
        out[field.name] = (value as Data[]).map((row) => toInput(row, field.fields))
        break
      case 'blocks':
        out[field.name] = (value as unknown[]).map((row) => {
          const block = field.blocks.find((b) => b.slug === (row as Data)?.blockType)
          return block && row && typeof row === 'object' ? toInput(row as Data, block.fields) : row
        })
        break
    }
  }
  return out
}
