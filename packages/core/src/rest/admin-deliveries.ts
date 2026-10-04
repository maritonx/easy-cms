import type { ID } from '../access.js'
import { EMAIL_DELIVERIES, WEBHOOK_DELIVERIES } from '../builtins.js'
import type { RawDocument } from '../database.js'
import { NotFoundError } from '../errors.js'
import type { EasyCMS } from '../local-api.js'

export type DeliveryKind = 'webhook' | 'email'
export type DeliveryState = 'failed' | 'pending'

interface DeliveryBase {
  id: ID
  state: DeliveryState
  attempts: number
  /** The last attempt's error. */
  error: string | null
  createdAt: string
  updatedAt: string
  /** When a pending one is tried again. */
  nextAttemptAt: string
}

/** A webhook delivery as the admin shows it (`GET <api>/admin/deliveries?kind=webhook`). */
export interface AdminWebhookDelivery extends DeliveryBase {
  kind: 'webhook'
  url: string
  event: string
  /** What changed: a document of a collection, or a global. */
  collection?: string
  doc?: ID
  global?: string
  /** The JSON body as sent. */
  body: string
}

/** An email as the admin shows it: who to and the subject, not the content. */
export interface AdminEmailDelivery extends DeliveryBase {
  kind: 'email'
  to: string[]
  subject: string
}

export type AdminDelivery = AdminWebhookDelivery | AdminEmailDelivery

export interface AdminDeliveries {
  docs: AdminDelivery[]
  totalDocs: number
  page: number
  totalPages: number
  /** How many there are of each state, for the filter. */
  counts: Record<DeliveryState, number>
}

const PER_PAGE = 50
const collectionOf = (kind: DeliveryKind) =>
  kind === 'webhook' ? WEBHOOK_DELIVERIES : EMAIL_DELIVERIES
const exists = (cms: EasyCMS, kind: DeliveryKind) =>
  cms.config.collections.some((c) => c.slug === collectionOf(kind))

export const isDeliveryKind = (value: unknown): value is DeliveryKind =>
  value === 'webhook' || value === 'email'

function parse(text: unknown): Record<string, unknown> {
  try {
    const value = JSON.parse(String(text ?? ''))
    return typeof value === 'object' && value !== null ? value : {}
  } catch {
    return {}
  }
}

function toAdmin(kind: DeliveryKind, row: RawDocument): AdminDelivery {
  const base: DeliveryBase = {
    id: row.id,
    state: row.state === 'failed' ? 'failed' : 'pending',
    attempts: Number(row.attempts ?? 0),
    error: typeof row.error === 'string' ? row.error : null,
    createdAt: String(row.createdAt ?? ''),
    updatedAt: String(row.updatedAt ?? ''),
    nextAttemptAt: String(row.nextAttemptAt ?? ''),
  }
  if (kind === 'webhook') {
    const payload = parse(row.body)
    return {
      ...base,
      kind,
      url: String(row.url ?? ''),
      event: String(row.event ?? ''),
      ...(typeof payload.collection === 'string' ? { collection: payload.collection } : {}),
      ...(typeof payload.id === 'string' || typeof payload.id === 'number'
        ? { doc: payload.id }
        : {}),
      ...(typeof payload.global === 'string' ? { global: payload.global } : {}),
      body: String(row.body ?? ''),
    }
  }
  const message = parse(row.message)
  const to = message.to
  return {
    ...base,
    kind,
    to: Array.isArray(to) ? to.map(String) : typeof to === 'string' ? [to] : [],
    subject: String(message.subject ?? ''),
  }
}

/** Saved webhook deliveries or emails, newest first, 50 per page. */
export async function listDeliveries(
  cms: EasyCMS,
  kind: DeliveryKind,
  state: DeliveryState,
  page: number,
): Promise<AdminDeliveries> {
  if (!exists(cms, kind))
    return { docs: [], totalDocs: 0, page: 1, totalPages: 0, counts: { failed: 0, pending: 0 } }
  const collection = collectionOf(kind)
  const [found, failed, pending] = await Promise.all([
    cms.db.find({
      collection,
      where: { state: { equals: state } },
      sort: ['-updatedAt'],
      limit: PER_PAGE,
      page,
    }),
    cms.db.count({ collection, where: { state: { equals: 'failed' } } }),
    cms.db.count({ collection, where: { state: { equals: 'pending' } } }),
  ])
  return {
    docs: found.docs.map((row) => toAdmin(kind, row)),
    totalDocs: found.totalDocs,
    page: found.page,
    totalPages: found.totalPages,
    counts: { failed, pending },
  }
}

/** Tries every failed one again now, one after another. */
export async function retryFailedDeliveries(
  cms: EasyCMS,
  kind: DeliveryKind,
): Promise<{ sent: number; failed: number }> {
  if (!exists(cms, kind)) return { sent: 0, failed: 0 }
  const collection = collectionOf(kind)
  // The ids first: retrying changes the rows (sent ones are deleted), which would shift pages.
  const ids: ID[] = []
  for (let page = 1; ; page++) {
    const { docs, hasNextPage } = await cms.db.find({
      collection,
      where: { state: { equals: 'failed' } },
      sort: ['updatedAt'],
      limit: 500,
      page,
    })
    ids.push(...docs.map((row) => row.id))
    if (!hasNextPage) break
  }
  let sent = 0
  let failed = 0
  for (const id of ids) {
    const result = await cms.retryDelivery(kind, id)
    if (result.ok) sent++
    else failed++
  }
  return { sent, failed }
}

/** Deletes one saved delivery. */
export async function deleteDelivery(cms: EasyCMS, kind: DeliveryKind, id: ID): Promise<void> {
  const collection = collectionOf(kind)
  if (!exists(cms, kind) || !(await cms.db.findById({ collection, id })))
    throw new NotFoundError(collection, id)
  await cms.db.delete({ collection, id })
}

/** Deletes every failed one. */
export async function deleteFailedDeliveries(
  cms: EasyCMS,
  kind: DeliveryKind,
): Promise<{ deleted: number }> {
  if (!exists(cms, kind)) return { deleted: 0 }
  const collection = collectionOf(kind)
  let deleted = 0
  for (;;) {
    const { docs } = await cms.db.find({
      collection,
      where: { state: { equals: 'failed' } },
      sort: ['updatedAt'],
      limit: 100,
      page: 1,
    })
    for (const row of docs) await cms.db.delete({ collection, id: row.id })
    deleted += docs.length
    if (docs.length < 100) break
  }
  return { deleted }
}
