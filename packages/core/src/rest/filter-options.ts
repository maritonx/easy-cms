import type { AuthUser, ID, Where } from '../access.js'
import { QueryError } from '../errors.js'
import type { Field } from '../fields.js'
import type { EasyCMS } from '../local-api.js'

/** The field at a form path (`parent`, `links.0.page`, `meta.author`); row indexes are skipped. */
function fieldAt(fields: readonly Field[], path: string): Field | undefined {
  let current: readonly Field[] | undefined = fields
  let found: Field | undefined
  for (const part of path.split('.')) {
    if (/^\d+$/.test(part)) continue
    found = current?.find((f) => f.name === part)
    if (!found) return undefined
    current = found.type === 'array' || found.type === 'group' ? found.fields : undefined
  }
  return found
}

/**
 * The `filterOptions` of the relationship a picker searches for (`?filterFor=<collection>.<path>`
 * or `?filterForGlobal=<global>.<path>`, with `filterId=<id>` for a saved document), as a
 * `where` on `target`. It only ever narrows what the user may already read.
 */
export async function pickerFilter(
  cms: EasyCMS,
  url: URL,
  target: string,
  user: AuthUser | null,
): Promise<Where | undefined> {
  const forCollection = url.searchParams.get('filterFor')
  const forGlobal = url.searchParams.get('filterForGlobal')
  const spec = forCollection ?? forGlobal
  if (spec === null) return undefined
  const dot = spec.indexOf('.')
  const slug = dot > 0 ? spec.slice(0, dot) : ''
  const owner =
    forCollection !== null
      ? cms.config.collections.find((c) => c.slug === slug)
      : cms.config.globals.find((g) => g.slug === slug)
  const field = owner ? fieldAt(owner.fields, spec.slice(dot + 1)) : undefined
  if (field?.type !== 'relationship' || field.to !== target)
    throw new QueryError(`filterFor: no relationship to "${target}" at "${spec}"`)
  if (!field.filterOptions) return undefined
  const rawId = url.searchParams.get('filterId')
  const id: ID | undefined =
    rawId === null || rawId === '' ? undefined : /^\d+$/.test(rawId) ? Number(rawId) : rawId
  const where = await field.filterOptions({ id, user, cms })
  return where === true ? undefined : where
}
