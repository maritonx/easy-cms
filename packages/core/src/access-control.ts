import { type Access, type AccessArgs, type AuthUser, isLoggedIn, type Where } from './access.js'
import { QueryError } from './errors.js'
import { type Field, hasRows, rowFields } from './fields.js'

type Data = Record<string, unknown>

/** Runs an access function; a missing one means "logged-in users only" (FR-ACL-03). */
export async function evaluateAccess(
  access: Access | undefined,
  args: AccessArgs,
): Promise<boolean | Where> {
  const result = await (access ?? isLoggedIn)(args)
  if (typeof result === 'boolean') return result
  if (typeof result === 'object' && result !== null) return result
  throw new QueryError('Access functions must return a boolean or a where query')
}

/** Combines a query with an access constraint. */
export function andWhere(where: Where | undefined, constraint: true | Where): Where | undefined {
  if (constraint === true) return where
  return where === undefined ? constraint : { and: [where, constraint] }
}

/**
 * Field-level access, evaluated once per field for one operation.
 * `null` user means the request is not logged in.
 */
export class FieldAccessChecker {
  private readonly cache = new Map<Field, boolean>()

  /** `rules`: the user's role's rules for top-level fields (`auth.rbac`), on top of `access`. */
  constructor(
    private readonly kind: 'read' | 'update',
    private readonly args: AccessArgs,
    private readonly rules?: ReadonlyMap<Field, 'read' | 'hidden'>,
  ) {}

  async allows(field: Field): Promise<boolean> {
    const rule = this.rules?.get(field)
    if (rule === 'hidden' || (rule === 'read' && this.kind === 'update')) return false
    const fn = field.access?.[this.kind]
    if (!fn) return true
    let allowed = this.cache.get(field)
    if (allowed === undefined) {
      allowed = (await fn(this.args)) === true
      this.cache.set(field, allowed)
    }
    return allowed
  }
}

/**
 * Removes fields the caller may not see: hidden fields always,
 * fields whose `access.read` denies when a checker is given.
 */
export async function stripFields(
  fields: readonly Field[],
  doc: Data,
  read?: FieldAccessChecker,
): Promise<Data> {
  const result: Data = { ...doc }
  for (const field of fields) {
    if (!(field.name in result)) continue
    if (field.hidden || (read && !(await read.allows(field)))) {
      delete result[field.name]
      continue
    }
    const value = result[field.name]
    if (field.type === 'group' && value && typeof value === 'object') {
      result[field.name] = await stripFields(field.fields, value as Data, read)
    } else if (hasRows(field) && Array.isArray(value)) {
      result[field.name] = await Promise.all(
        value.map((row) => {
          const fields = rowFields(field, row)
          return fields && row && typeof row === 'object'
            ? stripFields(fields, row as Data, read)
            : row
        }),
      )
    }
  }
  return result
}

/**
 * Removes input the caller may not set: hidden fields always,
 * fields whose `access.update` denies when a checker is given.
 */
export async function filterInput(
  fields: readonly Field[],
  data: Data,
  update?: FieldAccessChecker,
): Promise<Data> {
  const result: Data = { ...data }
  for (const field of fields) {
    if (!(field.name in result)) continue
    if (field.hidden || (update && !(await update.allows(field)))) {
      delete result[field.name]
      continue
    }
    const value = result[field.name]
    if (field.type === 'group' && value && typeof value === 'object' && !Array.isArray(value)) {
      result[field.name] = await filterInput(field.fields, value as Data, update)
    } else if (hasRows(field) && Array.isArray(value)) {
      result[field.name] = await Promise.all(
        value.map((row) => {
          const fields = rowFields(field, row)
          return fields && row && typeof row === 'object'
            ? filterInput(fields, row as Data, update)
            : row
        }),
      )
    }
  }
  return result
}

export type { AuthUser }
