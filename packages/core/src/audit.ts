import { AsyncLocalStorage } from 'node:async_hooks'
import { createHmac } from 'node:crypto'
import type { AuthUser, ID, Where } from './access.js'
import { AUDIT_LOGS, INTERNAL_COLLECTIONS } from './builtins.js'
import type { CollectionConfig, GlobalConfig } from './config.js'
import type { RawDocument } from './database.js'
import type { Field } from './fields.js'
import type { EasyCMS } from './local-api.js'

/** Audit log settings (`audit`). */
export interface AuditConfig {
  /** Days to keep entries; older ones are deleted. `0`: keep them all. Default 365. */
  readonly keep?: number
  /** Keep the values before and after a change, not only which fields changed. Default `true`. */
  readonly values?: boolean
  /** Failed logins within an hour that the dashboard warns about. Default 20. */
  readonly failedLogins?: number
}

export const DEFAULT_AUDIT_KEEP = 365
export const DEFAULT_FAILED_LOGINS = 20
/** Values longer than this are cut. */
const MAX_VALUE = 500
const PAGE = 50
const CSV_LIMIT = 10_000
const DAY = 86_400_000
/** Fields whose values are not kept, only that they changed. */
const BULKY = new Set(['richText', 'blocks', 'array', 'json'])

/** What one request (or job) is: who, from where. Set by the REST handler and the scheduler. */
export interface AuditContext {
  readonly user?: AuthUser | null
  readonly ip?: string | undefined
  readonly userAgent?: string | null
  readonly via?: 'scheduler'
}
export const auditContext = new AsyncLocalStorage<AuditContext>()

/** A field that changed: values before and after, unless they are not kept. */
export interface AuditChange {
  field: string
  before?: unknown
  after?: unknown
}

/** One entry (`GET <api>/admin/audit`). */
export interface AuditEntry {
  id: ID
  /** When, as an ISO date. */
  at: string
  /** E.g. `create`, `update`, `publish`, `delete`, `login`, `login.failed`, `role.update`. */
  action: string
  /** A collection slug, `global:<slug>`, or an area such as `auth`, `roles`, `backups`. */
  target: string | null
  /** The document's id. */
  doc: string | null
  /** The document's title then (kept after it is deleted). */
  title: string | null
  actor: {
    id: string | null
    email: string | null
    /** `user` (admin or REST), `api-key`, `system` (code), `scheduler`. */
    via: string
    ip: string | null
    userAgent: string | null
  }
  changes: AuditChange[] | null
  detail: Record<string, unknown> | null
}

/** `GET <api>/admin/audit`: a page of entries, newest first. */
export interface AuditPage {
  docs: AuditEntry[]
  page: number
  totalPages: number
  totalDocs: number
}

export interface AuditFilter {
  action?: string | null
  target?: string | null
  doc?: string | null
  /** An email, or part of one. */
  actor?: string | null
  /** ISO dates. */
  from?: string | null
  to?: string | null
}

/** `POST <api>/admin/audit/verify`. */
export interface AuditVerification {
  checked: number
  /** Entries whose signature does not match: changed after they were written. */
  invalid: ID[]
  /** Missing ids between entries: deleted entries, or (rarely) inserts that failed. */
  gaps: number
  at: string
}

/** JSON with keys in order, so a signature survives databases that reorder them (jsonb). */
function stable(value: unknown): string {
  if (value === undefined || value === null) return 'null'
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (typeof value === 'object') {
    const keys = Object.keys(value as object)
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

const SIGNED = [
  'action',
  'target',
  'doc',
  'title',
  'actorId',
  'actorEmail',
  'via',
  'ip',
  'userAgent',
  'changes',
  'detail',
  'createdAt',
] as const

function cut(value: unknown): unknown {
  if (typeof value === 'string')
    return value.length > MAX_VALUE ? `${value.slice(0, MAX_VALUE)}…` : value
  if (value !== null && typeof value === 'object') {
    const json = JSON.stringify(value)
    return json.length > MAX_VALUE ? '…' : value
  }
  return value
}

const text = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null)

/**
 * The audit log (`audit` in the config): who did what, when, from where. Entries can't be
 * changed through Easy CMS; each is signed with the secret, so changes in the database show.
 * Available as `cms.audit`.
 */
export class AuditLog {
  /** Entries that could not be written since the server started. */
  failures = 0

  constructor(private readonly cms: EasyCMS) {}

  get enabled(): boolean {
    return this.cms.config.audit !== false
  }

  private get settings() {
    return (
      this.cms.config.audit || {
        keep: DEFAULT_AUDIT_KEEP,
        values: true,
        failedLogins: DEFAULT_FAILED_LOGINS,
      }
    )
  }

  /**
   * Writes an entry. The user defaults to the request's. Never throws: a failure is logged and
   * counted, and the dashboard says so.
   */
  async record(entry: {
    action: string
    target?: string | null
    doc?: ID | null
    title?: string | null
    user?: AuthUser | null
    /** Who it was when there is no user, e.g. the email of a failed login. */
    email?: string | null
    changes?: AuditChange[] | null
    detail?: Record<string, unknown> | null
  }): Promise<void> {
    if (!this.enabled) return
    try {
      const context = auditContext.getStore()
      const user = entry.user !== undefined ? entry.user : (context?.user ?? null)
      const apiKey = user?.apiKey as { name?: string } | undefined
      const row: Record<string, unknown> = {
        action: entry.action,
        target: entry.target ?? null,
        doc: entry.doc === undefined || entry.doc === null ? null : String(entry.doc),
        title: entry.title ? cut(entry.title) : null,
        actorId: user ? String(user.id) : null,
        actorEmail: user?.email ?? entry.email ?? null,
        via: apiKey
          ? 'api-key'
          : context?.via === 'scheduler'
            ? 'scheduler'
            : user
              ? 'user'
              : 'system',
        ip: context?.ip ?? null,
        userAgent: context?.userAgent ? context.userAgent.slice(0, 200) : null,
        changes: entry.changes && entry.changes.length > 0 ? entry.changes : null,
        detail: apiKey ? { ...entry.detail, apiKey: apiKey.name ?? '' } : (entry.detail ?? null),
        createdAt: new Date().toISOString(),
      }
      row.signature = this.sign(row)
      row.updatedAt = row.createdAt
      await this.cms.db.create({ collection: AUDIT_LOGS, data: row })
    } catch (error) {
      this.failures++
      this.cms.logger.error(
        `Audit log: could not write "${entry.action}": ${(error as Error).message}`,
      )
    }
  }

  /**
   * A change to a document or global: what changed between `before` and `after`. Internal
   * collections (sessions, versions…) are not logged.
   */
  async content(
    config: CollectionConfig | GlobalConfig,
    global: boolean,
    action: string,
    after: Record<string, unknown> | undefined,
    before: Record<string, unknown> | undefined,
    user: AuthUser | null,
  ): Promise<void> {
    if (!this.enabled) return
    if (!global && INTERNAL_COLLECTIONS.has(config.slug)) return
    const doc = after ?? before
    const titleField = global ? undefined : (config as CollectionConfig).useAsTitle
    const rawTitle = titleField ? doc?.[titleField] : undefined
    const title =
      typeof rawTitle === 'string'
        ? rawTitle
        : rawTitle && typeof rawTitle === 'object'
          ? text(
              Object.values(rawTitle as Record<string, unknown>).find((v) => typeof v === 'string'),
            )
          : null
    await this.record({
      action,
      target: global ? `global:${config.slug}` : config.slug,
      doc: global ? null : ((doc?.id as ID | undefined) ?? null),
      title,
      // A trusted call without a user keeps the request's (or is the system).
      ...(user ? { user } : {}),
      changes: action === 'delete' ? null : this.diff(config.fields, before ?? {}, after ?? {}),
    })
  }

  /** Fields whose stored value changed. Hidden ones never (the password only as "changed"). */
  diff(
    fields: readonly Field[],
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): AuditChange[] {
    const values = this.settings.values
    const out: AuditChange[] = []
    for (const field of fields) {
      if (field.hidden) continue
      const a = before[field.name]
      const b = after[field.name]
      if (stable(a) === stable(b)) continue
      if (!values || BULKY.has(field.type)) out.push({ field: field.name })
      else out.push({ field: field.name, before: cut(a ?? null), after: cut(b ?? null) })
    }
    if (before.passwordHash !== after.passwordHash && (before.passwordHash || after.passwordHash))
      out.push({ field: 'password' })
    return out
  }

  async list(filter: AuditFilter, page = 1): Promise<AuditPage> {
    const result = await this.cms.db.find({
      collection: AUDIT_LOGS,
      where: this.where(filter),
      sort: ['-id'],
      limit: PAGE,
      page,
    })
    return {
      docs: result.docs.map(toEntry),
      page: result.page,
      totalPages: result.totalPages,
      totalDocs: result.totalDocs,
    }
  }

  /** The filtered entries as CSV (the newest 10,000). */
  async csv(filter: AuditFilter): Promise<string> {
    const { docs } = await this.cms.db.find({
      collection: AUDIT_LOGS,
      where: this.where(filter),
      sort: ['-id'],
      limit: CSV_LIMIT,
      page: 1,
    })
    const cell = (value: unknown) => {
      const s =
        value === null || value === undefined
          ? ''
          : typeof value === 'string'
            ? value
            : JSON.stringify(value)
      // Spreadsheets run cells that start like a formula: quote those.
      const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
      return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
    }
    const lines = [
      ['at', 'action', 'target', 'doc', 'title', 'actor', 'via', 'ip', 'changes', 'detail'].join(
        ',',
      ),
      ...docs
        .map(toEntry)
        .map((e) =>
          [
            e.at,
            e.action,
            e.target,
            e.doc,
            e.title,
            e.actor.email,
            e.actor.via,
            e.actor.ip,
            e.changes,
            e.detail,
          ]
            .map(cell)
            .join(','),
        ),
    ]
    return `${lines.join('\r\n')}\r\n`
  }

  /** Checks every entry's signature, and that no ids are missing. */
  async verify(): Promise<AuditVerification> {
    const invalid: ID[] = []
    let checked = 0
    let gaps = 0
    let previous: number | undefined
    for (let page = 1; ; page++) {
      const result = await this.cms.db.find({
        collection: AUDIT_LOGS,
        sort: ['id'],
        limit: 500,
        page,
      })
      for (const row of result.docs) {
        checked++
        if (row.signature !== this.sign(row)) invalid.push(row.id)
        const id = Number(row.id)
        if (previous !== undefined && Number.isInteger(id) && id > previous + 1)
          gaps += id - previous - 1
        previous = id
      }
      if (page >= result.totalPages) break
    }
    const verification = { checked, invalid, gaps, at: new Date().toISOString() }
    await this.record({
      action: 'audit.verify',
      target: 'audit',
      detail: { checked, invalid: invalid.length, gaps },
    })
    return verification
  }

  /**
   * Daily upkeep from `runJobs`: deletes entries older than `keep` days, then verifies the log.
   * Runs when the last check is more than a day old.
   */
  async upkeep(now: Date = new Date()): Promise<void> {
    if (!this.enabled) return
    const last = await this.lastVerification()
    if (last && now.getTime() - Date.parse(last.at) < DAY) return
    const keep = this.settings.keep
    if (keep > 0) {
      const before = new Date(now.getTime() - keep * DAY).toISOString()
      for (;;) {
        const { docs } = await this.cms.db.find({
          collection: AUDIT_LOGS,
          where: { createdAt: { lt: before } },
          sort: ['id'],
          limit: 500,
          page: 1,
        })
        for (const row of docs) await this.cms.db.delete({ collection: AUDIT_LOGS, id: row.id })
        if (docs.length < 500) break
      }
    }
    await auditContext.run({ via: 'scheduler', user: null }, () => this.verify())
  }

  /** What the dashboard warns about: many failed logins, entries not written, a failed check. */
  async attention(
    now: Date = new Date(),
  ): Promise<
    (
      | { id: 'failed-logins'; count: number }
      | { id: 'audit-failures'; count: number }
      | { id: 'audit-tampered'; invalid: number; at: string }
    )[]
  > {
    if (!this.enabled) return []
    const out: Awaited<ReturnType<AuditLog['attention']>> = []
    const hour = new Date(now.getTime() - 3_600_000).toISOString()
    const failed = await this.cms.db.count({
      collection: AUDIT_LOGS,
      where: {
        and: [{ action: { in: ['login.failed', 'sso.failed'] } }, { createdAt: { gte: hour } }],
      },
    })
    if (failed >= this.settings.failedLogins) out.push({ id: 'failed-logins', count: failed })
    if (this.failures > 0) out.push({ id: 'audit-failures', count: this.failures })
    const last = await this.lastVerification()
    if (last && last.invalid > 0)
      out.push({ id: 'audit-tampered', invalid: last.invalid, at: last.at })
    return out
  }

  // -------------------------------------------------------------------------

  private sign(row: Record<string, unknown>): string {
    const payload = stable(SIGNED.map((key) => row[key] ?? null))
    return createHmac('sha256', this.cms.config.secret)
      .update(`audit:${payload}`)
      .digest('base64url')
  }

  private async lastVerification(): Promise<{ at: string; invalid: number } | null> {
    const { docs } = await this.cms.db.find({
      collection: AUDIT_LOGS,
      where: { action: { equals: 'audit.verify' } },
      sort: ['-id'],
      limit: 1,
      page: 1,
    })
    const row = docs[0]
    if (!row) return null
    const detail = (row.detail ?? {}) as { invalid?: number }
    return { at: String(row.createdAt), invalid: detail.invalid ?? 0 }
  }

  private where(filter: AuditFilter): Where | undefined {
    const parts: Where[] = []
    if (filter.action) {
      // `login` also finds `login.failed`; `role` finds `role.create`, `role.update`…
      parts.push({
        or: [{ action: { equals: filter.action } }, { action: { like: `${filter.action}.` } }],
      })
    }
    if (filter.target) parts.push({ target: { equals: filter.target } })
    if (filter.doc) parts.push({ doc: { equals: filter.doc } })
    if (filter.actor) parts.push({ actorEmail: { like: filter.actor } })
    if (filter.from) parts.push({ createdAt: { gte: filter.from } })
    if (filter.to) parts.push({ createdAt: { lte: filter.to } })
    return parts.length === 0 ? undefined : parts.length === 1 ? parts[0] : { and: parts }
  }
}

function toEntry(row: RawDocument): AuditEntry {
  return {
    id: row.id,
    at: String(row.createdAt),
    action: String(row.action),
    target: text(row.target),
    doc: text(row.doc),
    title: text(row.title),
    actor: {
      id: text(row.actorId),
      email: text(row.actorEmail),
      via: String(row.via ?? 'system'),
      ip: text(row.ip),
      userAgent: text(row.userAgent),
    },
    changes: (row.changes as AuditChange[] | null) ?? null,
    detail: (row.detail as Record<string, unknown> | null) ?? null,
  }
}
