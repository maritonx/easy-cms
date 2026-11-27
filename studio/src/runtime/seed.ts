/**
 * Sample documents, so the admin opens with something in it: a few per collection of the
 * config, made from each field's type. A collection that has documents already (from before the
 * config changed) is left as it is.
 */
import type { Field } from '@easy-cms/core'

type Doc = Record<string, unknown>
type Id = string | number

/** What seeding needs of the CMS: the Local API, with access off. */
export interface SeedTarget {
  find(collection: string, options: { limit: number }): Promise<{ totalDocs: number; docs: Doc[] }>
  create(collection: string, data: Doc): Promise<Doc>
}

export interface SeedCollection {
  readonly slug: string
  readonly fields: readonly Field[]
  readonly drafts?: unknown
}

const PER_COLLECTION = 6
const TITLES = [
  'Getting started with Easy CMS',
  'Ten small things that make a site fast',
  'Writing for people who skim',
  'A field guide to content models',
  'What we learned shipping weekly',
  'Designing a calm admin',
  'Notes from the road',
  'Why drafts matter',
]
const NAMES = ['Ann Lee', 'Somchai Dee', 'Maya Chen', 'Lukas Weber', 'Nok Suda', 'Sam Rivera']
const WORDS =
  'Easy CMS keeps the content model in code, next to the app that shows it, so the two never drift apart.'

const labelOf = (field: Field): string => {
  const label = (field as { label?: unknown }).label
  if (typeof label === 'string') return label
  if (label && typeof label === 'object') return String(Object.values(label)[0] ?? field.name)
  return field.name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())
}

const paragraph = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

/** A value for one field of the n-th document; `undefined` leaves the field out. */
function valueFor(field: Field, n: number, ids: Map<string, Id[]>): unknown {
  const name = field.name.toLowerCase()
  switch (field.type) {
    case 'text':
      if (/title|headline|heading/.test(name)) return TITLES[n % TITLES.length]
      if (/name/.test(name)) return NAMES[n % NAMES.length]
      return `${labelOf(field)} ${n + 1}`
    case 'textarea':
      return WORDS
    case 'email':
      return `person${n + 1}@example.com`
    case 'number': {
      const { min = 0, max } = field as { min?: number; max?: number }
      const value = min + (n + 1) * 10
      return max === undefined ? value : Math.min(value, max)
    }
    case 'boolean':
      return n % 2 === 0
    case 'date':
      return new Date(Date.now() - n * 86_400_000).toISOString()
    case 'select': {
      const options = (field as { options: readonly (string | { value: string })[] }).options
      const pick = options[n % options.length]
      const value = typeof pick === 'string' ? pick : pick?.value
      if (value === undefined) return undefined
      return (field as { hasMany?: boolean }).hasMany ? [value] : value
    }
    case 'richText':
      return paragraph(WORDS)
    case 'json':
      return {}
    case 'relationship': {
      const to = (field as { to: string | readonly string[] }).to
      if (typeof to !== 'string') return undefined
      const targets = ids.get(to) ?? []
      const id = targets[n % Math.max(targets.length, 1)]
      if (id === undefined) return undefined
      return (field as { hasMany?: boolean }).hasMany ? [id] : id
    }
    case 'group':
      return docFor((field as { fields: readonly Field[] }).fields, n, ids)
    case 'array':
      return [docFor((field as { fields: readonly Field[] }).fields, n, ids)]
    default:
      // slug (made from another field), upload, blocks, ui, and field types from packages.
      return undefined
  }
}

function docFor(fields: readonly Field[], n: number, ids: Map<string, Id[]>): Doc {
  const doc: Doc = {}
  for (const field of fields) {
    if (!('name' in field) || !field.name) continue
    const value = valueFor(field, n, ids)
    if (value !== undefined) doc[field.name] = value
  }
  return doc
}

/** Collections a relationship of `collection` points to, inside `slugs`. */
function targetsOf(collection: SeedCollection, slugs: Set<string>): string[] {
  const out: string[] = []
  const walk = (fields: readonly Field[]) => {
    for (const field of fields) {
      const to = (field as { to?: unknown }).to
      if (field.type === 'relationship' && typeof to === 'string' && slugs.has(to)) out.push(to)
      const inner = (field as { fields?: readonly Field[] }).fields
      if (inner) walk(inner)
    }
  }
  walk(collection.fields)
  return out
}

/** Seeds the collections that are empty; returns how many documents were made, and problems. */
export async function seed(
  cms: SeedTarget,
  collections: readonly SeedCollection[],
): Promise<{ created: number; problems: string[] }> {
  const slugs = new Set(collections.map((c) => c.slug))
  // Collections others point to first, so links have something to point at.
  const ordered = [...collections].sort(
    (a, b) => targetsOf(a, slugs).length - targetsOf(b, slugs).length,
  )
  const ids = new Map<string, Id[]>()
  const problems: string[] = []
  let created = 0
  for (const collection of ordered) {
    const existing = await cms.find(collection.slug, { limit: PER_COLLECTION })
    ids.set(
      collection.slug,
      existing.docs.map((d) => d.id as Id),
    )
    if (existing.totalDocs > 0) continue
    for (let n = 0; n < PER_COLLECTION; n++) {
      const data = docFor(collection.fields, n, ids)
      if (collection.drafts) data.status = n === PER_COLLECTION - 1 ? 'draft' : 'published'
      try {
        const doc = await cms.create(collection.slug, data)
        ids.get(collection.slug)?.push(doc.id as Id)
        created++
      } catch (error) {
        problems.push(`${collection.slug}: ${(error as Error).message}`)
        break
      }
    }
  }
  return { created, problems }
}
