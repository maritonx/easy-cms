import type { Config } from './config.js'
import type { ConfigIssue } from './errors.js'
import {
  type AdminComponent,
  FIELD_TYPES,
  type Field,
  type FieldValidateContext,
} from './fields.js'

/** Built-in types a field type can be stored as. */
export const FIELD_TYPE_BASES = [
  'text',
  'textarea',
  'email',
  'number',
  'boolean',
  'date',
  'json',
] as const
export type FieldTypeBase = (typeof FIELD_TYPE_BASES)[number]

/** What a field type's `validate` gets besides the value: the field, with its own options. */
export interface FieldTypeValidateContext extends FieldValidateContext {
  readonly field: Readonly<Record<string, unknown>> & { readonly name: string }
}

/**
 * A field type a package adds, e.g. `color`: stored, queried and translated like its `base`
 * type, with its own checks and admin components. List it in the config's `fieldTypes`.
 */
export interface FieldTypeDefinition {
  /** The `type` fields use, e.g. `color`. Lowercase; not one of the built-in types. */
  readonly name: string
  /** How values are stored and queried: one of the built-in scalar types. */
  readonly base: FieldTypeBase
  /** Checks a value (not empty ones; `required` covers those). Return `true` or a message. */
  readonly validate?: (
    value: unknown,
    ctx: FieldTypeValidateContext,
  ) => true | string | Promise<true | string>
  /** Checks a field's own options when the config loads; return a message for a mistake. */
  readonly checkOptions?: (field: Readonly<Record<string, unknown>>) => string | undefined
  readonly admin?: {
    /** The input: a Web Component from `module`, with fixed `props` of its own if it needs them. */
    readonly component?: AdminComponent
    /** Shown in the admin's lists. */
    readonly cell?: AdminComponent
    /** The admin module (package export or file) that defines the components. */
    readonly module?: string
    /** The field options its components get (as their `options`), e.g. `['presets']`. */
    readonly props?: readonly string[]
  }
  /** The value's TypeScript type for `generate:types`. Default: the base type's. */
  readonly typescript?: string
}

/** Declares a field type; returns it unchanged. */
export function defineFieldType(definition: FieldTypeDefinition): FieldTypeDefinition {
  return definition
}

const NAME = /^[a-z][a-zA-Z0-9]*$/

/** Admin modules of the config's field types, added after the plugins'. */
export function fieldTypeModules(config: Config): string[] {
  const list = config.fieldTypes
  if (!Array.isArray(list)) return []
  return list
    .map((t: FieldTypeDefinition | undefined) => t?.admin?.module)
    .filter((m): m is string => typeof m === 'string')
}

/**
 * Turns fields of added types into fields of their base types, so storage, queries and the REST
 * API need nothing new: the type's checks join the field's `validate`, its components its
 * `admin`, and the type's name stays in `customType` for the admin.
 */
export function applyFieldTypes(config: Config): { config: Config; issues: ConfigIssue[] } {
  const issues: ConfigIssue[] = []
  const list = config.fieldTypes
  if (list === undefined) return { config, issues }
  if (!Array.isArray(list)) {
    issues.push({ path: 'fieldTypes', message: 'must be an array of field types' })
    return { config, issues }
  }
  const types = new Map<string, FieldTypeDefinition>()
  for (const [i, type] of list.entries()) {
    const path = `fieldTypes[${i}]`
    if (!type || typeof type.name !== 'string' || !NAME.test(type.name)) {
      issues.push({ path: `${path}.name`, message: 'must be a lowercase name like "color"' })
    } else if ((FIELD_TYPES as readonly string[]).includes(type.name)) {
      issues.push({ path: `${path}.name`, message: `"${type.name}" is a built-in field type` })
    } else if (types.has(type.name)) {
      issues.push({ path: `${path}.name`, message: `"${type.name}" is listed twice` })
    } else if (!(FIELD_TYPE_BASES as readonly string[]).includes(type.base)) {
      issues.push({
        path: `${path}.base`,
        message: `must be one of ${FIELD_TYPE_BASES.join(', ')}`,
      })
    } else {
      types.set(type.name, type)
    }
  }
  if (types.size === 0) return { config, issues }

  const component = (
    base: AdminComponent | undefined,
    field: Readonly<Record<string, unknown>>,
    props?: readonly string[],
  ): AdminComponent | undefined => {
    if (!base) return undefined
    const tag = typeof base === 'string' ? base : base.tag
    // The type's own props, then the field options it passes on (`props`).
    const options = {
      ...(typeof base === 'string' ? {} : base.props),
      ...Object.fromEntries(
        (props ?? []).filter((key) => field[key] !== undefined).map((key) => [key, field[key]]),
      ),
    }
    return Object.keys(options).length ? { tag, props: options } : tag
  }

  const convert = (fields: readonly Field[], path: string): Field[] =>
    fields.map((field, i) => {
      const here = `${path}[${i}]`
      const own = field as unknown as Record<string, unknown> & { name: string; type: string }
      const type = types.get(own.type)
      if (!type) {
        if ((field.type === 'group' || field.type === 'array') && Array.isArray(field.fields))
          return { ...field, fields: convert(field.fields, `${here}.fields`) } as Field
        if (field.type === 'blocks' && Array.isArray(field.blocks))
          return {
            ...field,
            blocks: field.blocks.map((block, b) => ({
              ...block,
              fields: convert(block.fields, `${here}.blocks[${b}].fields`),
            })),
          } as Field
        return field
      }
      const problem = type.checkOptions?.(own)
      if (problem) issues.push({ path: here, message: problem })
      const ownValidate = own.validate as Field['validate']
      const check = type.validate
      const admin = (own.admin ?? {}) as Record<string, unknown>
      const input = admin.component ?? component(type.admin?.component, own, type.admin?.props)
      const cell = admin.cell ?? component(type.admin?.cell, own, type.admin?.props)
      return {
        ...own,
        type: type.base,
        customType: type.name,
        ...(check || ownValidate
          ? {
              validate: async (value: unknown, ctx: FieldValidateContext) => {
                const empty = value === null || value === undefined || value === ''
                if (check && !empty) {
                  const result = await check(value, { ...ctx, field: own })
                  if (result !== true) return result
                }
                return ownValidate
                  ? (ownValidate as (v: unknown, c: unknown) => unknown)(value, ctx)
                  : true
              },
            }
          : {}),
        ...(input || cell
          ? {
              admin: {
                ...admin,
                ...(input ? { component: input } : {}),
                ...(cell ? { cell } : {}),
              },
            }
          : {}),
      } as unknown as Field
    })

  return {
    config: {
      ...config,
      ...(config.collections
        ? {
            collections: config.collections.map((c, i) => ({
              ...c,
              fields: convert(c.fields, `collections[${i}].fields`),
            })),
          }
        : {}),
      ...(config.globals
        ? {
            globals: config.globals.map((g, i) => ({
              ...g,
              fields: convert(g.fields, `globals[${i}].fields`),
            })),
          }
        : {}),
    },
    issues,
  }
}
