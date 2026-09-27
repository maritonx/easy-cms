import type { ID } from './access.js'
import { VERSIONS } from './builtins.js'
import type { CollectionConfig, GlobalConfig } from './config.js'
import type { Database, RawDocument } from './database.js'
import type { Field } from './fields.js'

export const DEFAULT_MAX_VERSIONS = 50

/** One saved state of a document or global. */
export interface VersionSummary {
  readonly id: ID
  /** `draft` or `published` with drafts enabled, otherwise `null`. */
  readonly status: 'draft' | 'published' | null
  /** The newest version: the document's current editable state. */
  readonly latest: boolean
  /** Who saved it (user id), or `null` for saves without a user (scripts, seeds). */
  readonly author: ID | null
  readonly createdAt: string
}

export interface Version<T = Record<string, unknown>> extends VersionSummary {
  /** The document as it was saved (hidden fields such as password hashes are never kept). */
  readonly data: T
}

/** How many versions to keep, or `undefined` when the collection or global has no versions. */
export function versionLimit(config: CollectionConfig | GlobalConfig): number | undefined {
  const versions = config.versions
  if (!versions) return undefined
  return versions === true ? DEFAULT_MAX_VERSIONS : (versions.max ?? DEFAULT_MAX_VERSIONS)
}

/** Key that groups a document's versions: the collection slug, or `global:<slug>`. */
export const collectionParent = (slug: string) => slug
export const globalParent = (slug: string) => `global:${slug}`

/** Removes hidden fields (e.g. `passwordHash`) and system keys from a stored document. */
export function snapshotOf(fields: readonly Field[], doc: Record<string, unknown>) {
  const hidden = new Set(fields.filter((f) => f.hidden).map((f) => f.name))
  const snapshot: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(doc)) {
    if (key === 'id' || key === 'createdAt' || key === 'updatedAt' || hidden.has(key)) continue
    snapshot[key] = value
  }
  return snapshot
}

const toSummary = (row: RawDocument): VersionSummary => ({
  id: row.id,
  status: (row.status as VersionSummary['status']) ?? null,
  latest: row.latest === true,
  author: (row.author as ID | null) ?? null,
  createdAt: String(row.createdAt),
})

/** Reads and writes rows of the internal versions collection. */
export class VersionStore {
  constructor(private readonly db: Database) {}

  /** Saves a new latest version and deletes the oldest beyond `max`. */
  async save(args: {
    parent: string
    doc: ID
    status: VersionSummary['status']
    snapshot: Record<string, unknown>
    author: ID | null
    max: number
  }): Promise<VersionSummary> {
    const { parent, doc } = args
    const previous = await this.db.find({
      collection: VERSIONS,
      where: { and: [...this.of(parent, doc), { latest: { equals: true } }] },
      sort: [],
      limit: 0,
      page: 1,
    })
    for (const row of previous.docs) {
      await this.db.update({ collection: VERSIONS, id: row.id, data: { ...row, latest: false } })
    }
    const now = new Date().toISOString()
    const created = await this.db.create({
      collection: VERSIONS,
      data: {
        parent,
        doc,
        status: args.status,
        latest: true,
        author: args.author,
        snapshot: args.snapshot,
        createdAt: now,
        updatedAt: now,
      },
    })
    await this.prune(parent, doc, args.max)
    return toSummary(created)
  }

  /** The latest version of each document, keyed by document id. */
  async latest(parent: string, docs: readonly ID[]): Promise<Map<string, Version>> {
    const result = new Map<string, Version>()
    if (docs.length === 0) return result
    const rows = await this.db.find({
      collection: VERSIONS,
      where: {
        and: [
          { parent: { equals: parent } },
          { doc: { in: [...docs] } },
          { latest: { equals: true } },
        ],
      },
      sort: [],
      limit: 0,
      page: 1,
    })
    for (const row of rows.docs) result.set(String(row.doc), this.toVersion(row))
    return result
  }

  async list(parent: string, doc: ID, limit: number, page: number) {
    const found = await this.db.find({
      collection: VERSIONS,
      where: { and: this.of(parent, doc) },
      sort: ['-id'],
      limit,
      page,
    })
    return { ...found, docs: found.docs.map(toSummary) }
  }

  async get(parent: string, doc: ID, id: ID): Promise<Version | null> {
    const found = await this.db.find({
      collection: VERSIONS,
      where: { and: [...this.of(parent, doc), { id: { equals: id } }] },
      sort: [],
      limit: 1,
      page: 1,
    })
    const row = found.docs[0]
    return row ? this.toVersion(row) : null
  }

  async deleteAll(parent: string, doc: ID): Promise<void> {
    const rows = await this.db.find({
      collection: VERSIONS,
      where: { and: this.of(parent, doc) },
      sort: [],
      limit: 0,
      page: 1,
    })
    for (const row of rows.docs) await this.db.delete({ collection: VERSIONS, id: row.id })
  }

  private async prune(parent: string, doc: ID, max: number) {
    const rows = await this.db.find({
      collection: VERSIONS,
      where: { and: this.of(parent, doc) },
      sort: ['-id'],
      limit: 0,
      page: 1,
    })
    for (const row of rows.docs.slice(max)) {
      await this.db.delete({ collection: VERSIONS, id: row.id })
    }
  }

  private of(parent: string, doc: ID) {
    return [{ parent: { equals: parent } }, { doc: { equals: doc } }]
  }

  private toVersion(row: RawDocument): Version {
    return { ...toSummary(row), data: (row.snapshot ?? {}) as Record<string, unknown> }
  }
}
