// Actions (#386): buttons that run your code on a document, from its edit page, a list row, or
// on several documents at once (through bulk operations), and over REST and `cms.runAction`.
import type { AuthUser, ID, RequestContext } from './access.js'
import type { ActionArgs, ActionPlace, ActionResult, CollectionAction } from './config.js'
import { validateFields } from './document.js'
import {
  ActionError,
  EasyCMSError,
  ForbiddenError,
  NotFoundError,
  QueryError,
  ValidationError,
} from './errors.js'
import type { EasyCMS } from './local-api.js'

/** An action whose `when` says no for this document: skipped in bulk. */
export class NotApplicableError extends ActionError {
  constructor() {
    super('This doesn’t apply to this document now')
    this.name = 'NotApplicableError'
  }
}

/** The prefix of an action's name in a bulk operation (`action:<name>`). */
export const ACTION_PREFIX = 'action:'
/** Where an action's button is when `on` isn't set. */
const DEFAULT_PLACES: readonly ActionPlace[] = ['document', 'row']

export const placesOf = (action: CollectionAction): readonly ActionPlace[] =>
  action.on ?? DEFAULT_PLACES

/** The collection's action by name; a 404 when there is none. */
export function actionOf(cms: EasyCMS, collection: string, name: string): CollectionAction {
  const config = cms.config.collections.find((c) => c.slug === collection)
  const action = config?.actions?.find((a) => a.name === name)
  if (!action) throw new EasyCMSError(`"${collection}" has no action "${name}"`, 404)
  return action
}

/**
 * Whether the user's role lets them press an action, before looking at a document: with roles,
 * `admins` actions are rights of their own and `editors` ones follow the right to update.
 */
export async function roleAllows(
  cms: EasyCMS,
  user: AuthUser,
  collection: string,
  action: CollectionAction,
): Promise<boolean> {
  if (!cms.roles.enabled) return true
  if ((action.default ?? 'admins') === 'editors')
    return (await cms.roles.allows(user, { collection }, 'update')) !== false
  return cms.roles.allowsAction(user, collection, action.name)
}

/** Why an action can't run on a document, or `null` when it can. */
async function refusal(
  cms: EasyCMS,
  action: CollectionAction,
  args: ActionArgs,
  context: RequestContext | undefined,
): Promise<'forbidden' | 'not-applicable' | null> {
  if (!(await roleAllows(cms, args.user, args.collection, action))) return 'forbidden'
  const allowed = action.access
    ? await action.access(args)
    : (await cms.documentPermissions(args.collection as never, args.doc.id, args.user, context))
        .update
  if (!allowed) return 'forbidden'
  if (action.when && !(await action.when(args))) return 'not-applicable'
  return null
}

/** The document as its edit page shows it (the draft, when there is one); `null` if hidden. */
async function load(
  cms: EasyCMS,
  collection: string,
  id: ID,
  user: AuthUser,
  context: RequestContext | undefined,
) {
  const doc = await cms.findById(collection as never, id, {
    depth: 0,
    draft: true,
    overrideAccess: false,
    user,
    ...(context ? { context } : {}),
  })
  return (doc as (Record<string, unknown> & { id: ID }) | null) ?? null
}

/** The names of the actions the user may press on a document, for its edit page and row menu. */
export async function availableActions(
  cms: EasyCMS,
  collection: string,
  id: ID,
  user: AuthUser,
  context?: RequestContext,
): Promise<string[]> {
  const actions = cms.config.collections.find((c) => c.slug === collection)?.actions ?? []
  if (actions.length === 0) return []
  const doc = await load(cms, collection, id, user, context)
  if (!doc) return []
  const names: string[] = []
  for (const action of actions) {
    const places = placesOf(action)
    if (!places.includes('document') && !places.includes('row')) continue
    try {
      if (!(await refusal(cms, action, { doc, user, cms, collection }, context)))
        names.push(action.name)
    } catch (error) {
      // A failing `when` or `access` hides the button.
      cms.logger.error(`Action ${collection}.${action.name}: ${(error as Error).message}`, {
        error,
      })
    }
  }
  return names
}

/** Checks a form's values against the action's `fields`; the clean values. */
export async function actionInput(
  action: CollectionAction,
  collection: string,
  input: unknown,
): Promise<Record<string, unknown>> {
  if (!action.fields?.length) return {}
  const raw =
    typeof input === 'object' && input !== null && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {}
  const { data, errors } = await validateFields(action.fields, raw, {
    operation: 'create',
    root: raw,
  })
  if (errors.length > 0) throw new ValidationError(collection, errors)
  return data
}

export interface RunActionOptions {
  user: AuthUser
  input?: unknown
  context?: RequestContext
}

/**
 * Runs an action on one document after checking who may, `when` and the form. Throws
 * `ForbiddenError`, `ActionError` (the action's own words) or a general failure.
 */
export async function runAction(
  cms: EasyCMS,
  collection: string,
  name: string,
  id: ID,
  options: RunActionOptions,
): Promise<ActionResult> {
  const action = actionOf(cms, collection, name)
  const input = await actionInput(action, collection, options.input)
  return runOn(cms, collection, action, id, input, options)
}

/** One document of `runAction` or a bulk operation, with the form already checked. */
export async function runOn(
  cms: EasyCMS,
  collection: string,
  action: CollectionAction,
  id: ID,
  input: Record<string, unknown>,
  options: { user: AuthUser; context?: RequestContext },
): Promise<ActionResult> {
  const { user, context } = options
  const doc = await load(cms, collection, id, user, context)
  if (!doc) throw new NotFoundError(collection, id)
  const args: ActionArgs = { doc, user, cms, collection }
  const why = await refusal(cms, action, args, context)
  if (why === 'forbidden') throw new ForbiddenError('You may not do this')
  if (why === 'not-applicable') throw new NotApplicableError()
  let result: ActionResult | undefined
  try {
    result = (await action.run({ ...args, input })) ?? undefined
  } catch (error) {
    await cms.audit.record({
      action: `action.${action.name}`,
      target: collection,
      doc: id,
      user,
      detail: { input, error: (error as Error).message },
      ...(context ? { context } : {}),
    })
    if (error instanceof ActionError || error instanceof EasyCMSError) throw error
    cms.logger.error(`Action ${collection}.${action.name} on ${id}: ${(error as Error).message}`, {
      error,
    })
    throw new EasyCMSError('The action failed: see the server log', 500)
  }
  const out: ActionResult = {
    ...(typeof result?.message === 'string' ? { message: result.message } : {}),
    ...(typeof result?.open === 'string' ? { open: result.open } : {}),
  }
  await cms.audit.record({
    action: `action.${action.name}`,
    target: collection,
    doc: id,
    user,
    detail: { input, ...out },
    ...(context ? { context } : {}),
  })
  return out
}

/** A bulk operation's action name for an action, after checking it may run in bulk. */
export function bulkActionName(cms: EasyCMS, collection: string, name: string): string {
  const action = actionOf(cms, collection, name)
  if (!placesOf(action).includes('bulk'))
    throw new QueryError(`The action "${name}" doesn't run on several documents`)
  return `${ACTION_PREFIX}${name}`
}
