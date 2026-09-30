import { randomUUID } from 'node:crypto'
import type { EasyCMS, Where } from '@easy-cms/core'
import {
  type Breadcrumb,
  type Doc,
  type ID,
  idOf,
  type NestedCollection,
  type NestedSource,
} from './shared.js'

type Locale = string | null

/** Read options that give localized fields as `{ [locale]: value }`. */
const all = (source: NestedSource) => (source.locales.length > 0 ? { locale: 'all' } : {})

/** A text value in one locale, falling back to the default locale like reads do. */
function textIn(value: unknown, locale: Locale, source: NestedSource): string {
  if (value && typeof value === 'object') {
    const map = value as Doc
    const found = (locale !== null ? map[locale] : undefined) ?? map[source.defaultLocale ?? '']
    return typeof found === 'string' ? found : ''
  }
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''
}

function rowsIn(value: unknown, locale: Locale, source: NestedSource): Doc[] {
  if (Array.isArray(value)) return value as Doc[]
  if (value && typeof value === 'object') {
    const map = value as Doc
    const found = (locale !== null ? map[locale] : undefined) ?? map[source.defaultLocale ?? '']
    return Array.isArray(found) ? (found as Doc[]) : []
  }
  return []
}

const localesOf = (nested: NestedCollection, source: NestedSource): Locale[] =>
  nested.localized ? [...source.locales] : [null]

/**
 * The stored page as visitors see it: the live version, or the only one of a page that was
 * never published. A pending draft does not count: paths change when pages are published.
 */
export async function liveDoc(
  cms: EasyCMS,
  source: NestedSource,
  nested: NestedCollection,
  id: ID,
): Promise<Doc | null> {
  const options = { depth: 0, ...all(source) }
  const live = await cms.findById(nested.slug, id, options)
  if (live || !nested.drafts) return live
  // Not published: its only version is the draft, with nothing pending to mix in.
  return cms.findById(nested.slug, id, { ...options, draft: true })
}

/**
 * Pages whose parent is `id` (`null`: top-level pages; `undefined`: all pages), as stored live,
 * drafts that were never published included.
 */
export async function liveChildren(
  cms: EasyCMS,
  source: NestedSource,
  nested: NestedCollection,
  id: ID | null | undefined,
): Promise<Doc[]> {
  const where: Where = id === undefined ? {} : { [nested.parentField]: { equals: id } }
  const options = { limit: 0, depth: 0, sort: nested.sort, ...all(source) }
  const live = await cms.find(nested.slug, { ...options, where })
  if (!nested.drafts) return live.docs
  const unpublished = await cms.find(nested.slug, {
    ...options,
    where: { and: [where, { status: { equals: 'draft' } }] },
    draft: true,
  })
  return [...live.docs, ...unpublished.docs]
}

/** Every page below `id`, level by level (at most `maxDepth` levels). */
export async function descendants(cms: EasyCMS, nested: NestedCollection, id: ID): Promise<ID[]> {
  const found: ID[] = []
  const seen = new Set<string>([String(id)])
  let level: ID[] = [id]
  for (let depth = 0; level.length > 0 && depth <= nested.maxDepth; depth++) {
    const children = await cms.find(nested.slug, {
      where: { [nested.parentField]: { in: level } },
      limit: 0,
      depth: 0,
      draft: true,
    })
    level = []
    for (const child of children.docs) {
      const childId = child.id as ID
      if (seen.has(String(childId))) continue
      seen.add(String(childId))
      found.push(childId)
      level.push(childId)
    }
  }
  return found
}

export interface Trail {
  /** By locale, or under `null` without localized slugs. */
  readonly breadcrumbs: Map<Locale, (Breadcrumb & { id: string })[]>
  readonly path: Map<Locale, string | null>
}

/**
 * A page's breadcrumbs and path: its parent's (as stored live) plus its own step. `data` has
 * localized values as `{ [locale]: value }`, like hooks and `locale: 'all'` reads see them.
 */
export async function trailOf(
  cms: EasyCMS,
  source: NestedSource,
  nested: NestedCollection,
  data: Doc,
  selfId: ID | null,
  parent?: Doc | null,
): Promise<Trail> {
  const parentId = idOf(data[nested.parentField])
  const parentDoc =
    parent !== undefined
      ? parent
      : parentId === null
        ? null
        : await liveDoc(cms, source, nested, parentId)
  const breadcrumbs = new Map<Locale, (Breadcrumb & { id: string })[]>()
  const path = new Map<Locale, string | null>()
  for (const locale of localesOf(nested, source)) {
    const above = parentDoc ? rowsIn(parentDoc[nested.breadcrumbsField], locale, source) : []
    const parentPath = parentDoc ? textIn(parentDoc[nested.pathField], locale, source) : ''
    const slug = textIn(data[nested.slugField], locale, source)
    // A page without a slug (a draft) has no address yet, and neither do pages under it.
    const own = slug && (parentDoc === null || parentPath) ? `${parentPath}/${slug}` : null
    const label = textIn(data[nested.titleField], locale, source) || slug
    breadcrumbs.set(locale, [
      ...above.map((row) => ({
        id: randomUUID(),
        doc: idOf(row.doc),
        label: typeof row.label === 'string' ? row.label : '',
        url: typeof row.url === 'string' ? row.url : '',
      })),
      { id: randomUUID(), doc: selfId, label, url: own ?? '' },
    ])
    path.set(locale, own)
  }
  return { breadcrumbs, path }
}

/** The trail as field values: `{ [locale]: value }` when localized. */
export function trailData(nested: NestedCollection, trail: Trail): Doc {
  const value = <T>(map: Map<Locale, T>) =>
    nested.localized ? Object.fromEntries(map) : map.get(null)
  return {
    [nested.breadcrumbsField]: value(trail.breadcrumbs),
    [nested.pathField]: value(trail.path),
  }
}

/** Whether a stored page already has this trail (row ids aside). */
export function hasTrail(
  source: NestedSource,
  nested: NestedCollection,
  doc: Doc,
  trail: Trail,
): boolean {
  for (const locale of localesOf(nested, source)) {
    const stored = rowsIn(doc[nested.breadcrumbsField], locale, source).map((row) => [
      idOf(row.doc),
      row.label ?? '',
      row.url ?? '',
    ])
    const wanted = (trail.breadcrumbs.get(locale) ?? []).map((row) => [row.doc, row.label, row.url])
    if (JSON.stringify(stored) !== JSON.stringify(wanted)) return false
    const storedPath = textIn(doc[nested.pathField], locale, source) || null
    if (storedPath !== (trail.path.get(locale) ?? null)) return false
  }
  return true
}

/**
 * Brings the pages under `id` up to date with it; each saved page does the same for its own
 * children (through the plugin's hook). Returns how many pages were saved.
 */
export async function syncChildren(
  cms: EasyCMS,
  source: NestedSource,
  nested: NestedCollection,
  id: ID,
): Promise<number> {
  const parent = await liveDoc(cms, source, nested, id)
  if (!parent) return 0
  let saved = 0
  for (const child of await liveChildren(cms, source, nested, id)) {
    const trail = await trailOf(cms, source, nested, child, child.id as ID, parent)
    if (hasTrail(source, nested, child, trail)) continue
    // `live`: a pending draft stays pending; its trail is worked out again when it is published.
    await cms.update(nested.slug, child.id as ID, {}, { live: true })
    saved++
  }
  return saved
}
