import type { AuthUser, ID } from './access.js'
import { OUTBOX } from './builtins.js'
import type { Database, OutboxRow, RawDocument } from './database.js'
import type { Logger } from './logger.js'

/** What a save leaves to run after it commits (`outbox: true`). */
export interface OutboxEntry {
  /** As the webhook event. */
  readonly event: 'create' | 'update' | 'draft' | 'delete'
  /** The collection's or the global's slug. */
  readonly target: string
  readonly global: boolean
  /** `null` for a global. */
  readonly docId: string | null
  /** The stored status before the save. */
  readonly before: string | null
  readonly doc: Record<string, unknown>
  readonly previousDoc: Record<string, unknown> | undefined
  readonly user: AuthUser | null
}

/** Parts of an entry done before the last, `httpCache.purge`; a retry skips them. */
export type OutboxStep = 'hooks' | 'webhooks'

/** Runs an entry; `done` holds the steps done before, `mark` records one more. */
export type OutboxRunner = (
  entry: OutboxEntry,
  done: ReadonlySet<OutboxStep>,
  mark: (step: OutboxStep) => Promise<void>,
) => Promise<void>

/** After the first attempt fails; then the entry is marked failed. */
const DELAYS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000]
/** A claimed entry stays out of other workers' way this long, in case its worker stops. */
const LEASE = 5 * 60_000
const BATCH = 50

const later = (from: Date, ms: number) => new Date(from.getTime() + ms).toISOString()
const json = (value: unknown) => (value === undefined ? null : JSON.stringify(value))
const parse = (value: unknown) => (typeof value === 'string' ? JSON.parse(value) : undefined)

/** Stored without what signs a user in, which the outbox has no use for. */
function withoutHash<T extends Record<string, unknown> | null | undefined>(value: T): T {
  if (!value || !('passwordHash' in value)) return value
  const { passwordHash: _, ...rest } = value
  return rest as T
}

/**
 * The outbox (ADR-0053): rows written with each save, in its transaction, then run after it
 * commits, retried until they succeed. Rows are claimed by compare and set, so each runs in one
 * process at a time however many run the outbox (ADR-0052).
 */
export class Outbox {
  private draining: Promise<void> | undefined
  private again = false

  constructor(
    private readonly db: Database,
    private readonly logger: Logger,
    private readonly runner: OutboxRunner,
  ) {}

  /** The row a save writes. For a create, `doc` has no id yet: it gets the written one. */
  row(entry: Omit<OutboxEntry, 'docId'> & { docId?: ID | undefined }): OutboxRow {
    return {
      collection: OUTBOX,
      data: (id) => {
        const docId = entry.global ? null : String(entry.docId ?? id)
        const doc = entry.event === 'create' ? { ...entry.doc, id } : entry.doc
        const now = new Date().toISOString()
        return {
          event: entry.event,
          target: entry.target,
          global: entry.global,
          docId,
          before: entry.before,
          doc: JSON.stringify(withoutHash(doc)),
          previousDoc: json(withoutHash(entry.previousDoc)),
          user: json(withoutHash(entry.user)),
          done: null,
          attempts: 0,
          nextAttemptAt: now,
          state: 'pending',
          error: null,
          createdAt: now,
          updatedAt: now,
        }
      },
    }
  }

  /** Runs what is due in the background, e.g. right after a save commits. */
  kick(): void {
    if (this.draining) {
      this.again = true
      return
    }
    this.draining = (async () => {
      do {
        this.again = false
        await this.run()
      } while (this.again)
    })()
      .catch((error) => this.logger.error(`Outbox: ${(error as Error).message}`, { error }))
      .finally(() => {
        this.draining = undefined
      })
  }

  /** Waits until the background run started by `kick` is over. */
  async flush(): Promise<void> {
    while (this.draining) await this.draining
  }

  /**
   * Runs entries that are due: new ones, retries whose time came, and those a stopped worker
   * left claimed. Runs with scheduled jobs too, which catches what `kick` missed.
   */
  async run(now: Date = new Date()): Promise<{ ran: number; failed: number }> {
    let ran = 0
    let failed = 0
    for (;;) {
      const { docs } = await this.db.find({
        collection: OUTBOX,
        where: {
          and: [
            { state: { in: ['pending', 'running'] } },
            { nextAttemptAt: { lte: now.toISOString() } },
          ],
        },
        sort: ['nextAttemptAt', 'id'],
        limit: BATCH,
        page: 1,
      })
      let claimed = 0
      for (const row of docs) {
        const result = await this.runRow(row, now)
        if (result === undefined) continue
        claimed++
        if (result) ran++
        else failed++
      }
      // Rows other workers took leave the batch; stop when nothing here was ours.
      if (docs.length < BATCH || claimed === 0) return { ran, failed }
    }
  }

  /** Puts a failed entry back in line, e.g. from the admin. */
  async retry(id: ID): Promise<boolean> {
    const row = await this.db.findById({ collection: OUTBOX, id })
    if (!row || row.state !== 'failed') return false
    const { id: _, ...data } = row
    const now = new Date().toISOString()
    const updated = await this.db.update({
      collection: OUTBOX,
      id,
      data: { ...data, state: 'pending', attempts: 0, nextAttemptAt: now, updatedAt: now },
      where: { state: { equals: 'failed' } },
    })
    if (updated) this.kick()
    return updated !== null
  }

  /** `true` when it ran, `false` when it failed, `undefined` when another worker has it. */
  private async runRow(row: RawDocument, now: Date): Promise<boolean | undefined> {
    const { id, ...data } = row
    const attempts = Number(data.attempts ?? 0) + 1
    let current: Record<string, unknown> = {
      ...data,
      state: 'running',
      attempts,
      nextAttemptAt: later(now, LEASE),
      updatedAt: new Date().toISOString(),
    }
    const claimed = await this.db.update({
      collection: OUTBOX,
      id,
      data: current,
      where: {
        and: [{ state: { equals: data.state } }, { nextAttemptAt: { equals: data.nextAttemptAt } }],
      },
    })
    if (!claimed) return undefined

    const done = new Set(
      String(data.done ?? '')
        .split(',')
        .filter(Boolean) as OutboxStep[],
    )
    const mark = async (step: OutboxStep) => {
      done.add(step)
      current = { ...current, done: [...done].join(','), updatedAt: new Date().toISOString() }
      await this.db.update({ collection: OUTBOX, id, data: current })
    }
    try {
      await this.runner(entryOf(data), done, mark)
      await this.db.delete({ collection: OUTBOX, id })
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const delay = DELAYS[attempts - 1]
      await this.db.update({
        collection: OUTBOX,
        id,
        data: {
          ...current,
          state: delay === undefined ? 'failed' : 'pending',
          nextAttemptAt: later(now, delay ?? 0),
          error: message,
          updatedAt: new Date().toISOString(),
        },
      })
      const what = `${data.event} of ${data.global ? 'global ' : ''}"${data.target}"`
      if (delay === undefined)
        this.logger.error(`Outbox gave up on ${what} after ${attempts} attempts: ${message}`)
      else this.logger.warn(`Outbox: ${what} failed (${message}); will retry`)
      return false
    }
  }
}

function entryOf(row: Record<string, unknown>): OutboxEntry {
  return {
    event: row.event as OutboxEntry['event'],
    target: String(row.target),
    global: row.global === true,
    docId: typeof row.docId === 'string' ? row.docId : null,
    before: typeof row.before === 'string' ? row.before : null,
    doc: parse(row.doc) ?? {},
    previousDoc: parse(row.previousDoc),
    user: parse(row.user) ?? null,
  }
}
