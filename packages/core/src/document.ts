import { randomUUID } from 'node:crypto'
import type { ID } from './access.js'
import type { FieldError } from './errors.js'
import {
  type BlocksField,
  type Field,
  type FilterOptions,
  hasRows,
  isHasMany,
  rowFields,
  type SelectField,
} from './fields.js'
import type { Localization } from './localization.js'

type Data = Record<string, unknown>

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const isPlainObject = (value: unknown): value is Data =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** `3 files`, `1 document`, `2 rows`: the unit of a list field's `minRows` / `maxRows`. */
function itemsOf(field: Field, n: number): string {
  const unit = field.type === 'upload' ? 'file' : field.type === 'relationship' ? 'document' : 'row'
  return `${n} ${unit}${n === 1 ? '' : 's'}`
}

const isEmpty = (value: unknown) => value === undefined || value === null || value === ''

/**
 * Turns text into a URL slug. Keeps letters and digits of any script,
 * so Thai titles stay readable: "สวัสดี World!" → "สวัสดี-world".
 */
export function slugify(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

/** Fills in `defaultValue` for fields that are missing, including inside groups and array rows. */
export function applyDefaults(
  fields: readonly Field[],
  data: Data,
  localization: Localization | null = null,
): Data {
  const result: Data = { ...data }
  for (const field of fields) {
    const value = result[field.name]
    if (field.type === 'group') {
      result[field.name] = applyDefaults(
        field.fields,
        isPlainObject(value) ? value : {},
        localization,
      )
    } else if (hasRows(field) && !field.localized) {
      if (Array.isArray(value)) {
        result[field.name] = value.map((row) => {
          const fields = rowFields(field, row)
          return fields && isPlainObject(row) ? applyDefaults(fields, row, localization) : row
        })
      }
    } else if (field.localized && localization && field.defaultValue !== undefined) {
      // Localized: the default fills the default locale only.
      const map = isPlainObject(value) ? value : {}
      if (map[localization.defaultLocale] === undefined) {
        result[field.name] = {
          ...map,
          [localization.defaultLocale]: structuredClone(field.defaultValue),
        }
      }
    } else if (value === undefined && field.defaultValue !== undefined) {
      result[field.name] = structuredClone(field.defaultValue)
    }
  }
  return result
}

/** Gives every field a value (`null`, `[]` or a nested object) so documents always have the same shape. */
export function fillMissing(fields: readonly Field[], data: Data): Data {
  const result: Data = { ...data }
  for (const field of fields) {
    const value = result[field.name]
    if (field.type === 'group') {
      result[field.name] = fillMissing(field.fields, isPlainObject(value) ? value : {})
    } else if (value === undefined) {
      result[field.name] = hasRows(field) || isHasMany(field) ? [] : null
    }
  }
  return result
}

/** Fills empty `slug` fields from their `from` field. Does not check uniqueness. */
export function generateSlugs(
  fields: readonly Field[],
  data: Data,
  localization: Localization | null = null,
): Data {
  const result: Data = { ...data }
  for (const field of fields) {
    if (field.type === 'slug' && field.localized && localization) {
      // One slug per locale, each from that locale's source value.
      const map = isPlainObject(result[field.name]) ? (result[field.name] as Data) : {}
      const source = field.from ? result[field.from] : undefined
      const next: Data = { ...map }
      for (const locale of localization.locales) {
        const current = map[locale]
        const from = isPlainObject(source) ? source[locale] : source
        if (typeof current === 'string' && current !== '') next[locale] = slugify(current)
        else if (typeof from === 'string' && from.trim() !== '') next[locale] = slugify(from)
      }
      result[field.name] = next
    } else if (field.type === 'slug') {
      const current = result[field.name]
      if (typeof current === 'string' && current !== '') {
        result[field.name] = slugify(current)
      } else if (field.from) {
        // A localized source gives a shared slug from its default locale's value.
        const raw = result[field.from]
        const source = isPlainObject(raw) && localization ? raw[localization.defaultLocale] : raw
        if (typeof source === 'string' && source.trim() !== '') result[field.name] = slugify(source)
      }
    } else if (field.type === 'group' && isPlainObject(result[field.name])) {
      result[field.name] = generateSlugs(field.fields, result[field.name] as Data, localization)
    } else if (hasRows(field) && Array.isArray(result[field.name])) {
      result[field.name] = (result[field.name] as unknown[]).map((row) => {
        const fields = rowFields(field, row)
        return fields && isPlainObject(row) ? generateSlugs(fields, row, localization) : row
      })
    }
  }
  return result
}

/**
 * Merges an update into the stored document. Top-level fields and group
 * fields merge key by key; arrays and hasMany values are replaced.
 */
export function mergeForUpdate(fields: readonly Field[], existing: Data, patch: Data): Data {
  const result: Data = {}
  for (const field of fields) {
    const has = Object.hasOwn(patch, field.name)
    const next = patch[field.name]
    const prev = existing[field.name]
    if (field.type === 'group' && has && isPlainObject(next)) {
      result[field.name] = mergeForUpdate(field.fields, isPlainObject(prev) ? prev : {}, next)
    } else {
      result[field.name] = has ? next : prev
    }
  }
  return result
}

/** Parses an id from user input. Integer ids may arrive as strings from URLs. */
export function parseId(value: unknown): ID | undefined {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? value : undefined
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) {
    const n = Number(value)
    return Number.isSafeInteger(n) ? n : undefined
  }
  return undefined
}

/** A reference to another document found while validating, checked against the database afterwards. */
export interface Reference {
  readonly field: string
  readonly collection: string
  readonly id: ID
  /** The relationship's `filterOptions`, checked when saving. */
  readonly filterOptions?: FilterOptions
  /** The upload's `mimeTypes`, checked when saving. */
  readonly mimeTypes?: readonly string[]
  /** The upload's `folder` with `folderOnly`: the file must be in it, checked when saving. */
  readonly folderOnly?: string
}

export interface ValidateOptions {
  readonly operation: 'create' | 'update'
  /** Drafts may be incomplete: skip `required`, but still check types (FR-DRF-02). */
  readonly skipRequired?: boolean
  /** The whole top-level document, passed to custom `validate` functions. */
  readonly root: Data
  /** Localized fields hold `{ [locale]: value }`; each value is validated. */
  readonly localization?: Localization | null
  /**
   * The locale being written: `required` and custom `validate` apply to its values, and its
   * errors use the plain field path. Default: the default locale.
   */
  readonly locale?: string
}

export interface ValidateResult {
  /** Only known fields, with values normalized (ids parsed, dates as ISO strings, row ids filled). */
  readonly data: Data
  readonly errors: FieldError[]
  readonly references: Reference[]
}

/** Checks and normalizes data against fields. Unknown keys are dropped. */
export async function validateFields(
  fields: readonly Field[],
  input: Data,
  options: ValidateOptions,
  prefix = '',
): Promise<ValidateResult> {
  const data: Data = {}
  const errors: FieldError[] = []
  const references: Reference[] = []

  for (const field of fields) {
    const path = prefix + field.name
    const raw = input[field.name]
    const fail = (message: string) => errors.push({ field: path, message })

    if (field.type === 'group') {
      if (!isEmpty(raw) && !isPlainObject(raw)) {
        fail('must be an object')
        continue
      }
      const sub = await validateFields(
        field.fields,
        isPlainObject(raw) ? raw : {},
        options,
        `${path}.`,
      )
      data[field.name] = sub.data
      errors.push(...sub.errors)
      references.push(...sub.references)
      continue
    }

    const localization = options.localization
    if (field.localized && localization) {
      if (!isEmpty(raw) && !isPlainObject(raw)) {
        fail('must be an object with one value per locale')
        continue
      }
      const map = isPlainObject(raw) ? raw : {}
      const written = options.locale ?? localization.defaultLocale
      const out: Data = {}
      for (const locale of localization.locales) {
        const own = locale === written
        const localePath = own ? path : `${path}.${locale}`
        const failLocale = (message: string) => errors.push({ field: localePath, message })
        const value = map[locale]
        if (isEmpty(value) || (Array.isArray(value) && value.length === 0)) {
          if (own && field.required && !options.skipRequired) failLocale('is required')
          out[locale] = hasRows(field) || isHasMany(field) ? [] : null
          if (own && !field.required) await runCustom(field, null, options, failLocale)
          continue
        }
        const normalized = await normalizeValue(
          field,
          value,
          localePath,
          options,
          failLocale,
          errors,
          references,
        )
        if (normalized === undefined) continue
        out[locale] = normalized
        if (own) await runCustom(field, normalized, options, failLocale)
      }
      data[field.name] = out
      continue
    }

    if (isEmpty(raw) || (Array.isArray(raw) && raw.length === 0)) {
      if (field.required && !options.skipRequired) fail('is required')
      // An empty list is short of `minRows` too (drafts may be incomplete).
      else if (!options.skipRequired && 'minRows' in field && field.minRows)
        fail(`must have at least ${itemsOf(field, field.minRows)}`)
      data[field.name] = hasRows(field) || isHasMany(field) ? [] : null
      if (!field.required) await runCustom(field, null, options, fail)
      continue
    }

    const value = await normalizeValue(field, raw, path, options, fail, errors, references)
    if (value === undefined) continue
    data[field.name] = value
    await runCustom(field, value, options, fail)
  }

  return { data, errors, references }
}

async function runCustom(
  field: Field,
  value: unknown,
  options: ValidateOptions,
  fail: (m: string) => void,
) {
  if (!field.validate) return
  const validate = field.validate as (
    value: unknown,
    ctx: unknown,
  ) => true | string | Promise<true | string>
  const result = await validate(value, { data: options.root, operation: options.operation })
  if (result !== true) fail(typeof result === 'string' ? result : 'is invalid')
}

/** Returns the normalized value, or `undefined` after reporting an error. */
async function normalizeValue(
  field: Field,
  raw: unknown,
  path: string,
  options: ValidateOptions,
  fail: (message: string) => void,
  errors: FieldError[],
  references: Reference[],
): Promise<unknown> {
  switch (field.type) {
    case 'text':
    case 'textarea':
    case 'slug': {
      if (typeof raw !== 'string') return fail('must be a string')
      if (field.type !== 'slug') {
        if (field.minLength !== undefined && raw.length < field.minLength)
          return fail(`must be at least ${field.minLength} characters`)
        if (field.maxLength !== undefined && raw.length > field.maxLength)
          return fail(`must be at most ${field.maxLength} characters`)
      }
      return raw
    }
    case 'email': {
      if (typeof raw !== 'string' || !EMAIL_PATTERN.test(raw))
        return fail('must be a valid email address')
      return raw.trim().toLowerCase()
    }
    case 'number': {
      const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw
      if (typeof n !== 'number' || !Number.isFinite(n)) return fail('must be a number')
      if (field.min !== undefined && n < field.min) return fail(`must be at least ${field.min}`)
      if (field.max !== undefined && n > field.max) return fail(`must be at most ${field.max}`)
      return n
    }
    case 'boolean':
      if (typeof raw !== 'boolean') return fail('must be true or false')
      return raw
    case 'date': {
      const date = raw instanceof Date ? raw : typeof raw === 'string' ? new Date(raw) : undefined
      if (!date || Number.isNaN(date.getTime())) return fail('must be a valid date')
      return date.toISOString()
    }
    case 'select':
      return normalizeSelect(field, raw, fail)
    case 'json':
      try {
        return JSON.parse(JSON.stringify(raw))
      } catch {
        return fail('must be JSON-serializable')
      }
    case 'richText':
      if (!isPlainObject(raw) || raw.type !== 'doc')
        return fail('must be a rich text document ({ type: "doc" })')
      return raw
    case 'upload':
    case 'relationship': {
      const target = field.type === 'upload' ? 'media' : field.to
      const many = field.hasMany === true
      const values = many ? raw : [raw]
      if (!Array.isArray(values)) return fail('must be an array of ids')
      if (many && field.minRows !== undefined && values.length < field.minRows)
        return fail(`must have at least ${itemsOf(field, field.minRows)}`)
      if (many && field.maxRows !== undefined && values.length > field.maxRows)
        return fail(`must have at most ${itemsOf(field, field.maxRows)}`)
      const ids: ID[] = []
      for (const item of values) {
        const id = parseId(isPlainObject(item) ? item.id : item)
        if (id === undefined)
          return fail(`must be ${many ? 'ids' : 'an id'} of "${target}" documents`)
        ids.push(id)
        references.push({
          field: path,
          collection: target,
          id,
          ...(field.filterOptions ? { filterOptions: field.filterOptions } : {}),
          ...(field.type === 'upload' && field.mimeTypes ? { mimeTypes: field.mimeTypes } : {}),
          ...(field.type === 'upload' && field.folder && field.folderOnly
            ? { folderOnly: field.folder }
            : {}),
        })
      }
      return many ? ids : ids[0]
    }
    case 'array': {
      if (!Array.isArray(raw)) return fail('must be an array')
      if (field.minRows !== undefined && raw.length < field.minRows)
        return fail(`must have at least ${field.minRows} rows`)
      if (field.maxRows !== undefined && raw.length > field.maxRows)
        return fail(`must have at most ${field.maxRows} rows`)
      const rows: Data[] = []
      for (const [i, row] of raw.entries()) {
        if (!isPlainObject(row)) {
          errors.push({ field: `${path}.${i}`, message: 'must be an object' })
          continue
        }
        const sub = await validateFields(field.fields, row, options, `${path}.${i}.`)
        errors.push(...sub.errors)
        references.push(...sub.references)
        const id = typeof row.id === 'string' && row.id !== '' ? row.id : randomUUID()
        rows.push({ id, ...sub.data })
      }
      return rows
    }
    case 'blocks':
      return normalizeBlocks(field, raw, path, options, fail, errors, references)
    case 'group':
      return raw // handled by the caller
  }
}

async function normalizeBlocks(
  field: BlocksField,
  raw: unknown,
  path: string,
  options: ValidateOptions,
  fail: (message: string) => void,
  errors: FieldError[],
  references: Reference[],
): Promise<unknown> {
  if (!Array.isArray(raw)) return fail('must be an array of blocks')
  if (field.minRows !== undefined && raw.length < field.minRows)
    return fail(`must have at least ${field.minRows} blocks`)
  if (field.maxRows !== undefined && raw.length > field.maxRows)
    return fail(`must have at most ${field.maxRows} blocks`)
  const rows: Data[] = []
  for (const [i, row] of raw.entries()) {
    const fields = rowFields(field, row)
    if (!isPlainObject(row) || !fields) {
      errors.push({
        field: `${path}.${i}.blockType`,
        message: `must be one of: ${field.blocks.map((b) => b.slug).join(', ')}`,
      })
      continue
    }
    const sub = await validateFields(fields, row, options, `${path}.${i}.`)
    errors.push(...sub.errors)
    references.push(...sub.references)
    const id = typeof row.id === 'string' && row.id !== '' ? row.id : randomUUID()
    rows.push({ id, blockType: row.blockType, ...sub.data })
  }
  return rows
}

function normalizeSelect(field: SelectField, raw: unknown, fail: (m: string) => void): unknown {
  const allowed = field.options.map((o) => (typeof o === 'string' ? o : o.value))
  const values = field.hasMany ? raw : [raw]
  if (!Array.isArray(values)) return fail('must be an array')
  for (const v of values) {
    if (typeof v !== 'string' || !allowed.includes(v))
      return fail(`must be one of: ${allowed.join(', ')}`)
  }
  return field.hasMany ? [...new Set(values as string[])] : values[0]
}
