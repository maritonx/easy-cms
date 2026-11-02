import type { ID } from './access.js'
import type { CollectionConfig } from './config.js'
import type { RawDocument } from './database.js'
import {
  type Field,
  hasRows,
  isPolymorphic,
  polymorphicValue,
  relationTargets,
  rowFields,
} from './fields.js'
import { blockFields, blockNodes, blockOf } from './rich-text-blocks.js'
import { docLinkMarks, linkTarget } from './rich-text-links.js'

type Data = Record<string, unknown>

export const DEFAULT_DEPTH = 1
export const MAX_DEPTH = 3

interface Slot {
  /** Collection the ids point to. */
  readonly collection: string
  readonly ids: ID[]
  /** Writes the populated documents back into place. */
  readonly assign: (byId: ReadonlyMap<ID, RawDocument>) => void
}

/** Loads the documents of one collection that the caller may see. */
export type Loader = (collection: CollectionConfig, ids: readonly ID[]) => Promise<RawDocument[]>

/** A linked document's URL, for links in rich text (#326); `null` when it has none. */
export type LinkURL = (collection: CollectionConfig, doc: RawDocument) => string | null

/**
 * Replaces relationship and upload ids with documents, `depth` levels deep.
 * Missing (or unreadable) documents become `null` (single) or are dropped (hasMany).
 * Returns new objects; the input is not modified.
 */
export async function populate(
  load: Loader,
  collections: readonly CollectionConfig[],
  fields: readonly Field[],
  docs: RawDocument[],
  depth: number,
  linkURL?: LinkURL,
): Promise<RawDocument[]> {
  if (depth <= 0 || docs.length === 0) return docs
  const bySlug = new Map(collections.map((c) => [c.slug, c]))
  const copies = docs.map((doc) => structuredClone(doc))

  const slots: Slot[] = []
  for (const doc of copies) collectSlots(fields, doc, bySlug, slots, linkURL)
  if (slots.length === 0) return copies

  const wanted = new Map<string, Set<ID>>()
  for (const slot of slots) {
    const set = wanted.get(slot.collection) ?? new Set()
    for (const id of slot.ids) set.add(id)
    wanted.set(slot.collection, set)
  }

  const found = new Map<string, Map<ID, RawDocument>>()
  await Promise.all(
    [...wanted].map(async ([slug, ids]) => {
      const collection = bySlug.get(slug)
      if (!collection) return
      const raw = await load(collection, [...ids])
      const populated = await populate(
        load,
        collections,
        collection.fields,
        raw,
        depth - 1,
        linkURL,
      )
      found.set(slug, new Map(populated.map((d) => [d.id, d])))
    }),
  )

  for (const slot of slots) slot.assign(found.get(slot.collection) ?? new Map())
  return copies
}

function collectSlots(
  fields: readonly Field[],
  data: Data,
  bySlug: ReadonlyMap<string, CollectionConfig>,
  slots: Slot[],
  linkURL: LinkURL | undefined,
) {
  for (const field of fields) {
    // Config validation refuses the name; assigning to it would replace `data`'s prototype.
    if (field.name === '__proto__') continue
    const value = data[field.name]
    if (value === null || value === undefined) continue

    if (field.type === 'group') {
      if (typeof value === 'object')
        collectSlots(field.fields, value as Data, bySlug, slots, linkURL)
    } else if (hasRows(field)) {
      if (Array.isArray(value)) {
        for (const row of value) {
          const fields = rowFields(field, row)
          if (fields && row && typeof row === 'object')
            collectSlots(fields, row as Data, bySlug, slots, linkURL)
        }
      }
    } else if (field.type === 'richText') {
      // Only documents: skip `{ [locale]: … }` maps (reads with `locale: 'all'`).
      if ((value as Data).type !== 'doc') continue
      // Relationships in blocks between paragraphs (#328), as in a blocks field's rows.
      for (const node of blockNodes(value)) {
        const block = blockOf(field, node)
        if (!block) continue
        const fields = { ...blockFields(node) }
        node.attrs = { ...node.attrs, fields }
        collectSlots(block.fields, fields, bySlug, slots, linkURL)
      }
      if (!linkURL) continue
      // Links to documents get the document's URL; a missing or unreadable one, none (#326).
      for (const mark of docLinkMarks(value)) {
        const target = linkTarget(mark.attrs.doc)
        const collection = target ? bySlug.get(target.relationTo) : undefined
        if (!target || !collection) continue
        const id = target.value as ID
        slots.push({
          collection: target.relationTo,
          ids: [id],
          assign: (byId) => {
            const doc = byId.get(id)
            mark.attrs = { ...mark.attrs, href: doc ? linkURL(collection, doc) : null }
          },
        })
      }
    } else if (isPolymorphic(field)) {
      // `{ relationTo, value }` (#327): each value from its own collection, with its access.
      const many = Array.isArray(value)
      const items = (many ? value : [value]).map(polymorphicValue)
      // Skip `{ [locale]: … }` maps (reads with `locale: 'all'`).
      if (items.some((item) => item === undefined)) continue
      const pairs = items as { relationTo: string; value: unknown }[]
      const found = new Map<string, ReadonlyMap<ID, RawDocument>>()
      let waiting = 0
      for (const relationTo of new Set(pairs.map((p) => p.relationTo))) {
        if (!bySlug.has(relationTo)) continue
        waiting++
        slots.push({
          collection: relationTo,
          ids: pairs.filter((p) => p.relationTo === relationTo).map((p) => p.value as ID),
          assign: (byId) => {
            found.set(relationTo, byId)
            if (--waiting > 0) return
            const filled = pairs
              .map((p) => {
                if (!bySlug.has(p.relationTo)) return p
                const doc = found.get(p.relationTo)?.get(p.value as ID)
                return doc ? { relationTo: p.relationTo, value: doc } : undefined
              })
              .filter((p) => p !== undefined)
            data[field.name] = many ? filled : (filled[0] ?? null)
          },
        })
      }
    } else if (field.type === 'relationship' || field.type === 'upload') {
      // Only ids are populated: skip `{ [locale]: … }` maps (reads with `locale: 'all'`).
      if (typeof value === 'object' && !Array.isArray(value)) continue
      const collection = relationTargets(field)[0] as string
      if (!bySlug.has(collection)) continue // built-in collections are populated from M2/M5
      if (Array.isArray(value)) {
        const ids = value as ID[]
        slots.push({
          collection,
          ids,
          assign: (byId) => {
            data[field.name] = ids.map((id) => byId.get(id)).filter((d) => d !== undefined)
          },
        })
      } else {
        const id = value as ID
        slots.push({
          collection,
          ids: [id],
          assign: (byId) => {
            data[field.name] = byId.get(id) ?? null
          },
        })
      }
    }
  }
}
