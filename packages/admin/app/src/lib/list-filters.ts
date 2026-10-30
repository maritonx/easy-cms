import type { AdminField } from '@easy-cms/core'

/**
 * The list's filters: conditions joined with AND, kept in the URL the way the REST API reads a
 * `where` (`where[and][0][views][gte]=10`), so a link opens the same list and the conditions go to
 * the API as they are. Each condition is one field (a path, e.g. `seo.title`) and its operators.
 */
export type Condition = { readonly field: string; readonly ops: Readonly<Record<string, unknown>> }

/** A field the filters offer: top-level and in groups, by path, with its label's parts. */
export interface FilterField {
  readonly path: string
  readonly field: AdminField
  /** The labels of its group(s) and its own, for "SEO › Title". */
  readonly trail: readonly AdminField[]
}

/** How a condition reads, by the field's kind; each is one or two REST operators. */
export type FilterOp =
  | 'contains'
  | 'equals'
  | 'notEquals'
  | 'empty'
  | 'notEmpty'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'before'
  | 'after'
  | 'on'
  | 'yes'
  | 'no'
  | 'anyOf'
  | 'noneOf'

export type FilterKind = 'text' | 'number' | 'date' | 'boolean' | 'select' | 'relation'

const NOT_FILTERED = new Set(['array', 'blocks', 'richText', 'json', 'join', 'ui'])

/** When documents were made and changed: filterable as dates in every collection. */
const TIMESTAMPS: readonly AdminField[] = [
  { name: 'createdAt', type: 'date', label: { en: 'Created', th: 'สร้างเมื่อ' } },
  { name: 'updatedAt', type: 'date', label: { en: 'Updated', th: 'แก้ไขเมื่อ' } },
] as AdminField[]

/** The fields a user may filter by: readable ones (the schema has no others), not `admin.filter: false`. */
export function filterFields(fields: readonly AdminField[]): FilterField[] {
  const out: FilterField[] = []
  const walk = (list: readonly AdminField[], prefix: string, trail: readonly AdminField[]) => {
    for (const field of list) {
      if (field.noFilter || NOT_FILTERED.has(field.type)) continue
      if (field.type === 'group') {
        walk(field.fields ?? [], `${prefix}${field.name}.`, [...trail, field])
        continue
      }
      if (kindOf(field))
        out.push({ path: `${prefix}${field.name}`, field, trail: [...trail, field] })
    }
  }
  walk(fields, '', [])
  for (const stamp of TIMESTAMPS)
    if (!out.some((f) => f.path === stamp.name))
      out.push({ path: stamp.name, field: stamp, trail: [stamp] })
  return out
}

/** The kind of a field's conditions; field types added by plugins filter as the type they store. */
export function kindOf(field: AdminField): FilterKind | null {
  switch (field.type) {
    case 'text':
    case 'textarea':
    case 'email':
    case 'slug':
      return 'text'
    case 'number':
      return 'number'
    case 'date':
      return 'date'
    case 'boolean':
      return 'boolean'
    case 'select':
      return field.options?.length ? 'select' : null
    case 'relationship':
    case 'upload':
      return 'relation'
    default:
      return null
  }
}

export const OPS: Readonly<Record<FilterKind, readonly FilterOp[]>> = {
  text: ['contains', 'equals', 'empty', 'notEmpty'],
  number: ['equals', 'notEquals', 'gt', 'gte', 'lt', 'lte', 'between', 'empty', 'notEmpty'],
  date: ['before', 'after', 'on', 'between', 'empty', 'notEmpty'],
  boolean: ['yes', 'no'],
  select: ['anyOf', 'noneOf', 'empty', 'notEmpty'],
  relation: ['anyOf', 'empty', 'notEmpty'],
}

/** What an operator takes: nothing, one value, two (a range) or a list. */
export function valuesOf(op: FilterOp): 0 | 1 | 2 | 'list' {
  if (op === 'empty' || op === 'notEmpty' || op === 'yes' || op === 'no') return 0
  if (op === 'between') return 2
  if (op === 'anyOf' || op === 'noneOf') return 'list'
  return 1
}

// --- Time zones -------------------------------------------------------------------------------

/** Minutes `timeZone` is ahead of UTC at `ms` (the browser's zone when none). */
function offsetAt(ms: number, timeZone: string | undefined): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const asUTC = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  )
  return Math.round((asUTC - Math.floor(ms / 1000) * 1000) / 60_000)
}

/** The moment a day (`YYYY-MM-DD`) starts in `timeZone`, as an ISO string. */
export function dayStart(day: string, timeZone?: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const midnight = Date.UTC(y, m - 1, d)
  let ms = midnight - offsetAt(midnight, timeZone) * 60_000
  // Across a change of offset (daylight saving), once more with the offset of that moment.
  const second = offsetAt(ms, timeZone)
  ms = midnight - second * 60_000
  return new Date(ms).toISOString()
}

/** The day (`YYYY-MM-DD`) a moment falls on in `timeZone`. */
export function dayOf(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

/** The day after (`YYYY-MM-DD`), on the calendar. */
export function nextDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

/** Today, `days` days from it (negative: before), as `YYYY-MM-DD` in `timeZone`. */
export function today(timeZone?: string, days = 0, now = new Date()): string {
  const day = dayOf(now.toISOString(), timeZone)
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

// --- Conditions -------------------------------------------------------------------------------

/** A condition from what the panel collected; `null` when a value is missing. */
export function conditionOf(
  field: string,
  kind: FilterKind,
  op: FilterOp,
  values: readonly string[],
  timeZone?: string,
): Condition | null {
  const [a = '', b = ''] = values
  const need = valuesOf(op)
  if (need === 1 && a === '') return null
  if (need === 2 && (a === '' || b === '')) return null
  if (need === 'list' && values.length === 0) return null
  const day = (v: string) => dayStart(v, timeZone)
  const ops: Record<string, unknown> = (() => {
    switch (op) {
      case 'contains':
        return { like: a }
      case 'equals':
        return { equals: a }
      case 'notEquals':
        return { not_equals: a }
      case 'empty':
        return { exists: false }
      case 'notEmpty':
        return { exists: true }
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte':
        return { [op]: a }
      case 'between':
        return kind === 'date' ? { gte: day(a), lt: day(nextDay(b)) } : { gte: a, lte: b }
      case 'before':
        return { lt: day(a) }
      case 'after':
        return { gte: day(nextDay(a)) }
      case 'on':
        return { gte: day(a), lt: day(nextDay(a)) }
      case 'yes':
        return { equals: true }
      case 'no':
        return { equals: false }
      case 'anyOf':
        return { in: [...values] }
      case 'noneOf':
        return { not_in: [...values] }
    }
  })()
  return { field, ops }
}

/** How the panel shows a condition again: its operator and values. */
export function readCondition(
  condition: Condition,
  kind: FilterKind,
  timeZone?: string,
): { op: FilterOp; values: string[] } | null {
  const { ops } = condition
  const keys = Object.keys(ops).sort().join(',')
  const text = (v: unknown) => String(v)
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : String(v).split(','))
  const day = (v: unknown) => dayOf(String(v), timeZone)
  const before = (v: unknown) => {
    // The day before the first one excluded.
    const d = day(v)
    const [y, m, n] = d.split('-').map(Number) as [number, number, number]
    return new Date(Date.UTC(y, m - 1, n - 1)).toISOString().slice(0, 10)
  }
  if (keys === 'exists')
    return { op: String(ops.exists) === 'false' ? 'empty' : 'notEmpty', values: [] }
  if (keys === 'like') return { op: 'contains', values: [text(ops.like)] }
  if (keys === 'in') return { op: 'anyOf', values: list(ops.in) }
  if (keys === 'not_in') return { op: 'noneOf', values: list(ops.not_in) }
  // One value, as older links (`?f_form=3`) and the status menu write it.
  if ((kind === 'select' || kind === 'relation') && keys === 'equals')
    return { op: 'anyOf', values: [text(ops.equals)] }
  if (kind === 'boolean' && keys === 'equals')
    return { op: String(ops.equals) === 'true' ? 'yes' : 'no', values: [] }
  if (kind === 'date') {
    if (keys === 'lt') return { op: 'before', values: [day(ops.lt)] }
    if (keys === 'gte') return { op: 'after', values: [before(ops.gte)] }
    if (keys === 'gte,lt') {
      const from = day(ops.gte)
      const to = before(ops.lt)
      return from === to ? { op: 'on', values: [from] } : { op: 'between', values: [from, to] }
    }
    return null
  }
  if (keys === 'gte,lte') return { op: 'between', values: [text(ops.gte), text(ops.lte)] }
  if (keys === 'equals') return { op: 'equals', values: [text(ops.equals)] }
  if (keys === 'not_equals') return { op: 'notEquals', values: [text(ops.not_equals)] }
  for (const op of ['gt', 'gte', 'lt', 'lte'] as const)
    if (keys === op) return { op, values: [text(ops[op])] }
  return null
}

// --- The URL ----------------------------------------------------------------------------------

const PREFIX = 'where[and]['

type Query = Readonly<Record<string, unknown>>

/**
 * The conditions in a list's URL: `where[and][<i>][<field>][<op>]=<value>` (lists comma-joined,
 * as the REST API reads them), then the older `?status=` and `?f_<field>=` links, which plugins
 * still make (e.g. a form's submissions: `?f_form=3`).
 */
export function readConditions(query: Query): Condition[] {
  const byIndex = new Map<number, { field: string; ops: Record<string, unknown> }>()
  for (const [key, raw] of Object.entries(query)) {
    if (!key.startsWith(PREFIX) || typeof raw !== 'string') continue
    const match = /^where\[and\]\[(\d+)\]\[([^\]]+)\]\[([a-z_]+)\]$/.exec(key)
    if (!match) continue
    const [, index, field, op] = match as unknown as [string, string, string, string]
    const entry = byIndex.get(Number(index)) ?? { field, ops: {} }
    if (entry.field !== field) continue
    entry.ops[op] = op === 'in' || op === 'not_in' ? (raw === '' ? [] : raw.split(',')) : raw
    byIndex.set(Number(index), entry)
  }
  const out: Condition[] = [...byIndex.entries()].sort(([a], [b]) => a - b).map(([, c]) => c)
  const has = (field: string) => out.some((c) => c.field === field)
  if (typeof query.status === 'string' && query.status && !has('status'))
    out.push({ field: 'status', ops: { equals: query.status } })
  for (const [key, raw] of Object.entries(query)) {
    if (!key.startsWith('f_') || typeof raw !== 'string' || raw === '') continue
    // Any field, not only the ones offered: a link to one document's related list (`?f_form=3`).
    const name = key.slice(2)
    if (name && !has(name)) out.push({ field: name, ops: { equals: raw } })
  }
  return out
}

/** The URL's query for the conditions: the `where` keys, set or cleared, and old keys cleared. */
export function writeConditions(
  conditions: readonly Condition[],
  query: Query,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {}
  for (const key of Object.keys(query))
    if (key.startsWith(PREFIX) || key.startsWith('f_') || key === 'status') out[key] = undefined
  conditions.forEach((condition, i) => {
    for (const [op, value] of Object.entries(condition.ops))
      out[`${PREFIX}${i}][${condition.field}][${op}]`] = Array.isArray(value)
        ? value.join(',')
        : String(value)
  })
  return out
}

/** The conditions as one `where` for the REST API (with the list's other parts, if any). */
export function whereOf(conditions: readonly Condition[]): Record<string, unknown>[] {
  return conditions.map((c) => ({ [c.field]: c.ops }))
}
