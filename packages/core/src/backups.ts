import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { gzip } from 'node:zlib'
import type { ID } from './access.js'
import { DATABASE_BACKUPS, USERS } from './builtins.js'
import type { Config } from './config.js'
import { copyDatabase } from './copy.js'
import type { RawDocument } from './database.js'
import { EasyCMSError, NotFoundError } from './errors.js'
import type { EasyCMS } from './local-api.js'
import { localStorage, type StorageAdapter } from './storage.js'

const gzipAsync = promisify(gzip)

export const DEFAULT_BACKUP_TIME = '03:00'
export const DEFAULT_BACKUP_KEEP = 7
const DEFAULT_DIR = 'backups'
/** A backup still pending or running after this long was interrupted (a stopped process). */
const STALE = 30 * 60_000
const PERIOD = { day: 86_400_000, week: 7 * 86_400_000 } as const

export type BackupState = 'pending' | 'running' | 'done' | 'failed'

/** One backup as the admin shows it (`GET <api>/admin/backups`). */
export interface AdminBackup {
  id: ID
  state: BackupState
  trigger: 'manual' | 'scheduled'
  /** The file's name, e.g. `my-site-2026-10-04-0300.db.gz`. */
  filename: string | null
  /** Bytes, compressed. */
  size: number | null
  startedAt: string | null
  finishedAt: string | null
  error: string | null
  /** Who started it (manual backups). */
  author: string | null
  downloadedBy: string | null
  downloadedAt: string | null
}

/** Settings → Backups (`GET <api>/admin/backups`). */
export interface AdminBackups {
  settings: {
    every: 'day' | 'week' | null
    at: string
    keep: number
    /** The storage adapter's name, e.g. `local` or `s3`. */
    storage: string
    /** The folder, for local storage. */
    dir: string | null
    database: string
    /** Why backups can't be made with this setup, if they can't. */
    unavailable: string | null
  }
  backups: AdminBackup[]
}

const storages = new WeakMap<EasyCMS, Promise<StorageAdapter>>()

/** Where backups are kept: `backups.storage`, else a private local folder. */
export function backupStorage(cms: EasyCMS): Promise<StorageAdapter> {
  let storage = storages.get(cms)
  if (!storage) {
    storage = (async () => {
      const config = cms.config.backups
      const adapter = config?.storage ?? localStorage({ dir: config?.dir ?? DEFAULT_DIR })
      await adapter.init?.({ cwd: cms.cwd })
      return adapter
    })()
    storages.set(cms, storage)
  }
  return storage
}

/** Why this setup can't make backups, or `null` when it can. */
export function backupUnavailable(cms: EasyCMS): string | null {
  if (cms.db.backup || cms.config.backups?.sqlite) return null
  return `The ${cms.config.db.name} database needs the SQLite adapter to write backups: backups: { sqlite } with sqlite from @easy-cms/db-sqlite`
}

/**
 * Writes a consistent copy of the database to `file` as SQLite, while the CMS keeps running:
 * SQLite copies itself; other databases are copied into a new SQLite file (`backups.sqlite`).
 */
export async function writeBackupFile<C extends Config>(
  cms: EasyCMS<C>,
  file: string,
): Promise<void> {
  if (cms.db.backup) return cms.db.backup(file)
  const factory = cms.config.backups?.sqlite
  if (!factory) throw new EasyCMSError(backupUnavailable(cms as unknown as EasyCMS) as string, 400)
  // The same table names: the copy and a later restore match table for table.
  const prefix = cms.db.tablePrefix
  // Copied into a scratch file first: SQLite keeps recent writes in its WAL file, and
  // `backup()` (VACUUM INTO) then writes everything as one consistent file.
  const scratch = `${file}.copy`
  const adapter = factory({ url: `file:${scratch}`, ...(prefix ? { tablePrefix: prefix } : {}) })
  const target = await adapter.init({
    config: { ...cms.config, db: adapter },
    cwd: cms.cwd,
    schema: 'push',
    logger: { ...cms.logger, info() {} },
  })
  try {
    await copyDatabase(cms.db, target)
    if (!target.backup) throw new EasyCMSError('backups.sqlite must be the SQLite adapter', 400)
    await target.backup(file)
  } finally {
    await target.destroy()
    for (const suffix of ['', '-wal', '-shm'])
      await rm(`${scratch}${suffix}`, { force: true }).catch(() => {})
  }
}

const slug = (text: string) =>
  text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'easy-cms'

/** `<site>-YYYY-MM-DD-HHmm.db.gz`, in the server's time zone. */
function filenameFor(cms: EasyCMS, date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`
  return `${slug(cms.config.admin.brand.name || 'easy-cms')}-${stamp}.db.gz`
}

function toAdmin(row: RawDocument): AdminBackup {
  const text = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null)
  return {
    id: row.id,
    state: (['pending', 'running', 'done', 'failed'] as const).includes(row.state as BackupState)
      ? (row.state as BackupState)
      : 'failed',
    trigger: row.trigger === 'scheduled' ? 'scheduled' : 'manual',
    filename: text(row.filename),
    size: typeof row.size === 'number' ? row.size : null,
    startedAt: text(row.startedAt),
    finishedAt: text(row.finishedAt),
    error: text(row.error),
    author: text(row.author),
    downloadedBy: text(row.downloadedBy),
    downloadedAt: text(row.downloadedAt),
  }
}

async function update(cms: EasyCMS, row: RawDocument, data: Record<string, unknown>) {
  const { id, ...rest } = row
  const next = { ...rest, ...data, updatedAt: new Date().toISOString() }
  await cms.db.update({ collection: DATABASE_BACKUPS, id, data: next })
  return { ...row, ...data }
}

/** The settings and every backup, newest first. */
export async function listBackups(cms: EasyCMS): Promise<AdminBackups> {
  const config = cms.config.backups
  const storage = await backupStorage(cms)
  const { docs } = await cms.db.find({
    collection: DATABASE_BACKUPS,
    sort: ['-createdAt'],
    limit: 0,
    page: 1,
  })
  return {
    settings: {
      every: config?.every ?? null,
      at: config?.at ?? DEFAULT_BACKUP_TIME,
      keep: config?.keep ?? DEFAULT_BACKUP_KEEP,
      storage: storage.name,
      dir: config?.storage ? null : (config?.dir ?? DEFAULT_DIR),
      database: cms.config.db.name,
      unavailable: backupUnavailable(cms),
    },
    backups: docs.map(toAdmin),
  }
}

/** A backup pending or running and not stale: only one runs at a time. */
async function inProgress(cms: EasyCMS, now: number): Promise<RawDocument | undefined> {
  const { docs } = await cms.db.find({
    collection: DATABASE_BACKUPS,
    where: { state: { in: ['pending', 'running'] } },
    sort: ['-createdAt'],
    limit: 10,
    page: 1,
  })
  return docs.find((row) => now - Date.parse(String(row.createdAt)) < STALE)
}

/**
 * Starts a backup in the background and returns its record at once (Settings → Backups).
 * If the process stops first, the next scheduled-jobs run finishes it.
 */
export async function startBackup(
  cms: EasyCMS,
  trigger: 'manual' | 'scheduled',
  author?: string,
): Promise<AdminBackup> {
  const unavailable = backupUnavailable(cms)
  if (unavailable) throw new EasyCMSError(unavailable, 400)
  const now = new Date()
  if (await inProgress(cms, now.getTime()))
    throw new EasyCMSError('A backup is already running', 409)
  const stamp = now.toISOString()
  const row = await cms.db.create({
    collection: DATABASE_BACKUPS,
    data: {
      state: 'pending',
      trigger,
      filename: null,
      size: null,
      startedAt: null,
      finishedAt: null,
      error: null,
      author: author ?? null,
      downloadedBy: null,
      downloadedAt: null,
      createdAt: stamp,
      updatedAt: stamp,
    },
  })
  void runBackup(cms, row).catch((error) =>
    cms.logger.error(`Backup failed: ${(error as Error).message}`),
  )
  return toAdmin(row)
}

/** Makes the backup for a pending record: write, compress, store, then keep only the newest. */
async function runBackup(cms: EasyCMS, record: RawDocument): Promise<void> {
  const started = new Date()
  let row = await update(cms, record, { state: 'running', startedAt: started.toISOString() })
  const dir = await mkdtemp(join(tmpdir(), 'easy-cms-backup-'))
  try {
    const file = join(dir, 'backup.db')
    await writeBackupFile(cms, file)
    const data = new Uint8Array(await gzipAsync(await readFile(file)))
    const storage = await backupStorage(cms)
    const filename = filenameFor(cms, started)
    // Two backups in the same minute: keep both.
    const key = (await storage.get(filename))
      ? filename.replace(/\.db\.gz$/, `-${row.id}.db.gz`)
      : filename
    await storage.put(key, data, { contentType: 'application/gzip' })
    // Older ones go first, so the list never shows more than `keep` finished backups.
    await pruneBackups(cms, 1)
    row = await update(cms, row, {
      state: 'done',
      filename: key,
      size: data.byteLength,
      finishedAt: new Date().toISOString(),
    })
    cms.logger.info(`Backup ${key} written (${data.byteLength} bytes)`)
  } catch (error) {
    await update(cms, row, {
      state: 'failed',
      error: ((error as Error).message || String(error)).slice(0, 500),
      finishedAt: new Date().toISOString(),
    })
    throw error
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/**
 * Keeps the newest `keep` finished backups (minus `room` for ones about to finish), and failed
 * records for 30 days.
 */
async function pruneBackups(cms: EasyCMS, room = 0): Promise<void> {
  const keep = Math.max(0, (cms.config.backups?.keep ?? DEFAULT_BACKUP_KEEP) - room)
  const storage = await backupStorage(cms)
  const { docs } = await cms.db.find({
    collection: DATABASE_BACKUPS,
    where: { state: { equals: 'done' } },
    sort: ['-createdAt'],
    limit: 0,
    page: 1,
  })
  for (const row of docs.slice(keep)) {
    if (typeof row.filename === 'string') await storage.delete(row.filename).catch(() => {})
    await cms.db.delete({ collection: DATABASE_BACKUPS, id: row.id })
  }
  const old = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const failed = await cms.db.find({
    collection: DATABASE_BACKUPS,
    where: { and: [{ state: { equals: 'failed' } }, { createdAt: { lt: old } }] },
    sort: ['createdAt'],
    limit: 100,
    page: 1,
  })
  for (const row of failed.docs) await cms.db.delete({ collection: DATABASE_BACKUPS, id: row.id })
}

/** The latest slot of a schedule at or before `now`: today's (or the past) `HH:MM`. */
function lastSlot(now: Date, at: string): Date {
  const [hours, minutes] = at.split(':').map(Number) as [number, number]
  const slot = new Date(now)
  slot.setHours(hours, minutes, 0, 0)
  if (slot.getTime() > now.getTime()) slot.setDate(slot.getDate() - 1)
  return slot
}

/**
 * Runs with scheduled jobs: finishes backups a stopped process left pending, marks stale
 * running ones as interrupted, and starts the scheduled backup when its time has come.
 */
export async function runDueBackups(cms: EasyCMS, now: Date = new Date()): Promise<void> {
  if (backupUnavailable(cms)) return
  const { docs } = await cms.db.find({
    collection: DATABASE_BACKUPS,
    where: { state: { in: ['pending', 'running'] } },
    sort: ['createdAt'],
    limit: 10,
    page: 1,
  })
  for (const row of docs) {
    const age = now.getTime() - Date.parse(String(row.updatedAt ?? row.createdAt))
    if (age < STALE) continue
    if (row.state === 'pending') await runBackup(cms, row).catch(() => {})
    else
      await update(cms, row, {
        state: 'failed',
        error: 'Interrupted: the server stopped during the backup',
        finishedAt: now.toISOString(),
      })
  }

  const every = cms.config.backups?.every
  if (!every) return
  const slot = lastSlot(now, cms.config.backups?.at ?? DEFAULT_BACKUP_TIME)
  const latest = await cms.db.find({
    collection: DATABASE_BACKUPS,
    where: { trigger: { equals: 'scheduled' } },
    sort: ['-createdAt'],
    limit: 1,
    page: 1,
  })
  const last = latest.docs[0] ? Date.parse(String(latest.docs[0].createdAt)) : 0
  // Daily: once per slot. Weekly: at the slot, a week after the last one.
  const due =
    every === 'day' ? last < slot.getTime() : last < slot.getTime() - PERIOD.week + PERIOD.day
  if (!due) return
  if (await inProgress(cms, now.getTime())) return
  await startBackup(cms, 'scheduled').catch((error) =>
    cms.logger.error(`Scheduled backup could not start: ${(error as Error).message}`),
  )
}

/** For the dashboard: the last scheduled backup failed, or none finished in two periods. */
export async function backupAttention(
  cms: EasyCMS,
  now: number = Date.now(),
): Promise<{ id: 'backups'; failed: boolean; lastDone: string | null } | null> {
  const every = cms.config.backups?.every
  if (!every) return null
  const [scheduled, done] = await Promise.all([
    cms.db.find({
      collection: DATABASE_BACKUPS,
      where: { trigger: { equals: 'scheduled' } },
      sort: ['-createdAt'],
      limit: 1,
      page: 1,
    }),
    cms.db.find({
      collection: DATABASE_BACKUPS,
      where: { state: { equals: 'done' } },
      sort: ['-createdAt'],
      limit: 1,
      page: 1,
    }),
  ])
  const failed = scheduled.docs[0]?.state === 'failed'
  const lastDone = done.docs[0] ? String(done.docs[0].createdAt) : null
  // Without any backup yet, count from the site's first user (a new site has had no chance).
  let since = lastDone ? Date.parse(lastDone) : undefined
  if (since === undefined) {
    const first = await cms.db.find({ collection: USERS, sort: ['createdAt'], limit: 1, page: 1 })
    since = first.docs[0] ? Date.parse(String(first.docs[0].createdAt)) : now
  }
  const overdue = now - since > 2 * PERIOD[every]
  return failed || overdue ? { id: 'backups', failed, lastDone } : null
}

/** A finished backup's file, recording who downloaded it. */
export async function downloadBackup(
  cms: EasyCMS,
  id: ID,
  by: string,
): Promise<{ filename: string; body: Uint8Array }> {
  const row = await cms.db.findById({ collection: DATABASE_BACKUPS, id })
  if (row?.state !== 'done' || typeof row.filename !== 'string')
    throw new NotFoundError(DATABASE_BACKUPS, id)
  const file = await (await backupStorage(cms)).get(row.filename)
  if (!file)
    throw new EasyCMSError(`The file ${row.filename} is no longer in the backup storage`, 404)
  await update(cms, row, { downloadedBy: by, downloadedAt: new Date().toISOString() })
  return { filename: row.filename, body: file.body }
}

/** Deletes a backup and its file. */
export async function deleteBackup(cms: EasyCMS, id: ID): Promise<void> {
  const row = await cms.db.findById({ collection: DATABASE_BACKUPS, id })
  if (!row) throw new NotFoundError(DATABASE_BACKUPS, id)
  if (row.state === 'running' || row.state === 'pending')
    throw new EasyCMSError('A backup in progress cannot be deleted', 409)
  if (typeof row.filename === 'string')
    await (await backupStorage(cms)).delete(row.filename).catch(() => {})
  await cms.db.delete({ collection: DATABASE_BACKUPS, id })
}
