import {
  type AuthUser,
  type ID,
  isSystemAdmin,
  type RequestContext,
  type Where,
} from '../access.js'
import { INTERNAL_COLLECTIONS, SAVED_VIEWS } from '../builtins.js'
import { ForbiddenError, NotFoundError, ValidationError } from '../errors.js'
import type { EasyCMS } from '../local-api.js'

// Saved views of the admin's lists (#87): a user's own, and those shared with everyone who may read
// the collection. Kept in the internal `saved-views` collection, written only from here.

type Who = { user: AuthUser; context: RequestContext }
type Data = Record<string, unknown>

/** What a view restores: the list's URL query, and what the browser keeps per list. */
export interface SavedViewState {
  /** Filters (`where[and]…`), `q`, `sort`, `scheduled`, `type`, `calendar`. */
  readonly query: Readonly<Record<string, string>>
  readonly columns?: readonly string[]
  readonly pageSize?: number
  readonly density?: 'comfortable' | 'compact'
}

export interface SavedView {
  readonly id: ID
  readonly name: string
  readonly shared: boolean
  /** The user's own: they may change it (admins may change shared ones too). */
  readonly mine: boolean
  readonly editable: boolean
  readonly state: SavedViewState
}

/** A user's own views per collection. */
export const MAX_OWN_VIEWS = 50
const MAX_STATE = 10_000
/** The list's query parameters a view keeps; the page, the open document and the like aren't. */
const QUERY_KEY = /^(where\[and\]\[\d+\]\[[^\]]+\]\[[a-z_]+\]|q|sort|scheduled|type|calendar)$/

const userKey = (user: AuthUser) => String(user.id)
const stamps = () => {
  const now = new Date().toISOString()
  return { createdAt: now, updatedAt: now }
}

/** The collection, when the user may read it; views of others aren't theirs to see. */
async function readable(cms: EasyCMS, slug: string, who: Who) {
  if (INTERNAL_COLLECTIONS.has(slug) || !cms.config.collections.some((c) => c.slug === slug))
    throw new NotFoundError('collections', slug)
  try {
    await cms.count(slug, { ...who, overrideAccess: false, where: { id: { exists: false } } })
  } catch {
    throw new ForbiddenError()
  }
}

function cleanState(raw: unknown): SavedViewState {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Data
  const query: Record<string, string> = {}
  const rawQuery = (input.query && typeof input.query === 'object' ? input.query : {}) as Data
  for (const [key, value] of Object.entries(rawQuery))
    if (QUERY_KEY.test(key) && typeof value === 'string') query[key] = value
  const columns = Array.isArray(input.columns)
    ? input.columns.filter((c): c is string => typeof c === 'string').slice(0, 50)
    : undefined
  const pageSize = [10, 25, 50, 100].includes(input.pageSize as number)
    ? (input.pageSize as number)
    : undefined
  const density: SavedViewState['density'] =
    input.density === 'compact' || input.density === 'comfortable' ? input.density : undefined
  const state: SavedViewState = {
    query,
    ...(columns ? { columns } : {}),
    ...(pageSize ? { pageSize } : {}),
    ...(density ? { density } : {}),
  }
  if (JSON.stringify(state).length > MAX_STATE)
    throw new ValidationError(SAVED_VIEWS, [{ field: 'state', message: 'is too large' }])
  return state
}

function toView(row: Data, user: AuthUser): SavedView {
  const mine = row.user === userKey(user)
  return {
    id: row.id as ID,
    name: String(row.name ?? ''),
    shared: row.shared === true,
    mine,
    editable: mine || (row.shared === true && isSystemAdmin(user)),
    state: cleanState(row.state),
  }
}

async function rows(cms: EasyCMS, slug: string, where: Where): Promise<Data[]> {
  const found = await cms.db.find({
    collection: SAVED_VIEWS,
    where: { and: [{ collection: { equals: slug } }, where] },
    sort: ['id'],
    limit: 0,
    page: 1,
  })
  return found.docs as Data[]
}

/** The user's views of a collection, shared ones first, and the one it opens with. */
export async function listViews(cms: EasyCMS, slug: string, who: Who) {
  await readable(cms, slug, who)
  const key = userKey(who.user)
  const found = await rows(cms, slug, {
    or: [
      { and: [{ kind: { equals: 'view' } }, { shared: { equals: true } }] },
      { user: { equals: key } },
    ],
  })
  const views = found.filter((r) => r.kind === 'view').map((r) => toView(r, who.user))
  const preference = found.find((r) => r.kind === 'default' && r.user === key)
  return {
    views: [...views.filter((v) => v.shared), ...views.filter((v) => !v.shared)],
    default: typeof preference?.target === 'string' ? preference.target : null,
  }
}

function checkName(name: unknown): string {
  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (trimmed === '' || trimmed.length > 60)
    throw new ValidationError(SAVED_VIEWS, [
      { field: 'name', message: 'must be 1 to 60 characters' },
    ])
  return trimmed
}

/** Names are unique among the user's own views and among shared ones. */
async function checkUnique(
  cms: EasyCMS,
  slug: string,
  who: Who,
  name: string,
  shared: boolean,
  self?: ID,
) {
  const same = await rows(cms, slug, {
    and: [
      { kind: { equals: 'view' } },
      { name: { equals: name } },
      shared ? { shared: { equals: true } } : { user: { equals: userKey(who.user) } },
    ],
  })
  if (same.some((r) => r.id !== self && (shared || r.shared !== true)))
    throw new ValidationError(SAVED_VIEWS, [
      { field: 'name', message: `there is already a view named "${name}"` },
    ])
}

export async function createView(cms: EasyCMS, slug: string, who: Who, body: unknown) {
  await readable(cms, slug, who)
  const input = (body ?? {}) as Data
  const name = checkName(input.name)
  const shared = input.shared === true
  await checkUnique(cms, slug, who, name, shared)
  const own = await rows(cms, slug, {
    and: [{ kind: { equals: 'view' } }, { user: { equals: userKey(who.user) } }],
  })
  if (own.length >= MAX_OWN_VIEWS)
    throw new ValidationError(SAVED_VIEWS, [
      { field: 'name', message: `at most ${MAX_OWN_VIEWS} views per list` },
    ])
  const row = await cms.db.create({
    collection: SAVED_VIEWS,
    data: {
      collection: slug,
      user: userKey(who.user),
      kind: 'view',
      name,
      shared,
      state: cleanState(input.state),
      target: null,
      ...stamps(),
    },
  })
  return toView(row as Data, who.user)
}

async function editable(cms: EasyCMS, slug: string, who: Who, id: ID) {
  await readable(cms, slug, who)
  const row = (await cms.db.findById({ collection: SAVED_VIEWS, id })) as Data | null
  if (!row || row.collection !== slug || row.kind !== 'view')
    throw new NotFoundError(SAVED_VIEWS, id)
  const view = toView(row, who.user)
  if (!view.mine && !view.shared) throw new NotFoundError(SAVED_VIEWS, id)
  if (!view.editable) throw new ForbiddenError('Only its owner or an admin can change this view')
  return row
}

export async function updateView(cms: EasyCMS, slug: string, who: Who, id: ID, body: unknown) {
  const row = await editable(cms, slug, who, id)
  const input = (body ?? {}) as Data
  const name = input.name === undefined ? String(row.name) : checkName(input.name)
  const shared = input.shared === undefined ? row.shared === true : input.shared === true
  if (name !== row.name || shared !== (row.shared === true))
    await checkUnique(cms, slug, who, name, shared, id)
  const updated = await cms.db.update({
    collection: SAVED_VIEWS,
    id,
    // The whole row, as the adapter writes it.
    data: {
      ...row,
      name,
      shared,
      ...(input.state !== undefined ? { state: cleanState(input.state) } : {}),
      updatedAt: new Date().toISOString(),
    },
  })
  return toView(updated as Data, who.user)
}

export async function deleteView(cms: EasyCMS, slug: string, who: Who, id: ID) {
  await editable(cms, slug, who, id)
  await cms.db.delete({ collection: SAVED_VIEWS, id })
  return { deleted: 1 }
}

/** The view a user opens the collection with: a view's id, `config:<id>`, or `null` for none. */
export async function setDefaultView(cms: EasyCMS, slug: string, who: Who, body: unknown) {
  await readable(cms, slug, who)
  const raw = (body ?? {}) as Data
  const target = raw.view === null || raw.view === undefined ? null : String(raw.view)
  const key = userKey(who.user)
  const current = await rows(cms, slug, {
    and: [{ kind: { equals: 'default' } }, { user: { equals: key } }],
  })
  for (const row of current) await cms.db.delete({ collection: SAVED_VIEWS, id: row.id as ID })
  if (target !== null)
    await cms.db.create({
      collection: SAVED_VIEWS,
      data: {
        collection: slug,
        user: key,
        kind: 'default',
        name: null,
        shared: false,
        state: null,
        target,
        ...stamps(),
      },
    })
  return { default: target }
}
