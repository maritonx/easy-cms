import type { ID } from './access.js'
import type { CollectionConfig } from './config.js'
import { QueryError } from './errors.js'
import { type Field, hasRows, rowFields } from './fields.js'
import type { Logger } from './logger.js'

/** One document in one locale, as a search engine indexes it: plain text per field. */
export interface SearchEntry {
  readonly collection: string
  readonly id: string
  /** `null` without `localization`. */
  readonly locale: string | null
  /** The collection's `search.fields`, in their order (most important first), as plain text. */
  readonly text: Readonly<Record<string, string>>
}

export interface SearchQuery {
  /** What the person typed. */
  readonly query: string
  /** Searchable collections to look in; never empty. */
  readonly collections: readonly string[]
  /** The locale to search; `null` without `localization`. */
  readonly locale: string | null
  readonly limit: number
  readonly offset: number
}

export interface SearchHits {
  /** Best match first. */
  readonly hits: readonly { readonly collection: string; readonly id: string }[]
  /** Matches in all, for paging. */
  readonly total: number
}

/** One setting a search adapter shows to admins (`describe()`). */
export interface SearchSetting {
  readonly key: string
  /** `null`: not set. */
  readonly value: string | null
}

/**
 * Indexes published documents for relevance-ranked full-text search (`search` in the config):
 * `memorySearch()`, or an adapter for a search engine. Easy CMS turns documents into plain text,
 * calls `index` and `remove` as they change, and reads the hits back with the user's access.
 */
export interface SearchAdapter {
  /** E.g. `memory`; shown to admins on the dashboard (System). */
  readonly name?: string
  /**
   * The adapter interface it is written for (`ADAPTER_API_VERSION`); Easy CMS refuses another.
   * Leave it out to skip the check.
   */
  readonly apiVersion?: number
  /**
   * The index starts empty in each process (it lives in memory): Easy CMS builds it when it
   * starts, and searches wait until it is built.
   */
  readonly ephemeral?: boolean
  /** Creates or updates the indexes for these collections; runs before a reindex. */
  setup?(collections: readonly { slug: string; fields: readonly string[] }[]): Promise<void>
  /** Adds or replaces entries (same collection, id and locale). */
  index(entries: readonly SearchEntry[]): Promise<void>
  /** Removes documents, in every locale. */
  remove(documents: readonly { collection: string; id: string }[]): Promise<void>
  /** Removes every document of a collection, before a reindex. */
  clear(collection: string): Promise<void>
  search(query: SearchQuery): Promise<SearchHits>
  /** The settings in use, for admins. Never return secrets. */
  describe?(): readonly SearchSetting[]
}

/** What `search` of a collection says: the fields to index, most important first. */
export interface CollectionSearch {
  /**
   * Field names, or paths through groups such as `seo.description`: text, textarea, email, slug,
   * select and rich text fields, or arrays, groups and blocks (all the text inside them).
   */
  readonly fields: readonly string[]
}

/** Field types `search.fields` may name. */
export const SEARCHABLE_TYPES: ReadonlySet<string> = new Set([
  'text',
  'textarea',
  'email',
  'slug',
  'select',
  'richText',
  'array',
  'group',
  'blocks',
])

/** The field at a path through groups (`seo.description`), or `undefined`. */
export function fieldAt(fields: readonly Field[], path: string): Field | undefined {
  const [name, ...rest] = path.split('.')
  const field = fields.find((f) => f.name === name)
  if (!field || rest.length === 0) return field
  return field.type === 'group' ? fieldAt(field.fields, rest.join('.')) : undefined
}

/** The plain text of a value of `field`: rich text without its marks, rows and groups whole. */
function textOf(field: Field, value: unknown): string {
  if (value === null || value === undefined) return ''
  switch (field.type) {
    case 'text':
    case 'textarea':
    case 'email':
    case 'slug':
      return typeof value === 'string' ? value : ''
    case 'select':
      return [value]
        .flat()
        .filter((v) => typeof v === 'string')
        .join(' ')
    case 'richText':
      return richText(value)
    case 'group':
      return typeof value === 'object'
        ? fieldsText(field.fields, value as Record<string, unknown>)
        : ''
    case 'array':
    case 'blocks':
      if (!Array.isArray(value) || !hasRows(field)) return ''
      return value
        .map((row) => {
          const fields = rowFields(field, row)
          return fields && row && typeof row === 'object'
            ? fieldsText(fields, row as Record<string, unknown>)
            : ''
        })
        .filter(Boolean)
        .join('\n')
    default:
      return ''
  }
}

function fieldsText(fields: readonly Field[], data: Record<string, unknown>): string {
  return fields
    .filter((f) => SEARCHABLE_TYPES.has(f.type) && !f.hidden)
    .map((f) => textOf(f, data[f.name]))
    .filter(Boolean)
    .join('\n')
}

/** The text of a Tiptap document: its text nodes, blocks on lines of their own. */
function richText(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const { text, content } = node as { text?: unknown; content?: unknown }
  if (typeof text === 'string') return text
  if (!Array.isArray(content)) return ''
  const inline = content.some((child) => typeof (child as { text?: unknown })?.text === 'string')
  return content
    .map(richText)
    .filter(Boolean)
    .join(inline ? '' : '\n')
}

/** The plain text of a document's `search.fields`, keyed by path. */
export function searchText(
  fields: readonly Field[],
  doc: Record<string, unknown>,
  paths: readonly string[],
): Record<string, string> {
  const text: Record<string, string> = {}
  for (const path of paths) {
    const field = fieldAt(fields, path)
    let value: unknown = doc
    for (const name of path.split('.'))
      value =
        value && typeof value === 'object' ? (value as Record<string, unknown>)[name] : undefined
    text[path] = field ? textOf(field, value) : ''
  }
  return text
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' })

/**
 * The words of a text, lowercased. ICU's word breaks split Thai, Lao, Khmer, Chinese and Japanese
 * by dictionary, so text without spaces between words still gives words. NFC, not NFKC: NFKC
 * splits Thai sara am (ำ) in two, and the dictionary no longer knows the words.
 */
export function words(text: string): string[] {
  return [...segmenter.segment(text.normalize('NFC').toLowerCase())]
    .filter((s) => s.isWordLike)
    .map((s) => s.segment)
}

interface Indexed {
  readonly collection: string
  readonly id: string
  readonly locale: string | null
  /** The words of each field, most important field first. */
  readonly fields: readonly (readonly string[])[]
  /** Each field's words run together, for words searched that the document's text splits up. */
  readonly joined: readonly string[]
}

/**
 * A search index in memory, for development, tests and small sites with one process: built when
 * the server starts, and lost when it stops. Words are split with `Intl.Segmenter`, so Thai text
 * is found by its words. Every word searched must be in the document, at the start of one of its
 * words or across words; documents whose first fields (`search.fields`) match, and match whole
 * words, rank first.
 */
export function memorySearch(): SearchAdapter {
  const entries = new Map<string, Indexed>()
  const key = (collection: string, id: string, locale: string | null) =>
    JSON.stringify([collection, id, locale])
  return {
    name: 'memory',
    apiVersion: 1,
    ephemeral: true,
    async index(list) {
      for (const e of list) {
        const fields = Object.values(e.text).map(words)
        entries.set(key(e.collection, e.id, e.locale), {
          collection: e.collection,
          id: e.id,
          locale: e.locale,
          fields,
          joined: fields.map((list) => list.join('')),
        })
      }
    },
    async remove(documents) {
      const gone = new Set(documents.map((d) => JSON.stringify([d.collection, d.id])))
      for (const [k, e] of entries)
        if (gone.has(JSON.stringify([e.collection, e.id]))) entries.delete(k)
    },
    async clear(collection) {
      for (const [k, e] of entries) if (e.collection === collection) entries.delete(k)
    },
    async search(q) {
      const terms = [...new Set(words(q.query))]
      if (terms.length === 0) return { hits: [], total: 0 }
      const collections = new Set(q.collections)
      const scored: { e: Indexed; score: number }[] = []
      for (const e of entries.values()) {
        if (!collections.has(e.collection) || (q.locale !== null && e.locale !== q.locale)) continue
        let score = 0
        for (const term of terms) {
          let best = 0
          e.fields.forEach((list, i) => {
            const weight = e.fields.length - i
            for (const w of list)
              if (w === term) best = Math.max(best, weight * 4)
              else if (w.startsWith(term)) best = Math.max(best, weight * 2)
            // ฝนตก, one word to the dictionary alone, is ฝน + ตก in ฝนตกหนัก.
            if (best === 0 && e.joined[i]?.includes(term)) best = weight
          })
          if (best === 0) {
            score = 0
            break
          }
          score += best
        }
        if (score > 0) scored.push({ e, score })
      }
      scored.sort((a, b) => b.score - a.score)
      return {
        hits: scored
          .slice(q.offset, q.offset + q.limit)
          .map(({ e }) => ({ collection: e.collection, id: e.id })),
        total: scored.length,
      }
    },
    describe: () => [
      { key: 'index', value: 'memory' },
      { key: 'entries', value: String(entries.size) },
    ],
  }
}

/** Reads the documents of hits, with access applied, in the hits' order. */
export type ReadHits = (
  collection: string,
  ids: readonly string[],
) => Promise<readonly Record<string, unknown>[]>

/** The search index of a CMS: keeps it in step with published documents and reads it. */
export class SearchIndex {
  /** Indexing started by saves, which searches wait for. */
  private readonly pending = new Set<Promise<void>>()
  /** The first build of an `ephemeral` index. */
  private building: Promise<void> | undefined

  constructor(
    readonly adapter: SearchAdapter,
    private readonly collections: readonly CollectionConfig[],
    private readonly locales: readonly (string | null)[],
    private readonly logger: Logger,
    /** The published document in a locale, read without access rules; `null` when there is none. */
    private readonly read: (
      collection: string,
      id: string,
      locale: string | null,
    ) => Promise<Record<string, unknown> | null>,
    /** Published documents of a collection in a locale, a page at a time. */
    private readonly pages: (
      collection: string,
      locale: string | null,
    ) => AsyncIterable<readonly Record<string, unknown>[]>,
  ) {}

  /** The collection's `search`, or `undefined` when it isn't searchable. */
  configOf(collection: string): (CollectionConfig & { search: CollectionSearch }) | undefined {
    const config = this.collections.find((c) => c.slug === collection)
    return config?.search ? (config as CollectionConfig & { search: CollectionSearch }) : undefined
  }

  /** Slugs of the searchable collections. */
  get searchable(): string[] {
    return this.collections.filter((c) => c.search).map((c) => c.slug)
  }

  /** Builds an `ephemeral` index in the background; searches wait for it. */
  start(): void {
    if (!this.adapter.ephemeral || this.searchable.length === 0) return
    this.building = this.reindex().then(
      () => undefined,
      (error) =>
        this.logger.error(`Search: building the index failed: ${(error as Error).message}`, {
          error,
        }),
    )
  }

  /**
   * Indexes a document as it now is, or removes it when it isn't published (or is gone). Reading
   * it again, rather than taking what a save had, makes running it twice or late harmless.
   */
  async sync(collection: string, id: ID): Promise<void> {
    const config = this.configOf(collection)
    if (!config) return
    const entries: SearchEntry[] = []
    for (const locale of this.locales) {
      const doc = await this.read(collection, String(id), locale)
      if (!doc) {
        await this.adapter.remove([{ collection, id: String(id) }])
        return
      }
      entries.push(this.entry(config, doc, locale))
    }
    await this.adapter.index(entries)
  }

  /** `sync` after a save, in the background: failures are logged. */
  syncLater(collection: string, id: ID): void {
    const run = this.sync(collection, id)
      .catch((error) =>
        this.logger.error(
          `Search: indexing ${collection} ${String(id)} failed: ${(error as Error).message}; run \`easy-cms search:reindex\` to repair the index`,
          { error },
        ),
      )
      .finally(() => this.pending.delete(run))
    this.pending.add(run)
  }

  /** Waits for indexing started so far. */
  async flush(): Promise<void> {
    await this.building
    while (this.pending.size > 0) await Promise.all(this.pending)
  }

  /** Builds the index again from the database: every collection, or one. */
  async reindex(collection?: string): Promise<{ collection: string; documents: number }[]> {
    const slugs = collection === undefined ? this.searchable : [collection]
    for (const slug of slugs)
      if (!this.configOf(slug))
        throw new QueryError(`"${slug}" is not searchable: it has no \`search\` in the config`)
    await this.adapter.setup?.(
      slugs.map((slug) => ({ slug, fields: this.configOf(slug)?.search.fields ?? [] })),
    )
    const done: { collection: string; documents: number }[] = []
    for (const slug of slugs) {
      const config = this.configOf(slug) as CollectionConfig & { search: CollectionSearch }
      await this.adapter.clear(slug)
      const ids = new Set<string>()
      for (const locale of this.locales)
        for await (const docs of this.pages(slug, locale)) {
          for (const doc of docs) ids.add(String(doc.id))
          await this.adapter.index(docs.map((doc) => this.entry(config, doc, locale)))
        }
      done.push({ collection: slug, documents: ids.size })
    }
    return done
  }

  /** Hits for a query, as documents the reader may read, best match first. */
  async search(
    query: SearchQuery,
    readHits: ReadHits,
  ): Promise<{ hits: { collection: string; doc: Record<string, unknown> }[]; total: number }> {
    await this.flush()
    const found = await this.adapter.search(query)
    const byCollection = new Map<string, string[]>()
    for (const hit of found.hits)
      byCollection.set(hit.collection, [...(byCollection.get(hit.collection) ?? []), hit.id])
    const docs = new Map<string, Record<string, unknown>>()
    await Promise.all(
      [...byCollection].map(async ([collection, ids]) => {
        for (const doc of await readHits(collection, ids))
          docs.set(JSON.stringify([collection, String(doc.id)]), doc)
      }),
    )
    const hits: { collection: string; doc: Record<string, unknown> }[] = []
    for (const hit of found.hits) {
      const doc = docs.get(JSON.stringify([hit.collection, hit.id]))
      if (doc) hits.push({ collection: hit.collection, doc })
    }
    return { hits, total: found.total }
  }

  private entry(
    config: CollectionConfig & { search: CollectionSearch },
    doc: Record<string, unknown>,
    locale: string | null,
  ): SearchEntry {
    return {
      collection: config.slug,
      id: String(doc.id),
      locale,
      text: searchText(config.fields, doc, config.search.fields),
    }
  }
}
