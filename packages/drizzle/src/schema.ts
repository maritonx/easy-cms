import { createHash } from 'node:crypto'
import type { CollectionConfig, Field, ResolvedConfig } from '@easy-cms/core'
import { ConfigError, isHasMany } from '@easy-cms/core'
import type { AnyColumn, AnyTable, ColumnBuilder, Dialect } from './dialect.js'

/** A scalar field stored as a column of this table. */
export interface ColumnModel {
  /** Path of the value inside the row's data, e.g. `['seo', 'title']`. */
  readonly path: readonly string[]
  readonly field: Field
  readonly column: string
  /** For localized fields: the locale whose value this column holds. */
  readonly locale?: string
  /** The default locale's column, used when a query names no locale. */
  readonly defaultLocale?: boolean
}

/** A child table holding array rows or hasMany values. */
export interface ChildModel {
  readonly kind: 'array' | 'values'
  readonly path: readonly string[]
  readonly field: Field
  readonly table: TableModel
  /** Localized: rows carry `_locale`, and the data holds `{ [locale]: rows }`. */
  readonly locales?: readonly string[]
  readonly defaultLocale?: string
}

export interface TableModel {
  readonly name: string
  readonly kind: 'root' | 'array' | 'values'
  readonly table: AnyTable
  readonly fields: readonly Field[]
  readonly columns: readonly ColumnModel[]
  readonly children: readonly ChildModel[]
  /** The field whose values the `value` column holds, for `values` tables. */
  readonly valueField?: Field
}

export interface CollectionModel {
  readonly config: CollectionConfig
  readonly root: TableModel
}

export interface SchemaModel {
  readonly collections: ReadonlyMap<string, CollectionModel>
  readonly globals: AnyTable
  /** Every table managed by snapshots, keyed by SQL name. */
  readonly tables: Readonly<Record<string, AnyTable>>
  /** Changes whenever the generated schema changes. Used to detect missing migrations. */
  readonly hash: string
  /** Locales of localized fields, recorded with snapshots so a new default locale keeps data. */
  readonly localization: SchemaLocalization | null
}

export interface SchemaLocalization {
  readonly defaultLocale: string
  readonly locales: readonly string[]
}

/** Every table of the collections, children included. */
export function tableModels(schema: SchemaModel): TableModel[] {
  const all: TableModel[] = []
  const walk = (model: TableModel) => {
    all.push(model)
    for (const child of model.children) walk(child.table)
  }
  for (const collection of schema.collections.values()) walk(collection.root)
  return all
}

/** Tracks applied migrations. Created separately and never part of a snapshot. */
export function migrationsTableName(prefix: string) {
  return `${prefix}migrations`
}

export const snake = (name: string) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .toLowerCase()

type ColumnKind = 'text' | 'number' | 'integer' | 'boolean' | 'json'

function columnKind(field: Field): ColumnKind {
  switch (field.type) {
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'json':
    case 'richText':
    // Blocks are stored whole as JSON: rows of different kinds don't fit one child table.
    case 'blocks':
      return 'json'
    case 'upload':
    case 'relationship':
      return 'integer'
    default:
      return 'text'
  }
}

interface Builder {
  /** Locales of localized fields; the default one keeps the plain column name. */
  readonly localization: ResolvedConfig['localization']
  readonly dialect: Dialect
  readonly prefix: string
  readonly tableNames: Set<string>
  readonly description: unknown[]
}

/** Builds Drizzle tables for every collection and global in the config. */
export function buildSchema(config: ResolvedConfig, prefix: string, dialect: Dialect): SchemaModel {
  const builder: Builder = {
    dialect,
    prefix,
    tableNames: new Set([migrationsTableName(prefix)]),
    // The hash covers the logical schema only, so it stays stable across releases for the same config.
    description: [],
    localization: config.localization,
  }
  const collections = new Map<string, CollectionModel>()
  const tables: Record<string, AnyTable> = {}

  for (const collection of config.collections) {
    const root = buildTable(
      builder,
      `${prefix}${snake(collection.slug)}`,
      'root',
      collection.fields,
      {
        drafts: collection.drafts === true,
      },
    )
    collections.set(collection.slug, { config: collection, root })
    collectTables(root, tables)
  }

  const globalsName = claimName(builder, `${prefix}globals`)
  const globals = dialect.table(
    globalsName,
    {
      slug: dialect.text('slug').primaryKey(),
      data: dialect.json('data').notNull(),
      status: dialect.text('status'),
      updated_at: dialect.text('updated_at').notNull(),
    },
    () => [],
  )
  tables[globalsName] = globals
  builder.description.push(['globals', globalsName])

  const hash = createHash('sha256')
    .update(JSON.stringify(builder.description))
    .digest('hex')
    .slice(0, 16)
  const localization = config.localization
    ? { defaultLocale: config.localization.defaultLocale, locales: config.localization.locales }
    : null
  return { collections, globals, tables, hash, localization }
}

function collectTables(model: TableModel, into: Record<string, AnyTable>) {
  into[model.name] = model.table
  for (const child of model.children) collectTables(child.table, into)
}

function claimName(builder: Builder, name: string): string {
  if (builder.tableNames.has(name)) {
    throw new ConfigError([
      {
        path: name,
        message: `two tables would be named "${name}"`,
        hint: 'rename one of the collections or fields',
      },
    ])
  }
  builder.tableNames.add(name)
  return name
}

function makeColumn(dialect: Dialect, name: string, kind: ColumnKind): ColumnBuilder {
  switch (kind) {
    case 'number':
      return dialect.number(name)
    case 'integer':
      return dialect.integer(name)
    case 'boolean':
      return dialect.boolean(name)
    case 'json':
      return dialect.json(name)
    case 'text':
      return dialect.text(name)
  }
}

function buildTable(
  builder: Builder,
  name: string,
  kind: TableModel['kind'],
  fields: readonly Field[],
  options: {
    drafts?: boolean
    parentIdKind?: 'integer' | 'text'
    valueField?: Field
    /** The default locale, for child tables of localized fields. */
    localized?: string
  },
): TableModel {
  const { dialect } = builder
  claimName(builder, name)
  const columns: Record<string, ColumnBuilder> = {}
  const described: unknown[] = []
  const columnModels: ColumnModel[] = []
  const children: ChildModel[] = []
  // `within`: unique together with these columns (`uniqueWithin`).
  // One column as a string, as before several were allowed (the schema's hash stays the same).
  const indexes: { column: string; unique: boolean; within?: string | readonly string[] }[] = []

  const add = (column: string, builderColumn: ColumnBuilder, desc: unknown) => {
    if (Object.hasOwn(columns, column)) {
      throw new ConfigError([
        {
          path: `${name}.${column}`,
          message: `two fields would use the column "${column}"`,
          hint: 'rename one of them',
        },
      ])
    }
    columns[column] = builderColumn
    described.push([column, desc])
  }

  if (kind === 'root') {
    add('id', dialect.serial('id'), 'id:int')
    add('created_at', dialect.text('created_at').notNull(), 'text!')
    add('updated_at', dialect.text('updated_at').notNull(), 'text!')
    if (options.drafts) {
      add('status', dialect.text('status').notNull().default('draft'), 'status')
      // Public reads filter by status, and their counts scan the whole table without it.
      indexes.push({ column: 'status', unique: false })
    }
    indexes.push({ column: 'created_at', unique: false })
  } else {
    const parentKind = options.parentIdKind ?? 'integer'
    add(
      'id',
      kind === 'array' ? dialect.text('id').primaryKey() : dialect.serial('id'),
      `id:${kind}`,
    )
    add(
      '_parent_id',
      parentKind === 'text'
        ? dialect.text('_parent_id').notNull()
        : dialect.integer('_parent_id').notNull(),
      parentKind,
    )
    add('_order', dialect.integer('_order').notNull(), 'int!')
    indexes.push({ column: '_parent_id', unique: false })
    if (options.localized) {
      // Rows that existed before the field was localized become the default locale's.
      add(
        '_locale',
        dialect.text('_locale').notNull().default(options.localized),
        `locale:${options.localized}`,
      )
      indexes.push({ column: '_locale', unique: false })
    }
    if (kind === 'values' && options.valueField) {
      const valueKind = columnKind(options.valueField)
      add('value', makeColumn(dialect, 'value', valueKind), valueKind)
      indexes.push({ column: 'value', unique: false })
    }
  }

  const walk = (list: readonly Field[], path: string[], topLevel: boolean) => {
    for (const field of list) {
      const fieldPath = [...path, field.name]
      const base = fieldPath.map(snake).join('_')

      if (field.type === 'group') {
        walk(field.fields, fieldPath, false)
      } else if (field.type === 'array') {
        const localization = field.localized ? builder.localization : null
        const child = buildTable(builder, `${name}__${base}`, 'array', field.fields, {
          parentIdKind: kind === 'array' ? 'text' : 'integer',
          ...(localization ? { localized: localization.defaultLocale } : {}),
        })
        children.push({
          kind: 'array',
          path: fieldPath,
          field,
          table: child,
          ...localeInfo(localization),
        })
        described.push([base, 'array', child.name])
      } else if (isHasMany(field)) {
        const localization = field.localized ? builder.localization : null
        const child = buildTable(builder, `${name}__${base}`, 'values', [], {
          parentIdKind: kind === 'array' ? 'text' : 'integer',
          valueField: field,
          ...(localization ? { localized: localization.defaultLocale } : {}),
        })
        children.push({
          kind: 'values',
          path: fieldPath,
          field,
          table: child,
          ...localeInfo(localization),
        })
        described.push([base, 'values', child.name])
      } else {
        const kindOfColumn = columnKind(field)
        const localization = field.localized ? builder.localization : null
        // Localized: one column per locale. The default locale keeps the plain name, so turning
        // `localized` on keeps existing values as the default locale's.
        const targets = localization
          ? localization.locales.map((locale) => ({
              column: locale === localization.defaultLocale ? base : `${base}__${snake(locale)}`,
              locale,
            }))
          : [{ column: base, locale: undefined }]
        for (const { column, locale } of targets) {
          add(column, makeColumn(dialect, column, kindOfColumn), kindOfColumn)
          columnModels.push(
            locale === undefined
              ? { path: fieldPath, field, column }
              : {
                  path: fieldPath,
                  field,
                  column,
                  locale,
                  defaultLocale: locale === localization?.defaultLocale,
                },
          )
          if (
            topLevel &&
            kind === 'root' &&
            (field.unique || field.type === 'slug') &&
            field.uniqueWithin !== undefined
          ) {
            // Unique among documents with the same value there, e.g. per parent or tenant; and
            // an index of its own, for lookups by this field alone.
            const within = [field.uniqueWithin].flat().map(snake)
            indexes.push({
              column,
              unique: true,
              within: within.length === 1 ? (within[0] as string) : within,
            })
            indexes.push({ column, unique: false })
          } else if (topLevel && kind === 'root' && (field.unique || field.type === 'slug')) {
            indexes.push({ column, unique: true })
          } else if (
            field.index ||
            field.unique ||
            field.type === 'slug' ||
            field.type === 'relationship' ||
            field.type === 'upload'
          ) {
            indexes.push({ column, unique: false })
          }
        }
      }
    }
  }
  walk(fields, [], true)

  const table = dialect.table(name, columns, (t: Record<string, AnyColumn>) =>
    indexes.map(({ column, unique, within }) => {
      const col = t[column]
      if (within) {
        const columns = [within].flat()
        return dialect
          .uniqueIndex(`${name}_${columns.join('_')}_${column}_unique`)
          .on(...columns.map((w) => t[w] as AnyColumn), col)
      }
      return unique
        ? dialect.uniqueIndex(`${name}_${column}_unique`).on(col)
        : dialect.index(`${name}_${column}_idx`).on(col)
    }),
  )

  builder.description.push([name, kind, described, indexes])
  const model: TableModel = { name, kind, table, fields, columns: columnModels, children }
  return options.valueField ? { ...model, valueField: options.valueField } : model
}

function localeInfo(localization: ResolvedConfig['localization']) {
  return localization
    ? { locales: localization.locales, defaultLocale: localization.defaultLocale }
    : {}
}
