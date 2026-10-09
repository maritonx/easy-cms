// When a field is shown (`admin.condition`): plain data the admin and the server both read. No
// Node.js imports: the admin bundles this file as `@easy-cms/core/conditions`.

/**
 * When a field is shown, from its sibling fields' values (the fields beside it, in its group,
 * array row or block):
 *
 * - `{ field: 'linkType', equals: 'external' }`, also `not_equals`, `in: [...]`, `not_in: [...]`,
 *   `exists: true` (named as in `where`)
 * - `{ and: [...] }`, `{ or: [...] }`, `{ not: … }`
 *
 * A hidden field isn't required, and keeps its value.
 */
export type FieldCondition =
  | {
      /** A sibling field's name; a path with `.` reads inside a group, e.g. `link.type`. */
      readonly field: string
      readonly equals?: unknown
      readonly not_equals?: unknown
      readonly in?: readonly unknown[]
      readonly not_in?: readonly unknown[]
      /** `true`: has a value (not empty); `false`: empty. */
      readonly exists?: boolean
    }
  | { readonly and: readonly FieldCondition[] }
  | { readonly or: readonly FieldCondition[] }
  | { readonly not: FieldCondition }

type Data = Record<string, unknown>

const empty = (value: unknown) =>
  value === undefined ||
  value === null ||
  value === '' ||
  value === false ||
  (Array.isArray(value) && value.length === 0)

/** A relationship's value compares by id, populated or not. */
const plain = (value: unknown): unknown =>
  value && typeof value === 'object' && !Array.isArray(value) && 'id' in (value as Data)
    ? (value as Data).id
    : value

const same = (a: unknown, b: unknown): boolean => {
  const x = plain(a)
  const y = plain(b)
  if (Array.isArray(x)) return x.some((v) => same(v, y))
  return x === y || (x !== null && y !== null && x !== undefined && String(x) === String(y))
}

function read(data: Data, path: string): unknown {
  let current: unknown = data
  for (const key of path.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as Data)[key]
  }
  return current
}

/** Whether a condition holds for the sibling data. */
export function matchesCondition(condition: FieldCondition, data: Data): boolean {
  if ('and' in condition) return condition.and.every((c) => matchesCondition(c, data))
  if ('or' in condition) return condition.or.some((c) => matchesCondition(c, data))
  if ('not' in condition) return !matchesCondition(condition.not, data)
  const value = read(data, condition.field)
  if (condition.exists !== undefined && empty(value) === condition.exists) return false
  if ('equals' in condition && !same(value, condition.equals)) return false
  if ('not_equals' in condition && same(value, condition.not_equals)) return false
  if (condition.in && !condition.in.some((v) => same(value, v))) return false
  if (condition.not_in?.some((v) => same(value, v))) return false
  return true
}

/** Problems with a condition, for the config's checks; `[]` when it's fine. */
export function conditionIssues(condition: unknown, siblings: readonly string[]): string[] {
  if (typeof condition !== 'object' || condition === null || Array.isArray(condition))
    return ['must be an object, e.g. { field: "type", equals: "link" }']
  const c = condition as Record<string, unknown>
  if (Array.isArray(c.and)) return c.and.flatMap((x) => conditionIssues(x, siblings))
  if (Array.isArray(c.or)) return c.or.flatMap((x) => conditionIssues(x, siblings))
  if ('not' in c) return conditionIssues(c.not, siblings)
  if (typeof c.field !== 'string' || c.field === '') return ['needs `field`, a sibling field']
  const first = c.field.split('.')[0] as string
  if (!siblings.includes(first)) return [`"${c.field}" is not a field beside it`]
  if ('notEquals' in c) return ['`notEquals` is now `not_equals`, as in `where`']
  if (c.in !== undefined && !Array.isArray(c.in)) return ['`in` must be a list']
  if (c.not_in !== undefined && !Array.isArray(c.not_in)) return ['`not_in` must be a list']
  if (c.exists !== undefined && typeof c.exists !== 'boolean')
    return ['`exists` must be true or false']
  return []
}
