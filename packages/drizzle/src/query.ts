import type { Field } from '@easy-cms/core'
import { parseId, QueryError, type Where, type WhereOperators } from '@easy-cms/core'
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
import type { AnyColumn, Dialect, DrizzleDb, JsonValueType } from './dialect.js'
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

/** A value inside each block of a blocks field; `null` tests only that a block exists. */
interface BlockValue {
  readonly path: readonly string[]
  readonly type: JsonValueType
  readonly field: Field | undefined
}

type Target =
  | { kind: 'column'; column: AnyColumn; field: Field | undefined }
  | { kind: 'child'; child: ChildModel; rest: string[]; locale?: string | undefined }
  | { kind: 'blocks'; column: AnyColumn; value: BlockValue | null }

const col = (model: TableModel, name: string) => model.table[name] as AnyColumn

const ID_FIELD: Field = { name: 'id', type: 'relationship', to: '' }
const LIKE_TYPES = new Set(['text', 'textarea', 'email', 'slug', 'select'])

const JSON_TYPES: Partial<Record<Field['type'], JsonValueType>> = {
  number: 'number',
  boolean: 'boolean',
  relationship: 'integer',
  upload: 'integer',
}

/**
 * Resolves `blockType`, `heading`, `heading.en` or `seo.title` inside the blocks of a blocks
 * field. A field name means that field in whichever block has it.
 */
function resolveBlockValue(
  blocks: Extract<Field, { type: 'blocks' }>,
  rest: string[],
  shown: string,
  localization: SchemaLocalization | null,
): BlockValue {
  if (rest.length === 1 && rest[0] === 'blockType')
    return { path: ['blockType'], type: 'text', field: undefined }
  let fields: readonly Field[] = blocks.blocks.flatMap((block) => block.fields)
  const path: string[] = []
  for (let i = 0; i < rest.length; i++) {
    const segment = rest[i] as string
    const field = fields.find((f) => f.name === segment)
    const at = [shown, ...rest.slice(0, i + 1)].join('.')
    if (!field) throw new QueryError(`Unknown field "${at}"`)
    path.push(segment)
    if (field.type === 'group') {
      fields = field.fields
      continue
    }
    const hasMany = 'hasMany' in field && field.hasMany === true
    if (
      hasMany ||
      field.type === 'array' ||
      field.type === 'blocks' ||
      field.type === 'json' ||
      field.type === 'richText'
    ) {
      throw new QueryError(`Cannot query "${at}" inside blocks`)
    }
    // Localized values inside blocks are stored as `{ [locale]: value }`.
    let last = i
    if (field.localized && localization) {
      const next = rest[i + 1]
      const named = next !== undefined && localization.locales.includes(next)
      path.push(named ? next : localization.defaultLocale)
      if (named) last = i + 1
    }
    if (last < rest.length - 1) throw new QueryError(`Cannot query inside "${at}"`)
    return { path, type: JSON_TYPES[field.type] ?? 'text', field }
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
      const value = rest.length === 0 ? null : resolveBlockValue(field, rest, shown, localization)
      return { kind: 'blocks', column: col(model, column.column), value }
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
      if (target.kind === 'column')
        return operatorSQL(this.dialect, target.column, target.field, op, value, path)
      if (target.kind === 'blocks') return this.blocks(target, op, value, path)
      return this.child(model, target.child, target.rest, op, value, path, target.locale)
    })
    return (parts.length === 1 ? parts[0] : and(...parts)) as SQL
  }

  /** Conditions inside blocks test each block of the JSON column: some block must match. */
  private blocks(
    target: Extract<Target, { kind: 'blocks' }>,
    op: string,
    value: unknown,
    path: string,
  ): SQL {
    const { value: inner } = target
    if (!inner) {
      if (op !== 'exists')
        throw new QueryError(`"${path}" is a blocks field; query one of its fields`)
      const any = this.dialect.someElement(target.column, () => undefined)
      return value === false ? not(any) : any
    }
    return this.dialect.someElement(target.column, (get) =>
      operatorSQL(this.dialect, get(inner.path, inner.type), inner.field, op, value, path),
    )
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
      if (rest.length > 0) throw new QueryError(`Cannot query inside "${path}"`)
      const valueColumn = col(table, 'value')
      if (op === 'exists') return value === false ? not(subquery(undefined)) : subquery(undefined)
      if (op === 'not_equals')
        return not(
          subquery(operatorSQL(this.dialect, valueColumn, table.valueField, 'equals', value, path)),
        )
      if (op === 'not_in')
        return not(
          subquery(operatorSQL(this.dialect, valueColumn, table.valueField, 'in', value, path)),
        )
      return subquery(operatorSQL(this.dialect, valueColumn, table.valueField, op, value, path))
    }

    if (rest.length === 0) {
      if (op !== 'exists') throw new QueryError(`"${path}" is an array; query one of its fields`)
      return value === false ? not(subquery(undefined)) : subquery(undefined)
    }
    return subquery(this.build(table, { [rest.join('.')]: { [op]: value } }))
  }

  orderBy(model: TableModel, sort: readonly string[]): SQL[] {
    const order = sort.map((entry) => {
      const descending = entry.startsWith('-')
      const path = descending ? entry.slice(1) : entry
      const target = resolvePath(model, path.split('.'), this.drafts, this.localization)
      if (target.kind !== 'column') throw new QueryError(`Cannot sort by "${path}"`)
      return descending ? desc(target.column) : asc(target.column)
    })
    order.push(desc(col(model, 'id')))
    return order
  }
}
