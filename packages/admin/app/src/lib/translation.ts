import type { AdminField } from '@easy-cms/core'

type Data = Record<string, unknown>

const isMap = (value: unknown): value is Data =>
  !!value && typeof value === 'object' && !Array.isArray(value)

/** No value: nothing typed, an empty list, or rich text without any text in it. */
function isEmpty(field: AdminField, value: unknown): boolean {
  if (value === null || value === undefined || value === '') return true
  if (Array.isArray(value)) return value.length === 0
  if (field.type === 'richText') return !JSON.stringify(value).includes('"text":')
  return false
}

/**
 * Locales a document still needs translating into: some localized field has a value in the
 * default locale but none in that locale. `doc` comes from `locale=all` (`{ th, en }` maps).
 */
export function missingLocales(
  fields: readonly AdminField[],
  doc: Data,
  locales: readonly string[],
  defaultLocale: string,
): string[] {
  const localized = fields.filter((f) => f.localized)
  return locales.filter(
    (locale) =>
      locale !== defaultLocale &&
      localized.some((field) => {
        const map = doc[field.name]
        return isMap(map) && !isEmpty(field, map[defaultLocale]) && isEmpty(field, map[locale])
      }),
  )
}

/**
 * A `locale=all` document shown in one locale: localized maps become that locale's value, or the
 * first of `fallbacks` that has one.
 */
export function inLocale(
  fields: readonly AdminField[],
  doc: Data,
  locale: string,
  fallbacks: readonly string[] = [],
): Data {
  const out: Data = { ...doc }
  for (const field of fields) {
    const map = doc[field.name]
    if (!field.localized || !isMap(map)) continue
    const found = [locale, ...fallbacks].find((l) => !isEmpty(field, map[l]))
    out[field.name] = found === undefined ? null : map[found]
  }
  return out
}
