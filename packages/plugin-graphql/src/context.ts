import {
  type AuthUser,
  type EasyCMS,
  ForbiddenError,
  type ID,
  type RawDocument,
  UnauthorizedError,
} from '@easy-cms/core'
import DataLoader from 'dataloader'
import { GraphQLError } from 'graphql'

/** How documents are read: what the query asked for, kept with each document it returns. */
export interface ReadArgs {
  readonly locale?: string
  readonly fallbackLocale?: boolean
  readonly draft?: boolean
}

/** What resolvers receive as their context, yours from `extend` included. */
export interface GraphQLContext {
  /** The Local API. Pass `{ user, overrideAccess: false }` to apply the reader's access rules. */
  readonly cms: EasyCMS
  /** The logged-in user or API key, or `null`. */
  readonly user: AuthUser | null
  /**
   * One document by id, with the reader's access. Loads in the same tick are batched into one
   * query per collection, and count towards `limits.documents`.
   */
  load(collection: string, id: ID, read?: ReadArgs): Promise<RawDocument | null>
  /** Counts documents loaded another way towards `limits.documents`. */
  count(documents: number): void
}

export interface ContextOptions {
  /** Most documents one request may load. Default 2000. */
  readonly documents?: number
}

export const DEFAULT_DOCUMENTS = 2000

/** The read arguments of a document, set when it was loaded (`ReadArgs`). */
const READ = Symbol.for('easy-cms.graphql.read')

/** Keeps how a document (or a group or row of it) was read, for its relationships. */
export function tag<T>(value: T, read: ReadArgs): T {
  if (value && typeof value === 'object')
    Object.defineProperty(value, READ, { value: read, enumerable: false, configurable: true })
  return value
}

export const readOf = (source: unknown): ReadArgs =>
  ((source as { [READ]?: ReadArgs } | null)?.[READ] ?? {}) as ReadArgs

/** GraphQL ids are strings: SQLite and Postgres serial ids are numbers. */
export function toId(value: unknown): ID {
  if (typeof value === 'string' && /^[1-9]\d{0,15}$/.test(value)) {
    const n = Number(value)
    if (Number.isSafeInteger(n)) return n
  }
  return value as ID
}

/** The context of one request: its user, its batched loads, its document count. */
export function createContext(
  cms: EasyCMS,
  user: AuthUser | null,
  options: ContextOptions = {},
): GraphQLContext {
  const max = options.documents ?? DEFAULT_DOCUMENTS
  let loaded = 0
  const count = (documents: number) => {
    loaded += documents
    if (loaded > max)
      throw new GraphQLError(
        `This query loads more than ${max} documents: ask for fewer, or raise limits.documents`,
        { extensions: { code: 'QUERY_TOO_LARGE' } },
      )
  }
  const loaders = new Map<string, DataLoader<ID, RawDocument | null, string>>()
  const loaderFor = (collection: string, read: ReadArgs) => {
    const key = JSON.stringify([collection, read.locale, read.fallbackLocale, read.draft === true])
    let loader = loaders.get(key)
    if (!loader) {
      loader = new DataLoader(
        async (ids) => {
          let docs: RawDocument[]
          try {
            const found = await cms.find(collection, {
              user,
              overrideAccess: false,
              where: { id: { in: [...ids] } },
              limit: 0,
              depth: 0,
              ...read,
            })
            docs = found.docs as RawDocument[]
          } catch (error) {
            // A collection the reader may not see: its documents are missing, as when populating.
            if (error instanceof ForbiddenError || error instanceof UnauthorizedError) docs = []
            else throw error
          }
          count(docs.length)
          const byId = new Map(docs.map((doc) => [String(doc.id), tag(doc, read)]))
          return ids.map((id) => byId.get(String(id)) ?? null)
        },
        { cacheKeyFn: (id) => String(id), maxBatchSize: 500 },
      )
      loaders.set(key, loader)
    }
    return loader
  }
  return {
    cms,
    user,
    count,
    load: (collection, id, read = {}) => loaderFor(collection, read).load(id),
  }
}
