import type { CollectionView, Where } from '@easy-cms/core'
import { api } from './api'
import { type Condition, writeConditions } from './list-filters'

/** What a saved view restores (#87): the list's URL query, and what the browser keeps per list. */
export interface ViewState {
  query: Record<string, string>
  columns?: string[]
  pageSize?: number
  density?: 'comfortable' | 'compact'
}

export interface SavedView {
  id: number | string
  name: string
  shared: boolean
  mine: boolean
  editable: boolean
  state: ViewState
}

/** A tab above the list: the config's views (`config:<id>`), shared ones, then the user's own. */
export interface ViewTab {
  key: string
  name: string
  kind: 'config' | 'shared' | 'own'
  editable: boolean
  shared: boolean
  state: ViewState
}

/** The query parameters a view keeps; the page, the open document and the like are not. */
const VIEW_KEY = /^(where\[and\]\[\d+\]\[[^\]]+\]\[[a-z_]+\]|q|sort|scheduled|type|calendar)$/

/** The parts of a list's URL query a view keeps. */
export function viewQuery(query: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(query))
    if (VIEW_KEY.test(key) && typeof value === 'string' && value !== '') out[key] = value
  return out
}

/** Whether two states show the same list. */
export function sameState(a: ViewState, b: ViewState): boolean {
  const norm = (s: ViewState) =>
    JSON.stringify({
      query: Object.fromEntries(Object.entries(s.query).sort(([x], [y]) => x.localeCompare(y))),
      columns: s.columns ?? null,
      pageSize: s.pageSize ?? null,
      density: s.density ?? null,
    })
  return norm(a) === norm(b)
}

/**
 * The filter panel's conditions in a `where` from the config: fields with their operators, at
 * the top or in `and`. Anything else (`or`) isn't a condition the panel can show.
 */
function conditionsOf(where: Where | undefined): Condition[] {
  if (!where) return []
  const out: Condition[] = []
  for (const [key, value] of Object.entries(where)) {
    if (key === 'and' && Array.isArray(value)) out.push(...value.flatMap((w) => conditionsOf(w)))
    else if (key !== 'or' && value && typeof value === 'object' && !Array.isArray(value))
      out.push({ field: key, ops: value as Record<string, unknown> })
  }
  return out
}

/** A view from the config (`admin.views`) as a state. */
export function configState(view: CollectionView): ViewState {
  const query: Record<string, string> = {}
  for (const [key, value] of Object.entries(writeConditions(conditionsOf(view.where), {})))
    if (value !== undefined) query[key] = value
  if (view.search) query.q = view.search
  if (view.sort) query.sort = view.sort
  return {
    query,
    ...(view.columns ? { columns: [...view.columns] } : {}),
    ...(view.pageSize ? { pageSize: view.pageSize } : {}),
    ...(view.density ? { density: view.density } : {}),
  }
}

const base = (slug: string) => `/admin/ui/views/${encodeURIComponent(slug)}`

export const loadViews = (slug: string) =>
  api<{ views: SavedView[]; default: string | null }>('GET', base(slug))
export const createView = (
  slug: string,
  body: { name: string; shared: boolean; state: ViewState },
) => api<SavedView>('POST', base(slug), body)
export const updateView = (
  slug: string,
  id: SavedView['id'],
  body: Partial<{ name: string; shared: boolean; state: ViewState }>,
) => api<SavedView>('PATCH', `${base(slug)}/${id}`, body)
export const deleteView = (slug: string, id: SavedView['id']) =>
  api<{ deleted: number }>('DELETE', `${base(slug)}/${id}`)
export const setDefaultView = (slug: string, view: string | null) =>
  api<{ default: string | null }>('PUT', `${base(slug)}/default`, { view })
