import type { Field } from '@easy-cms/core'
import { QueryError, type Where, type WhereOperators } from '@easy-cms/core'
import { isPolymorphic, parseId, TRIGRAM_LIKE_MIN } from '@easy-cms/core/internal'
import {
  and,
  asc,
  desc,
  eq,
  exists,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  not,
  notInArray,
  or,
  type SQL,
  sql,
} from 'drizzle-orm'
import type { AnyColumn, Dialect, DrizzleDb, JsonElement, JsonValueType } from './dialect.js'
import type { ChildModel, SchemaLocalization, TableModel } from './schema.js'

const OPERATORS = new Set([
  'equals',
  'not_equals',
  'in',
  'not_in',
  'gt',
  'gte',
  'lt',
  'lte',
  'like',
  'exists',
])

const SYSTEM_COLUMNS: Record<string, string> = {
  id: 'id',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
}

/**
 * A value inside the blocks of a blocks field. `lists` are the nested lists (arrays, blocks,
 * hasMany values) to step into, each relative to the element before; `path` is the value in the
 * innermost element, or `null` when only an element's existence is tested.
 */
interface BlockValue {
  readonly lists: readonly (readonly string[])[]
  readonly path: readonly string[] | null
  readonly type: JsonValueType
  readonly field: Field | undefined
}

type Target =
  | {
      kind: 'column'
      column: AnyColumn
      field: Field | undefined
      /** A relationship to several collections named without `.relationTo` or `.value`. */
      bare?: readonly string[]
      /** `link.<collection>` (#327): the value column, for documents of that collection. */
      collection?: { slug: string; column: AnyColumn }
    }
  | { kind: 'child'; child: ChildModel; rest: string[]; locale?: string | undefined }
  | { kind: 'blocks'; column: AnyColumn; value: BlockValue }

const col = (model: TableModel, name: string) => model.table[name] as AnyColumn

const PARTS = new Set(['relationTo', 'value'])

/**
 * `link.relationTo`, `link.value` or `link.<collection>` (that collection's documents, by id) of
 * a relationship to several collections (#327).
 */
function polymorphicPart(
  segment: string | undefined,
  shown: string,
  to: readonly string[],
): 'relationTo' | 'value' | { collection: string } {
  if (segment !== undefined && PARTS.has(segment)) return segment as 'relationTo' | 'value'
  if (segment !== undefined && to.includes(segment)) return { collection: segment }
  throw new QueryError(
    `"${shown}" links to several collections: query "${shown}.relationTo" and "${shown}.value", or "${shown}.<collection>" (${to.map((t) => `"${shown}.${t}"`).join(', ')})`,
  )
}

const ID_FIELD: Field = { name: 'id', type: 'relationship', to: '' }
const LIKE_TYPES = new Set(['text', 'textarea', 'email', 'slug', 'select'])

const JSON_TYPES: Partial<Record<Field['type'], JsonValueType>> = {
  number: 'number',
  boolean: 'boolean',
  relationship: 'integer',
  upload: 'integer',
}

/**
 * Resolves a path inside JSON rows: `blockType`, `heading`, `heading.en`, `seo.title`, and
 * nested lists (`items.title`, `tags`, `inner.blockType`). In blocks, a field name means that
 * field in whichever block has it.
 */
function resolveJsonValue(
  fields: readonly Field[],
  rest: string[],
  shown: string,
  localization: SchemaLocalization | null,
  blocks: boolean,
): BlockValue {
  if (rest.length === 0) return { lists: [], path: null, type: 'text', field: undefined }
  if (blocks && rest.length === 1 && rest[0] === 'blockType')
    return { lists: [], path: ['blockType'], type: 'text', field: undefined }
  let list = fields
  const path: string[] = []
  for (let i = 0; i < rest.length; i++) {
    const segment = rest[i] as string
    const field = list.find((f) => f.name === segment)
    const at = [shown, ...rest.slice(0, i + 1)].join('.')
    if (!field) throw new QueryError(`Unknown field "${at}"`)
    path.push(segment)
    if (field.type === 'group') {
      list = field.fields
      continue
    }
    if (field.type === 'json' || field.type === 'richText')
      throw new QueryError(`Cannot query "${at}": ${field.type} fields are not queryable`)
    // Localized values inside JSON rows are stored as `{ [locale]: value }`.
    let next = i + 1
    if (field.localized && localization) {
      const named = rest[next] !== undefined && localization.locales.includes(rest[next] as string)
      path.push(named ? (rest[next] as string) : localization.defaultLocale)
      if (named) next++
    }
    const inner = rest.slice(next)
    const shownHere = [shown, ...rest.slice(0, next)].join('.')
    if (isPolymorphic(field)) {
      // Stored as `{ relationTo, value }` (#327), one or a list of them.
      if (inner.length > 1) throw new QueryError(`Cannot query inside "${shownHere}"`)
      const part = polymorphicPart(inner[0], shownHere, field.to)
      if (typeof part === 'object')
        throw new QueryError(
          `Inside blocks, query "${shownHere}.relationTo" and "${shownHere}.value"`,
        )
      const value =
        part === 'value'
          ? { type: 'integer' as const, field }
          : { type: 'text' as const, field: undefined }
      return field.hasMany
        ? { lists: [path], path: [part], ...value }
        : { lists: [], path: [...path, part], ...value }
    }
    if ('hasMany' in field && field.hasMany === true) {
      if (inner.length > 0) throw new QueryError(`Cannot query inside "${shownHere}"`)
      return { lists: [path], path: [], type: JSON_TYPES[field.type] ?? 'text', field }
    }
    if (field.type === 'array' || field.type === 'blocks') {
      const rows =
        field.type === 'array' ? field.fields : field.blocks.flatMap((block) => block.fields)
      const value = resolveJsonValue(rows, inner, shownHere, localization, field.type === 'blocks')
      return { ...value, lists: [path, ...value.lists] }
    }
    if (inner.length > 0) throw new QueryError(`Cannot query inside "${at}"`)
    return { lists: [], path, type: JSON_TYPES[field.type] ?? 'text', field }
  }
  throw new QueryError(`"${[shown, ...rest].join('.')}" is a group; query one of its fields`)
}

function resolvePath(
  model: TableModel,
  segments: string[],
  drafts: boolean,
  localization: SchemaLocalization | null = null,
): Target {
  const [first] = segments
  if (first === undefined) throw new QueryError('empty field path')

  if (segments.length === 1) {
    const system = SYSTEM_COLUMNS[first]
    if (system && (model.kind === 'root' || first === 'id')) {
      // Ids of root documents are integers: coerce like relationship values.
      const field = first === 'id' && model.kind !== 'array' ? ID_FIELD : undefined
      return { kind: 'column', column: col(model, system), field }
    }
    if (first === 'status' && drafts && model.kind === 'root') {
      return { kind: 'column', column: col(model, 'status'), field: undefined }
    }
  }

  // Walk fields, descending into groups, until we reach a column or a child table.
  let fields = model.fields
  const path: string[] = []
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i] as string
    const field = fields.find((f) => f.name === segment)
    const shown = segments.slice(0, i + 1).join('.')
    if (!field) throw new QueryError(`Unknown field "${shown}"`)
    path.push(segment)

    if (field.type === 'group') {
      fields = field.fields
      continue
    }
    const child = model.children.find((c) => c.path.join('.') === path.join('.'))
    if (child?.locales) {
      // Localized list: `tags.en` / `links.en.label`; without a locale, the default one.
      const next = segments[i + 1]
      const named = next !== undefined && child.locales.includes(next)
      return {
        kind: 'child',
        child,
        rest: segments.slice(i + (named ? 2 : 1)),
        locale: named ? next : child.defaultLocale,
      }
    }
    if (child) return { kind: 'child', child, rest: segments.slice(i + 1) }

    // Localized fields: `title.en` names the locale; plain `title` means the default locale.
    let locale = field.localized ? segments[i + 1] : undefined
    if (field.type === 'blocks' && locale !== undefined && !localization?.locales.includes(locale))
      locale = undefined // `layout.heading`: a field inside the blocks, not a locale
    const last = field.localized && locale !== undefined ? i + 1 : i
    const same = (c: TableModel['columns'][number]) => c.path.join('.') === path.join('.')
    const columnOf = () =>
      field.localized
        ? model.columns.find(
            (c) => same(c) && (locale === undefined ? c.defaultLocale : c.locale === locale),
          )
        : model.columns.find(same)
    if (field.type === 'blocks') {
      const column = columnOf()
      if (!column) throw new QueryError(`Unknown locale "${locale}" for "${shown}"`)
      const rest = segments.slice(last + 1)
      const rows = field.blocks.flatMap((block) => block.fields)
      const value = resolveJsonValue(rows, rest, shown, localization, true)
      return { kind: 'blocks', column: col(model, column.column), value }
    }
    if (isPolymorphic(field)) {
      // `link.relationTo`, `link.value` (#327); `link` alone only with `exists`.
      if (last + 1 < segments.length - 1)
        throw new QueryError(`Cannot query inside "${segments.slice(0, last + 2).join('.')}"`)
      const shownField = segments.slice(0, last + 1).join('.')
      const named = segments[last + 1]
      const part = named === undefined ? 'value' : polymorphicPart(named, shownField, field.to)
      const columnOfPart = (wanted: 'relationTo' | 'value') => {
        const found = model.columns.find(
          (c) =>
            same(c) &&
            c.part === wanted &&
            (!field.localized || (locale === undefined ? c.defaultLocale : c.locale === locale)),
        )
        if (!found) throw new QueryError(`Unknown locale "${locale}" for "${shown}"`)
        return col(model, found.column)
      }
      if (typeof part === 'object')
        return {
          kind: 'column',
          column: columnOfPart('value'),
          field,
          collection: { slug: part.collection, column: columnOfPart('relationTo') },
        }
      return {
        kind: 'column',
        column: columnOfPart(part),
        field: part === 'value' ? field : undefined,
        ...(named === undefined ? { bare: field.to } : {}),
      }
    }
    if (last < segments.length - 1) {
      throw new QueryError(`Cannot query inside "${shown}" (${field.type} field)`)
    }
    if (field.type === 'json' || field.type === 'richText') {
      throw new QueryError(`Cannot query "${shown}": ${field.type} fields are not queryable`)
    }
    const column = columnOf()
    if (field.localized && !column)
      throw new QueryError(`Unknown locale "${locale}" for "${shown}"`)
    if (!column) throw new QueryError(`Unknown field "${shown}"`)
    return { kind: 'column', column: col(model, column.column), field }
  }
  throw new QueryError(`"${segments.join('.')}" is a group; query one of its fields`)
}

function coerce(field: Field | undefined, value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (field?.type === 'relationship' || field?.type === 'upload') return parseId(value) ?? value
  if (field?.type === 'number' && typeof value === 'string' && value.trim() !== '')
    return Number(value)
  if (field?.type === 'boolean' && (value === 'true' || value === 'false')) return value === 'true'
  return value
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`)

function operatorSQL(
  dialect: Dialect,
  column: AnyColumn,
  field: Field | undefined,
  op: string,
  raw: unknown,
  path: string,
): SQL {
  const list = (value: unknown) => {
    if (!Array.isArray(value)) throw new QueryError(`"${path}.${op}" must be an array`)
    return value.map((v) => coerce(field, v))
  }
  const value = coerce(field, raw)
  switch (op) {
    case 'equals':
      return value === null ? isNull(column) : eq(column, value)
    case 'not_equals':
      return value === null ? isNotNull(column) : (or(ne(column, value), isNull(column)) as SQL)
    case 'in': {
      const values = list(raw)
      return values.length === 0 ? sql`0 = 1` : inArray(column, values)
    }
    case 'not_in': {
      const values = list(raw)
      return values.length === 0
        ? sql`1 = 1`
        : (or(notInArray(column, values), isNull(column)) as SQL)
    }
    case 'gt':
      return gt(column, value)
    case 'gte':
      return gte(column, value)
    case 'lt':
      return lt(column, value)
    case 'lte':
      return lte(column, value)
    case 'like':
      if (typeof raw !== 'string') throw new QueryError(`"${path}.like" must be a string`)
      if (field && !LIKE_TYPES.has(field.type))
        throw new QueryError(`"like" works on text fields, not "${path}"`)
      if (field?.index === 'trigram' && dialect.trigramIndex && [...raw].length < TRIGRAM_LIKE_MIN)
        throw new QueryError(
          `"${path}.like" needs at least ${TRIGRAM_LIKE_MIN} characters: its trigram index can't find shorter text`,
        )
      return dialect.like(column, `%${escapeLike(raw)}%`)
    case 'exists':
      return raw === false ? isNull(column) : isNotNull(column)
    default:
      throw new QueryError(`Unknown operator "${op}" on "${path}"`)
  }
}

export class WhereBuilder {
  constructor(
    private readonly db: DrizzleDb,
    private readonly dialect: Dialect,
    private readonly drafts: boolean,
    private readonly localization: SchemaLocalization | null = null,
  ) {}

  build(model: TableModel, where: Where | undefined): SQL | undefined {
    if (where === undefined) return undefined
    if (typeof where !== 'object' || where === null || Array.isArray(where)) {
      throw new QueryError('where must be an object')
    }
    const parts: SQL[] = []
    for (const [key, value] of Object.entries(where)) {
      if (value === undefined) continue
      if (key === 'and' || key === 'or') {
        if (!Array.isArray(value)) throw new QueryError(`"${key}" must be an array`)
        const inner = (value as Where[])
          .map((w) => this.build(model, w))
          .filter((s) => s !== undefined)
        if (inner.length > 0) parts.push((key === 'and' ? and(...inner) : or(...inner)) as SQL)
        continue
      }
      parts.push(this.field(model, key, value as WhereOperators))
    }
    return parts.length === 0 ? undefined : parts.length === 1 ? parts[0] : and(...parts)
  }

  private field(model: TableModel, path: string, operators: WhereOperators): SQL {
    if (typeof operators !== 'object' || operators === null || Array.isArray(operators)) {
      throw new QueryError(`"${path}" must be an object of operators, e.g. { equals: ... }`)
    }
    const entries = Object.entries(operators).filter(([, v]) => v !== undefined)
    if (entries.length === 0) throw new QueryError(`"${path}" has no operator`)
    const target = resolvePath(
      model,
      path.split('.'),
      this.drafts && model.kind === 'root',
      this.localization,
    )

    const parts = entries.map(([op, value]) => {
      if (!OPERATORS.has(op)) throw new QueryError(`Unknown operator "${op}" on "${path}"`)
      if (target.kind === 'column') {
        if (target.bare && op !== 'exists') polymorphicPart(undefined, path, target.bare)
        if (target.collection) {
          // `link.pages`: links to pages (by id).
          const { slug, column } = target.collection
          const is = eq(column, slug)
          if (op === 'exists')
            return value === false ? (or(isNull(column), ne(column, slug)) as SQL) : is
          if (op === 'not_equals' || op === 'not_in') {
            const positive = op === 'not_equals' ? 'equals' : 'in'
            const match = operatorSQL(
              this.dialect,
              target.column,
              target.field,
              positive,
              value,
              path,
            )
            return or(isNull(column), not(and(is, match) as SQL)) as SQL
          }
          return and(
            is,
            operatorSQL(this.dialect, target.column, target.field, op, value, path),
          ) as SQL
        }
        return operatorSQL(this.dialect, target.column, target.field, op, value, path)
      }
      if (target.kind === 'blocks') return this.blocks(target, op, value, path)
      return this.child(model, target.child, target.rest, op, value, path, target.locale)
    })
    return (parts.length === 1 ? parts[0] : and(...parts)) as SQL
  }

  /**
   * Conditions inside blocks test the JSON rows: some block (and, for nested lists, some row in
   * it) must match.
   */
  private blocks(
    target: Extract<Target, { kind: 'blocks' }>,
    op: string,
    value: unknown,
    path: string,
  ): SQL {
    const { lists, path: inner, type, field } = target.value
    if (inner === null && op !== 'exists')
      throw new QueryError(`"${path}" is a list; query one of its fields`)
    const match = (el: JsonElement, level: number): SQL | undefined => {
      const list = lists[level]
      if (list) return this.dialect.someElement(el.list(list), (row) => match(row, level + 1))
      if (inner === null) return undefined
      return operatorSQL(this.dialect, el.get(inner, type), field, op, value, path)
    }
    const contains = this.containment(target, op, value)
    if (contains) return contains
    const some = this.dialect.someElement(target.column, (el) => match(el, 0))
    return inner === null && value === false ? not(some) : some
  }

  /**
   * `equals` and `in` as JSON containment where the database has it: `layout.items.title = x`
   * becomes `layout @> [{"items": [{"title": x}]}]`, which matches exactly the same documents
   * without unpacking every array.
   */
  private containment(
    target: Extract<Target, { kind: 'blocks' }>,
    op: string,
    value: unknown,
  ): SQL | undefined {
    const { jsonContains } = this.dialect
    const { lists, path, type, field } = target.value
    if (!jsonContains || !path) return undefined
    const values = op === 'equals' ? [value] : op === 'in' && Array.isArray(value) ? value : null
    if (!values || values.length === 0 || values.some((v) => v === null || v === undefined))
      return undefined
    const nest = (segments: readonly string[], inner: unknown) =>
      segments.reduceRight<unknown>((acc, segment) => ({ [segment]: acc }), inner)
    const patterns = values.map((raw) => {
      const coerced = coerce(field, raw)
      // Stored as JSON types: text fields hold strings, so compare `5` as "5".
      let pattern: unknown =
        type === 'text' && typeof coerced !== 'string' ? String(coerced) : coerced
      pattern = nest(path, pattern)
      for (const list of [...lists].reverse()) pattern = nest(list, [pattern])
      return jsonContains(target.column, [pattern])
    })
    return patterns.length === 1 ? patterns[0] : (or(...patterns) as SQL)
  }

  /** Conditions on array rows or hasMany values become (NOT) EXISTS subqueries. */
  private child(
    parent: TableModel,
    child: ChildModel,
    rest: string[],
    op: string,
    value: unknown,
    path: string,
    locale?: string,
  ): SQL {
    const table = child.table
    const parentLink = eq(col(table, '_parent_id'), col(parent, 'id'))
    const link =
      locale === undefined
        ? parentLink
        : (and(parentLink, eq(col(table, '_locale'), locale)) as SQL)
    const subquery = (condition: SQL | undefined) =>
      exists(
        this.db
          .select({ one: sql`1` })
          .from(table.table)
          .where(condition ? and(link, condition) : link),
      )

    if (child.kind === 'values') {
      let valueColumn = col(table, 'value')
      let valueField = table.valueField
      /** `links.pages` (#327): only values of that collection. */
      let only: SQL | undefined
      if (valueField && isPolymorphic(valueField)) {
        // Several collections: `links.relationTo`, `links.value` or `links.<collection>`.
        if (rest.length > 1) throw new QueryError(`Cannot query inside "${path}"`)
        const shown = rest.length === 1 ? path.split('.').slice(0, -1).join('.') : path
        const part =
          rest.length === 0 && op === 'exists'
            ? 'value'
            : polymorphicPart(rest[0], shown, valueField.to)
        if (part === 'relationTo') {
          valueColumn = col(table, 'relation_to')
          valueField = undefined
        } else if (typeof part === 'object') only = eq(col(table, 'relation_to'), part.collection)
      } else if (rest.length > 0) throw new QueryError(`Cannot query inside "${path}"`)
      if (op === 'exists') return value === false ? not(subquery(only)) : subquery(only)
      const matching = (operator: string) =>
        subquery(
          and(only, operatorSQL(this.dialect, valueColumn, valueField, operator, value, path)),
        )
      if (op === 'not_equals') return not(matching('equals'))
      if (op === 'not_in') return not(matching('in'))
      return matching(op)
    }

    if (rest.length === 0) {
      if (op !== 'exists') throw new QueryError(`"${path}" is an array; query one of its fields`)
      return value === false ? not(subquery(undefined)) : subquery(undefined)
    }
    return subquery(this.build(table, { [rest.join('.')]: { [op]: value } }))
  }

  /** A column, or the first value in blocks (and the lists in them, in order) that has it. */
  private sortValue(target: Target, path: string): SQL | AnyColumn {
    if (target.kind === 'column') return target.column
    if (target.kind === 'blocks' && target.value.path) {
      const { lists, path: inner, type } = target.value
      return this.dialect.firstElementValue(target.column, lists, inner, type)
    }
    throw new QueryError(`Cannot sort by "${path}"`)
  }

  orderBy(model: TableModel, sort: readonly string[]): SQL[] {
    const order = sort.map((entry) => {
      const descending = entry.startsWith('-')
      const path = descending ? entry.slice(1) : entry
      const target = resolvePath(model, path.split('.'), this.drafts, this.localization)
      const value = this.sortValue(target, path)
      return descending ? desc(value) : asc(value)
    })
    order.push(desc(col(model, 'id')))
    return order
  }

  /**
   * The columns a cursor goes by, in `orderBy`'s order: the sort's, then `id`. Only plain
   * columns: a sort on a value inside blocks has nothing to compare a cursor with.
   */
  keyset(model: TableModel, sort: readonly string[]): KeyColumn[] {
    const keys = sort.map((entry) => {
      const descending = entry.startsWith('-')
      const path = descending ? entry.slice(1) : entry
      const target = resolvePath(model, path.split('.'), this.drafts, this.localization)
      if (target.kind !== 'column')
        throw new QueryError(
          `A cursor can't follow a sort by "${path}"; sort by a field of the document, or use page`,
        )
      return { column: target.column, descending }
    })
    keys.push({ column: col(model, 'id'), descending: true })
    return keys
  }

  /**
   * Rows after `values` (the keys of the last row of the page before) in the keyset's order.
   * Where nulls go follows the database's default order, as `orderBy` leaves it: last in
   * ascending order on Postgres, first on SQLite.
   */
  after(keys: readonly KeyColumn[], values: readonly unknown[]): SQL {
    const nullsHigh = this.dialect.name === 'postgres'
    const equal = (key: KeyColumn, value: unknown) =>
      value === null ? isNull(key.column) : eq(key.column, value)
    // Strictly after `value` in this key's order.
    const later = (key: KeyColumn, value: unknown): SQL => {
      // Nulls come after every value when they sort high and the order rises, or the reverse.
      const nullsLater = nullsHigh !== key.descending
      if (value === null) return nullsLater ? sql`1 = 0` : isNotNull(key.column)
      const beyond = key.descending ? lt(key.column, value) : gt(key.column, value)
      return nullsLater ? (or(beyond, isNull(key.column)) as SQL) : beyond
    }
    const branches = keys.map((key, i) =>
      and(...keys.slice(0, i).map((k, j) => equal(k, values[j])), later(key, values[i])),
    )
    const rest = or(...branches) as SQL
    // The same rows, with a bound on the first key an index can use: without it the database
    // reads every row before the cursor to drop them.
    const [first] = keys
    const start = values[0]
    if (!first || start === null || start === undefined) return rest
    const from = first.descending ? lte(first.column, start) : gte(first.column, start)
    const bound = nullsHigh !== first.descending ? (or(from, isNull(first.column)) as SQL) : from
    return and(bound, rest) as SQL
  }
}

export interface KeyColumn {
  readonly column: AnyColumn
  readonly descending: boolean
}
