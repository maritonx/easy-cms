// Bulk actions (#280): on up to 100 documents at once, or on every document matching a list's
// filters as an operation that runs in the background, 100 documents a step.
import type { AuthUser, ID, RequestContext, Where } from './access.js'
import { auditContext } from './audit.js'
import { BULK_OPERATIONS, MEDIA } from './builtins.js'
import type { RawDocument } from './database.js'
import { ForbiddenError, NotFoundError, QueryError } from './errors.js'
import type { EasyCMS } from './local-api.js'

export type BulkAction = 'publish' | 'unpublish' | 'delete' | 'move'
export const BULK_ACTIONS: readonly BulkAction[] = ['publish', 'unpublish', 'delete', 'move']
/** Documents a step handles, and the most ids one request may name. */
export const BULK_STEP = 100
/** The most documents one operation may change: past this, the list needs more filters. */
export const BULK_MAX = 10_000
/** How long a step may hold an operation before another process may take it over. */
const LEASE_MS = 60_000
/** Problems kept on an operation (the rest are only counted). */
const PROBLEMS_KEPT = 50
/** Finished operations kept, per user, for the admin's summary. */
const FINISHED_KEPT = 10

/** Why a document was left out: no permission, gone, or an error (with its message). */
export interface BulkProblem {
  id: ID
  reason: 'forbidden' | 'not-found' | 'error'
  message?: string
}

export interface BulkOptions {
  user: AuthUser
  context?: RequestContext
  /** `move`: the folder (`null`: the top). */
  folder?: ID | null
  /** `delete` of users with roles: who gets the documents they own. */
  transferTo?: ID | null
}

/** What a bulk action on named documents did. */
export interface BulkResult {
  done: number
  skipped: BulkProblem[]
  failed: BulkProblem[]
}

/** An operation as the admin sees it. */
export interface BulkOperation {
  id: ID
  collection: string
  action: BulkAction
  state: 'pending' | 'running' | 'cancelling' | 'done' | 'cancelled' | 'failed'
  total: number
  done: number
  skipped: number
  failed: number
  problems: BulkProblem[]
  error: string | null
  createdAt: string
  finishedAt: string | null
}

const ACTIVE = ['pending', 'running', 'cancelling']

function check(cms: EasyCMS, collection: string, action: string, options: BulkOptions) {
  if (!BULK_ACTIONS.includes(action as BulkAction))
    throw new QueryError(`action must be one of ${BULK_ACTIONS.join(', ')}`)
  const config = cms.collection(collection as never)
  if ((action === 'publish' || action === 'unpublish') && !config.drafts)
    throw new QueryError(`"${collection}" has no drafts to publish`)
  if (action === 'move' && collection !== MEDIA)
    throw new QueryError('Only media files move to folders')
  if (action === 'move' && options.folder === undefined)
    throw new QueryError('folder is required to move files')
}

/** One document, as a single edit would do it: hooks, versions, webhooks and access included. */
async function apply(
  cms: EasyCMS,
  collection: string,
  action: BulkAction,
  id: ID,
  options: BulkOptions,
): Promise<BulkProblem | null> {
  const access = {
    overrideAccess: false as const,
    user: options.user,
    ...(options.context ? { context: options.context } : {}),
    depth: 0,
  }
  const slug = collection as never
  try {
    if (action === 'publish') await cms.update(slug, id, { status: 'published' } as never, access)
    else if (action === 'unpublish') await cms.unpublish(slug, id, access)
    else if (action === 'move')
      await cms.update(slug, id, { folder: options.folder ?? null } as never, access)
    else
      await cms.delete(slug, id, {
        ...access,
        ...(options.transferTo !== undefined ? { transferTo: options.transferTo } : {}),
      })
    return null
  } catch (error) {
    if (error instanceof ForbiddenError) return { id, reason: 'forbidden' }
    if (error instanceof NotFoundError) return { id, reason: 'not-found' }
    return { id, reason: 'error', message: (error as Error).message }
  }
}

/**
 * Runs an action on up to 100 named documents now, each with the user's access, going on past
 * documents that fail. Skipped: no permission, or gone; failed: anything else.
 */
export async function bulkIds(
  cms: EasyCMS,
  collection: string,
  action: string,
  ids: readonly ID[],
  options: BulkOptions,
): Promise<BulkResult> {
  check(cms, collection, action, options)
  if (ids.length > BULK_STEP) throw new QueryError(`ids: at most ${BULK_STEP} at a time`)
  const result: BulkResult = { done: 0, skipped: [], failed: [] }
  for (const id of new Set(ids)) {
    const problem = await apply(cms, collection, action as BulkAction, id, options)
    if (!problem) result.done++
    else if (problem.reason === 'error') result.failed.push(problem)
    else result.skipped.push(problem)
  }
  return result
}

/**
 * Starts an action on every document matching `where` that the user can see (drafts included),
 * at most 10,000. It runs in the background; `bulkProgress` says how far it got.
 */
export async function startBulk(
  cms: EasyCMS,
  collection: string,
  action: string,
  where: Where | undefined,
  options: BulkOptions,
): Promise<BulkOperation> {
  check(cms, collection, action, options)
  const total = await cms.count(collection as never, {
    ...(where ? { where } : {}),
    draft: true,
    overrideAccess: false,
    user: options.user,
    ...(options.context ? { context: options.context } : {}),
    max: BULK_MAX,
  })
  if (total > BULK_MAX)
    throw new QueryError(
      `More than ${BULK_MAX.toLocaleString('en')} documents match: filter the list further`,
    )
  const now = new Date().toISOString()
  const row = await cms.db.create({
    collection: BULK_OPERATIONS,
    data: {
      collection,
      action,
      query: where ?? null,
      folder: options.folder === undefined ? null : JSON.stringify(options.folder),
      transferTo: options.transferTo === undefined ? null : JSON.stringify(options.transferTo),
      user: String(options.user.id),
      state: total === 0 ? 'done' : 'pending',
      total,
      done: 0,
      skipped: 0,
      failed: 0,
      after: null,
      problems: [],
      error: null,
      leaseUntil: null,
      finishedAt: total === 0 ? now : null,
      createdAt: now,
      updatedAt: now,
    },
  })
  await cms.audit.record({
    action: `bulk.${action}`,
    target: collection,
    detail: { total, operation: String(row.id) },
  })
  await pruneFinished(cms, String(options.user.id))
  // Where the process keeps running, the whole operation goes on now.
  if (total > 0) void runBulk(cms, row.id).catch(() => {})
  return toOperation(row)
}

/** Steps an operation until it is finished or another process holds it. */
async function runBulk(cms: EasyCMS, id: ID): Promise<void> {
  while (await stepBulk(cms, id)) {}
}

/**
 * Handles the next 100 documents of an operation, unless another process holds it. Returns
 * whether there is more to do.
 */
export async function stepBulk(cms: EasyCMS, id: ID, now: Date = new Date()): Promise<boolean> {
  const row = await cms.db.findById({ collection: BULK_OPERATIONS, id })
  if (!row || !ACTIVE.includes(String(row.state))) return false
  const lease = row.leaseUntil ? Date.parse(String(row.leaseUntil)) : 0
  if (lease > now.getTime()) return false
  // Claimed: one process steps it at a time (compare and set on updatedAt).
  const claimedAt = new Date(Math.max(now.getTime(), Date.parse(String(row.updatedAt)) + 1))
  const claimed = await save(cms, row, {
    state: row.state === 'pending' ? 'running' : row.state,
    leaseUntil: new Date(now.getTime() + LEASE_MS).toISOString(),
    updatedAt: claimedAt.toISOString(),
  })
  if (!claimed) return false
  if (claimed.state === 'cancelling') {
    await finish(cms, claimed, 'cancelled')
    return false
  }
  const user = await cms.auth.activeUser(String(claimed.user))
  if (!user) {
    await finish(cms, claimed, 'failed', 'The user who started it is no longer active')
    return false
  }
  const collection = String(claimed.collection)
  const action = claimed.action as BulkAction
  const options: BulkOptions = {
    user,
    ...(claimed.folder !== null && claimed.folder !== undefined
      ? { folder: JSON.parse(String(claimed.folder)) as ID | null }
      : {}),
    ...(claimed.transferTo !== null && claimed.transferTo !== undefined
      ? { transferTo: JSON.parse(String(claimed.transferTo)) as ID | null }
      : {}),
  }
  const handled = Number(claimed.done) + Number(claimed.skipped) + Number(claimed.failed)
  const query = (claimed.query ?? undefined) as Where | undefined
  const after = claimed.after as ID | null
  const conditions = [query, after === null ? undefined : { id: { gt: after } }].filter(
    (w): w is Where => w !== undefined,
  )
  let found: { docs: { id: ID }[]; hasNextPage: boolean }
  try {
    found = await cms.find(collection as never, {
      ...(conditions.length ? { where: { and: conditions } } : {}),
      sort: 'id',
      limit: Math.min(BULK_STEP, BULK_MAX - handled),
      depth: 0,
      draft: true,
      count: false,
      overrideAccess: false,
      user,
    })
  } catch (error) {
    await finish(cms, claimed, 'failed', (error as Error).message)
    return false
  }
  const changes = {
    done: Number(claimed.done),
    skipped: Number(claimed.skipped),
    failed: Number(claimed.failed),
    problems: [...((claimed.problems as BulkProblem[] | null) ?? [])],
    after: after as unknown,
  }
  await auditContext.run({ user }, async () => {
    for (const doc of found.docs) {
      const problem = await apply(cms, collection, action, doc.id, options)
      if (!problem) changes.done++
      else {
        if (problem.reason === 'error') changes.failed++
        else changes.skipped++
        if (changes.problems.length < PROBLEMS_KEPT) changes.problems.push(problem)
      }
      changes.after = doc.id
    }
  })
  const finished =
    !found.hasNextPage ||
    found.docs.length === 0 ||
    changes.done + changes.skipped + changes.failed >= BULK_MAX
  const at = new Date()
  // A cancel while this step ran: stop here, keeping what it did.
  const saved = await save(cms, claimed, {
    ...changes,
    state: finished ? 'done' : 'running',
    leaseUntil: null,
    finishedAt: finished ? at.toISOString() : null,
    updatedAt: later(at, claimed).toISOString(),
  })
  if (saved) return !finished
  const current = await cms.db.findById({ collection: BULK_OPERATIONS, id })
  if (current?.state === 'cancelling') await finish(cms, { ...current, ...changes }, 'cancelled')
  else if (current) await save(cms, current, { ...changes, leaseUntil: null })
  return false
}

/** A moment after the row's `updatedAt`, so the next compare and set sees the change. */
function later(at: Date, row: RawDocument): Date {
  return new Date(Math.max(at.getTime(), Date.parse(String(row.updatedAt)) + 1))
}

/** Writes changes if the row is still as read (its `updatedAt`); the saved row, or `null`. */
async function save(
  cms: EasyCMS,
  row: RawDocument,
  changes: Record<string, unknown>,
): Promise<RawDocument | null> {
  const { id, ...data } = row
  const next = { ...data, ...changes }
  const saved = await cms.db.update({
    collection: BULK_OPERATIONS,
    id,
    data: next,
    where: { updatedAt: { equals: row.updatedAt as string } },
  })
  return saved ? { ...row, ...changes } : null
}

async function finish(
  cms: EasyCMS,
  row: RawDocument,
  state: 'done' | 'cancelled' | 'failed',
  error?: string,
) {
  const at = new Date()
  await save(cms, row, {
    state,
    leaseUntil: null,
    finishedAt: at.toISOString(),
    updatedAt: later(at, row).toISOString(),
    ...(error ? { error } : {}),
  })
}

/** Runs waiting operations a few steps each, with the jobs; stops after `budgetMs`. */
export async function runBulkOperations(
  cms: EasyCMS,
  now: Date = new Date(),
  budgetMs = 20_000,
): Promise<{ steps: number }> {
  const { docs } = await cms.db.find({
    collection: BULK_OPERATIONS,
    where: { state: { in: ACTIVE } },
    sort: ['createdAt'],
    limit: 20,
    page: 1,
  })
  const until = Date.now() + budgetMs
  let steps = 0
  for (const row of docs) {
    while (Date.now() < until) {
      const more = await stepBulk(cms, row.id, now).catch((error) => {
        cms.logger.error(`Bulk operation ${row.id}: ${(error as Error).message}`, { error })
        return false
      })
      steps++
      if (!more) break
    }
  }
  return { steps }
}

/** An operation of `user`; asking also moves it on by a step when nobody else is. */
export async function bulkProgress(cms: EasyCMS, id: ID, user: AuthUser): Promise<BulkOperation> {
  const row = await mine(cms, id, user)
  if (ACTIVE.includes(String(row.state))) await stepBulk(cms, row.id)
  return toOperation((await cms.db.findById({ collection: BULK_OPERATIONS, id: row.id })) ?? row)
}

/** The user's operations: those running, then the last finished ones, newest first. */
export async function bulkOperations(cms: EasyCMS, user: AuthUser): Promise<BulkOperation[]> {
  const { docs } = await cms.db.find({
    collection: BULK_OPERATIONS,
    where: { user: { equals: String(user.id) } },
    sort: ['-createdAt'],
    limit: FINISHED_KEPT + 20,
    page: 1,
  })
  return docs.map(toOperation)
}

/** Stops an operation after the step running now. */
export async function cancelBulk(cms: EasyCMS, id: ID, user: AuthUser): Promise<BulkOperation> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await mine(cms, id, user)
    if (!ACTIVE.includes(String(row.state))) return toOperation(row)
    const at = new Date()
    const saved = row.leaseUntil
      ? await save(cms, row, { state: 'cancelling', updatedAt: later(at, row).toISOString() })
      : await save(cms, row, {
          state: 'cancelled',
          finishedAt: at.toISOString(),
          updatedAt: later(at, row).toISOString(),
        })
    if (saved) return toOperation(saved)
  }
  return toOperation(await mine(cms, id, user))
}

async function mine(cms: EasyCMS, id: ID, user: AuthUser): Promise<RawDocument> {
  const row = await cms.db.findById({ collection: BULK_OPERATIONS, id })
  if (!row || String(row.user) !== String(user.id)) throw new NotFoundError(BULK_OPERATIONS, id)
  return row
}

/** Keeps the user's last finished operations, deleting older ones. */
async function pruneFinished(cms: EasyCMS, user: string) {
  const { docs } = await cms.db.find({
    collection: BULK_OPERATIONS,
    where: { and: [{ user: { equals: user } }, { state: { not_in: ACTIVE } }] },
    sort: ['-createdAt'],
    limit: 100,
    page: 1,
  })
  for (const old of docs.slice(FINISHED_KEPT))
    await cms.db.delete({ collection: BULK_OPERATIONS, id: old.id })
}

function toOperation(row: RawDocument): BulkOperation {
  return {
    id: row.id,
    collection: String(row.collection),
    action: row.action as BulkAction,
    state: row.state as BulkOperation['state'],
    total: Number(row.total),
    done: Number(row.done),
    skipped: Number(row.skipped),
    failed: Number(row.failed),
    problems: (row.problems as BulkProblem[] | null) ?? [],
    error: (row.error as string | null) ?? null,
    createdAt: String(row.createdAt),
    finishedAt: (row.finishedAt as string | null) ?? null,
  }
}
