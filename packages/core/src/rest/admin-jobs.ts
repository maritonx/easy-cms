import type { ID } from '../access.js'
import { type AuthUser, isSystemAdmin } from '../access.js'
import {
  EMAIL_DELIVERIES,
  JOB_RUNS,
  OUTBOX,
  SCHEDULED_JOBS,
  WEBHOOK_DELIVERIES,
} from '../builtins.js'
import type { ResolvedConfig } from '../config.js'
import type { RawDocument } from '../database.js'
import { parseId } from '../document.js'
import { EasyCMSError, ForbiddenError, NotFoundError, QueryError } from '../errors.js'
import { type EasyCMS, jobSchedule } from '../local-api.js'
import { nextAt } from '../time-of-day.js'

/** One of the config's `jobs`, with its last run here (Settings → Jobs). */
export interface AdminJob {
  name: string
  /** Seconds between runs in effect; `null`: every time jobs run (or daily, with `at`). */
  every: number | null
  /** Time of day in effect (`HH:MM` in `timeZone`), or `null`. */
  at: string | null
  /** The config's schedule, which `every` and `at` differ from when an admin changed them. */
  code: { every: number | null; at: string | null }
  /** Admins may change its schedule (`adminSchedule`). */
  adminSchedule: boolean
  /** Paused from Settings → Jobs: when and by whom (an email). */
  paused: { at: string; by: string | null } | null
  /** An admin's schedule in place of the config's: who set it and when. */
  changed: { by: string | null; at: string | null } | null
  /** ISO time of the last run, `null` before the first. */
  lastRunAt: string | null
  /** ISO time it is next due; `null`: whenever jobs next run. */
  nextAt: string | null
  /** `null` before its first run here (or a time carried over from before `job-runs`). */
  lastStatus: 'running' | 'ok' | 'failed' | null
  lastError: string | null
  lastDurationMs: number | null
}

/** A scheduled publish or unpublish that hasn't finished: waiting, running, or failed. */
export interface AdminScheduledJob {
  id: ID
  action: 'publish' | 'unpublish'
  runAt: string
  state: 'pending' | 'running' | 'failed'
  error: string | null
  /** The document's collection, or the global (`global`), and the document's id (0 for globals). */
  collection?: string
  global?: string
  doc: ID
}

/** An outbox entry (`outbox: true`) that failed: being retried, or given up on. */
export interface AdminOutboxEntry {
  id: ID
  event: 'create' | 'update' | 'draft' | 'delete'
  /** The document's collection, or the global (`global`), and the document's id. */
  collection?: string
  global?: string
  doc: string | null
  attempts: number
  /** `pending`: retried at `nextAttemptAt`; `failed`: given up, until someone retries it. */
  state: 'pending' | 'running' | 'failed'
  error: string | null
  nextAttemptAt: string
}

export interface AdminOutbox {
  /** Entries waiting to run (new, or to be retried). */
  waiting: number
  failed: number
  /** Entries that failed at least once, latest first (at most 100). */
  entries: AdminOutboxEntry[]
}

/** What Settings → Jobs shows (`GET <api>/admin/jobs`). */
/** Work Easy CMS itself does with every run of the jobs, when it is set up. */
export type BuiltInJob = 'scheduled' | 'webhooks' | 'emails' | 'outbox' | 'backups' | 'audit'

export interface AdminJobs {
  jobs: AdminJob[]
  /** When jobs last ran (the scheduler, the cron endpoint), `null` if never. */
  lastRanAt: string | null
  /** Built-in work done with every run, in the order it runs. */
  builtIn: BuiltInJob[]
  /** The time zone of `at` (`timeZone` in the config), `null`: the server's. */
  timeZone: string | null
  /** This user may pause jobs and change schedules (admins of the whole system). */
  canChange: boolean
  /** `null` when nothing uses `schedule`. */
  scheduled: AdminScheduledJob[] | null
  /** `null` without `outbox: true`. */
  outbox: AdminOutbox | null
}

const has = (config: ResolvedConfig, slug: string) =>
  config.collections.some((c) => c.slug === slug)

/** Whether there is background work to show: the config's `jobs`, or scheduled publishing. */
export function hasJobsPage(config: ResolvedConfig): boolean {
  return config.jobs.length > 0 || has(config, SCHEDULED_JOBS) || has(config, OUTBOX)
}

const text = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null)

export async function adminJobs(cms: EasyCMS, user: AuthUser): Promise<AdminJobs> {
  const { config } = cms
  const rows = has(config, JOB_RUNS)
    ? (await cms.db.find({ collection: JOB_RUNS, sort: ['name'], limit: 0, page: 1 })).docs
    : []
  const byName = new Map(rows.map((row) => [String(row.name), row]))
  const jobs = config.jobs.map((job): AdminJob => {
    const row = byName.get(job.name)
    const lastRunAt = text(row?.lastRunAt)
    const status = row?.lastStatus
    const schedule = jobSchedule(job, row)
    const pausedAt = text(row?.pausedAt)
    const next = !lastRunAt
      ? null
      : schedule.at
        ? nextAt(schedule.at, schedule.every ?? 86_400, lastRunAt, config.timeZone).toISOString()
        : schedule.every !== undefined
          ? new Date(Date.parse(lastRunAt) + schedule.every * 1000).toISOString()
          : null
    return {
      name: job.name,
      every: schedule.every ?? null,
      at: schedule.at ?? null,
      code: { every: job.every ?? null, at: job.at ?? null },
      adminSchedule: job.adminSchedule === true,
      paused: pausedAt ? { at: pausedAt, by: text(row?.pausedBy) } : null,
      changed: schedule.overridden ? { by: text(row?.changedBy), at: text(row?.changedAt) } : null,
      lastRunAt,
      nextAt: pausedAt ? null : next,
      lastStatus: status === 'running' || status === 'ok' || status === 'failed' ? status : null,
      lastError: text(row?.lastError),
      lastDurationMs: typeof row?.lastDurationMs === 'number' ? row.lastDurationMs : null,
    }
  })
  const builtIn: BuiltInJob[] = [
    ...(has(config, SCHEDULED_JOBS) ? (['scheduled'] as const) : []),
    ...(has(config, WEBHOOK_DELIVERIES) ? (['webhooks'] as const) : []),
    ...(has(config, EMAIL_DELIVERIES) ? (['emails'] as const) : []),
    ...(has(config, OUTBOX) ? (['outbox'] as const) : []),
    ...(config.backups?.frequency ? (['backups'] as const) : []),
    ...(config.audit ? (['audit'] as const) : []),
  ]
  const head = {
    jobs,
    lastRanAt: await cms.jobsLastRan(),
    builtIn,
    timeZone: config.timeZone ?? null,
    canChange: isSystemAdmin(user),
    outbox: has(config, OUTBOX) ? await adminOutbox(cms) : null,
  }
  if (!has(config, SCHEDULED_JOBS)) return { ...head, scheduled: null }
  const { docs } = await cms.db.find({
    collection: SCHEDULED_JOBS,
    where: { state: { in: ['pending', 'running', 'failed'] } },
    sort: ['runAt'],
    limit: 100,
    page: 1,
  })
  const scheduled = docs.map((row): AdminScheduledJob => {
    const parent = String(row.parent)
    // `global:<slug>`, or `global:<slug>@<scope>` for a global kept per scope (e.g. tenant).
    const target = parent.startsWith('global:')
      ? { global: parent.slice('global:'.length).split('@')[0] as string }
      : { collection: parent }
    return {
      id: row.id,
      action: row.action === 'unpublish' ? 'unpublish' : 'publish',
      runAt: String(row.runAt),
      state: row.state === 'running' || row.state === 'failed' ? row.state : 'pending',
      error: text(row.error),
      ...target,
      doc: row.doc as ID,
    }
  })
  return { ...head, scheduled }
}

async function adminOutbox(cms: EasyCMS): Promise<AdminOutbox> {
  const count = (state: string[]) =>
    cms.db.count({ collection: OUTBOX, where: { state: { in: state } } })
  const { docs } = await cms.db.find({
    collection: OUTBOX,
    where: { attempts: { gt: 0 } },
    sort: ['-updatedAt'],
    limit: 100,
    page: 1,
  })
  return {
    waiting: await count(['pending', 'running']),
    failed: await count(['failed']),
    entries: docs
      // Running for the first time, not failed.
      .filter((row) => text(row.error) !== null)
      .map((row) => ({
        id: row.id,
        event: row.event as AdminOutboxEntry['event'],
        ...(row.global === true
          ? { global: String(row.target) }
          : { collection: String(row.target) }),
        doc: text(row.docId),
        attempts: Number(row.attempts ?? 0),
        state: row.state === 'failed' || row.state === 'running' ? row.state : 'pending',
        error: text(row.error),
        nextAttemptAt: String(row.nextAttemptAt),
      })),
  }
}

/** Puts a failed outbox entry back in line (`POST <api>/admin/jobs/outbox/:id`). */
export async function retryOutbox(cms: EasyCMS, user: AuthUser, id: string): Promise<void> {
  if (!isSystemAdmin(user)) throw new ForbiddenError()
  if (!has(cms.config, OUTBOX)) throw new NotFoundError(OUTBOX, id)
  const row = await cms.db.findById({ collection: OUTBOX, id: parseId(id) ?? 0 })
  if (!row) throw new NotFoundError(OUTBOX, id)
  if (!(await cms.retryOutbox(row.id)))
    throw new EasyCMSError('Only failed entries can be retried', 409)
}

/** What an admin may change on a job (`PATCH <api>/admin/jobs/:name`). */
export interface AdminJobUpdate {
  paused?: boolean
  /** Seconds between runs; `null` (with `at: null`): back to the config's schedule. */
  every?: number | null
  /** `HH:MM`; `null`: no time of day. */
  at?: string | null
}

const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/

/** Pauses or resumes a job, or sets its schedule; returns what changed, for the audit log. */
export async function updateJob(
  cms: EasyCMS,
  user: AuthUser,
  name: string,
  body: unknown,
): Promise<{
  action: 'jobs.pause' | 'jobs.resume' | 'jobs.schedule'
  detail: Record<string, unknown>
}> {
  if (!isSystemAdmin(user)) throw new ForbiddenError()
  const job = cms.config.jobs.find((j) => j.name === name)
  if (!job) throw new NotFoundError(JOB_RUNS, name)
  const update = (body ?? {}) as AdminJobUpdate
  const keys = Object.keys(update)
  const bad = (message: string) => new QueryError(message)
  let changes: Record<string, unknown>
  let result: {
    action: 'jobs.pause' | 'jobs.resume' | 'jobs.schedule'
    detail: Record<string, unknown>
  }
  const now = new Date().toISOString()
  const by = user.email ?? String(user.id)
  if (keys.length === 1 && keys[0] === 'paused') {
    if (typeof update.paused !== 'boolean') throw bad('paused must be true or false')
    changes = update.paused ? { pausedAt: now, pausedBy: by } : { pausedAt: null, pausedBy: null }
    result = { action: update.paused ? 'jobs.pause' : 'jobs.resume', detail: { job: name } }
  } else if (keys.length > 0 && keys.every((k) => k === 'every' || k === 'at')) {
    if (!job.adminSchedule) throw bad(`${name}'s schedule is set in the config (no adminSchedule)`)
    const every = update.every ?? null
    const at = update.at ?? null
    if (every !== null && !(typeof every === 'number' && Number.isInteger(every) && every >= 60))
      throw bad('every must be a whole number of seconds, 60 or more')
    if (at !== null && !(typeof at === 'string' && TIME_OF_DAY.test(at)))
      throw bad('at must be a time like "02:00"')
    if (at !== null && every !== null && every % 86_400 !== 0)
      throw bad('every must be a number of whole days with at')
    const reset = every === null && at === null
    changes = reset
      ? { everyOverride: null, atOverride: null, changedBy: null, changedAt: null }
      : { everyOverride: every, atOverride: at, changedBy: by, changedAt: now }
    result = { action: 'jobs.schedule', detail: { job: name, every, at, reset } }
  } else throw bad('send { paused } or { every, at }')
  await writeJobRow(cms, name, changes)
  return result
}

/** Writes `changes` to the job's row, made if missing, without losing a run claimed meanwhile. */
async function writeJobRow(cms: EasyCMS, name: string, changes: Record<string, unknown>) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { docs } = await cms.db.find({
      collection: JOB_RUNS,
      where: { name: { equals: name } },
      sort: ['name'],
      limit: 1,
      page: 1,
    })
    const row = docs[0] as RawDocument | undefined
    const stamp = new Date().toISOString()
    if (!row) {
      const created = await cms.db
        .create({
          collection: JOB_RUNS,
          // Never run here: due as soon as it may run.
          data: {
            name,
            lastRunAt: new Date(0).toISOString(),
            ...changes,
            createdAt: stamp,
            updatedAt: stamp,
          },
        })
        .then(
          () => true,
          () => false,
        )
      if (created) return
      continue
    }
    const { id, ...data } = row
    // Compare and set on the last run: a run claimed in between is kept, then this is retried.
    const written = await cms.db.update({
      collection: JOB_RUNS,
      id,
      data: { ...data, ...changes, updatedAt: stamp },
      where: { lastRunAt: { equals: String(row.lastRunAt) } },
    })
    if (written) return
  }
  throw new EasyCMSError('The job is busy; try again', 409)
}

/** Jobs paused from Settings → Jobs, for the dashboard: so a pause isn't forgotten. */
export async function pausedJobs(cms: EasyCMS): Promise<string[]> {
  if (!has(cms.config, JOB_RUNS)) return []
  const { docs } = await cms.db.find({ collection: JOB_RUNS, sort: ['name'], limit: 0, page: 1 })
  const names = new Set(cms.config.jobs.map((job) => job.name))
  return docs
    .filter((row) => typeof row.pausedAt === 'string' && row.pausedAt !== '')
    .map((row) => String(row.name))
    .filter((name) => names.has(name))
}

/** Jobs whose last run failed, for the dashboard's attention list. */
export async function failedJobs(cms: EasyCMS): Promise<string[]> {
  if (!has(cms.config, JOB_RUNS)) return []
  const { docs } = await cms.db.find({
    collection: JOB_RUNS,
    where: { lastStatus: { equals: 'failed' } },
    sort: ['name'],
    limit: 0,
    page: 1,
  })
  const names = new Set(cms.config.jobs.map((job) => job.name))
  return docs.map((row) => String(row.name)).filter((name) => names.has(name))
}
