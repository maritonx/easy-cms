import type { Where } from './access.js'
import type { LocalizationConfig } from './config.js'
import { type Field, hasRows, rowFields } from './fields.js'

type Data = Record<string, unknown>
export type Localization = Required<LocalizationConfig>

/** Read every locale at once: localized fields come back as `{ [locale]: value }`. */
export const ALL_LOCALES = 'all'

const isPlainObject = (value: unknown): value is Data =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isEmpty = (value: unknown) => value === undefined || value === null || value === ''

export const isLocalized = (field: Field, localization: Localization | null) =>
  localization !== null && field.localized === true

/** Checks a requested locale; `undefined` means the default. */
export function resolveLocale(
  localization: Localization | null,
  locale: string | undefined,
  allowAll: boolean,
): string | undefined {
  if (!localization) return undefined
  if (locale === undefined) return localization.defaultLocale
  if (allowAll && locale === ALL_LOCALES) return ALL_LOCALES
  if (!localization.locales.includes(locale)) return undefined
  return locale
}

/**
 * Stored documents hold `{ [locale]: value }` for localized fields. Returns the document with
 * each of them replaced by the value for `locale`, falling back to the default locale's value
 * when empty (unless `fallback` is false). `locale: 'all'` keeps the maps.
 */
export function pickLocale(
  fields: readonly Field[],
  data: Data,
  locale: string,
  localization: Localization,
  fallback: boolean,
): Data {
  if (locale === ALL_LOCALES) return data
  const result: Data = { ...data }
  for (const field of fields) {
    const value = result[field.name]
    if (field.localized) {
      const map = isPlainObject(value) ? value : {}
      const own = map[locale]
      const blank = isEmpty(own) || (Array.isArray(own) && own.length === 0)
      const picked = blank && fallback ? (map[localization.defaultLocale] ?? null) : (own ?? null)
      // Lists (arrays, blocks, hasMany) read as `[]` rather than `null` when empty.
      const list = hasRows(field) || ('hasMany' in field && field.hasMany === true)
      result[field.name] = picked === null && list ? [] : picked
    } else if (field.type === 'group' && isPlainObject(value)) {
      result[field.name] = pickLocale(field.fields, value, locale, localization, fallback)
    } else if (hasRows(field) && Array.isArray(value)) {
      result[field.name] = value.map((row) => {
        const fields = rowFields(field, row)
        return fields && isPlainObject(row)
          ? pickLocale(fields, row, locale, localization, fallback)
          : row
      })
    }
  }
  return result
}

/**
 * Turns input for one locale into stored maps: each localized value becomes
 * `{ ...current map, [locale]: value }`, so other locales are kept. Array rows are matched to
 * the current rows by id.
 */
export function toLocaleMaps(
  fields: readonly Field[],
  input: Data,
  current: Data,
  locale: string,
): Data {
  const result: Data = { ...input }
  for (const field of fields) {
    if (!Object.hasOwn(input, field.name)) continue
    const value = input[field.name]
    const previous = current[field.name]
    if (field.localized) {
      const map = isPlainObject(previous) ? previous : {}
      result[field.name] = { ...map, [locale]: value }
    } else if (field.type === 'group' && isPlainObject(value)) {
      result[field.name] = toLocaleMaps(
        field.fields,
        value,
        isPlainObject(previous) ? previous : {},
        locale,
      )
    } else if (hasRows(field) && Array.isArray(value)) {
      const rows = new Map(
        (Array.isArray(previous) ? previous : [])
          .filter(isPlainObject)
          .map((row) => [String(row.id), row] as const),
      )
      result[field.name] = value.map((row) => {
        const fields = rowFields(field, row)
        return fields && isPlainObject(row)
          ? toLocaleMaps(fields, row, rows.get(String(row.id)) ?? {}, locale)
          : row
      })
    }
  }
  return result
}

/** Adds the locale to a query path that ends at a localized field: `title` → `title.en`. */
export function localizePath(
  fields: readonly Field[],
  path: string,
  locale: string,
  locales: readonly string[] = [],
): string {
  const segments = path.split('.')
  let list: readonly Field[] = fields
  for (let i = 0; i < segments.length; i++) {
    const field = list.find((f) => f.name === segments[i])
    if (!field) return path
    if (field.localized) {
      // The locale goes right after the localized field: `title.en`, `links.en.label`,
      // unless the path names one already.
      const next = segments[i + 1]
      if (next !== undefined && locales.includes(next)) return path
      return [...segments.slice(0, i + 1), locale, ...segments.slice(i + 1)].join('.')
    }
    if (field.type === 'group' || field.type === 'array') {
      list = field.fields
      continue
    }
    return path
  }
  return path
}

/** Rewrites a `where` so localized fields match the given locale. */
export function localizeWhere(
  fields: readonly Field[],
  where: Where | undefined,
  locale: string,
  locales: readonly string[] = [],
): Where | undefined {
  if (!where) return where
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(where)) {
    if ((key === 'and' || key === 'or') && Array.isArray(value)) {
      out[key] = value.map((w) => localizeWhere(fields, w as Where, locale, locales))
    } else {
      out[localizePath(fields, key, locale, locales)] = value
    }
  }
  return out as Where
}

/** Rewrites sort paths (`title`, `-title`) for the given locale. */
export function localizeSort(
  fields: readonly Field[],
  sort: readonly string[],
  locale: string,
  locales: readonly string[] = [],
) {
  return sort.map((entry) =>
    entry.startsWith('-')
      ? `-${localizePath(fields, entry.slice(1), locale, locales)}`
      : localizePath(fields, entry, locale, locales),
  )
}
