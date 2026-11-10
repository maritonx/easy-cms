import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { gzip } from 'node:zlib'
import type { AuthUser, ID } from './access.js'
import { getSetting, setSetting } from './admin-settings.js'
import { DATABASE_BACKUPS, USERS } from './builtins.js'
import type { Config } from './config.js'
import { copyDatabase } from './copy.js'
import type { RawDocument } from './database.js'
import { EasyCMSError, NotFoundError, ValidationError } from './errors.js'
import type { BackupDestination } from './integrations.js'
import type { EasyCMS } from './local-api.js'
import { diskStorage, type StorageAdapter } from './storage.js'
import { lastSlot } from './time-of-day.js'

const gzipAsync = promisify(gzip)

/** Start of an encrypted backup file (`backups.encryptionKey`): magic, IV, ciphertext, tag. */
const MAGIC = Buffer.from('ECMSBAK1')
const IV_BYTES = 12
const TAG_BYTES = 16

const keyOf = (encryptionKey: string) => createHash('sha256').update(encryptionKey).digest()

/** Encrypts a backup file with AES-256-GCM. */
export function encryptBackup(data: Uint8Array, encryptionKey: string): Uint8Array {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', keyOf(encryptionKey), iv)
  const body = Buffer.concat([cipher.update(data), cipher.final()])
  return new Uint8Array(Buffer.concat([MAGIC, iv, body, cipher.getAuthTag()]))
}

/** Decrypts a file from `encryptBackup`; throws for another key or a changed file. */
export function decryptBackup(data: Uint8Array, encryptionKey: string): Uint8Array {
  const buffer = Buffer.from(data)
  if (buffer.length < MAGIC.length + IV_BYTES + TAG_BYTES || !buffer.subarray(0, 8).equals(MAGIC))
    throw new EasyCMSError('Not an encrypted Easy CMS backup', 400)
  const iv = buffer.subarray(MAGIC.length, MAGIC.length + IV_BYTES)
  const tag = buffer.subarray(buffer.length - TAG_BYTES)
  const body = buffer.subarray(MAGIC.length + IV_BYTES, buffer.length - TAG_BYTES)
  const decipher = createDecipheriv('aes-256-gcm', keyOf(encryptionKey), iv)
  decipher.setAuthTag(tag)
  try {
    return new Uint8Array(Buffer.concat([decipher.update(body), decipher.final()]))
  } catch {
    throw new EasyCMSError('The backup could not be decrypted: wrong key, or a changed file', 400)
  }
}

export const DEFAULT_BACKUP_TIME = '03:00'
export const DEFAULT_BACKUP_KEEP = 7
const DEFAULT_DIR = 'backups'
/** A backup still pending or running after this long was interrupted (a stopped process). */
const STALE = 30 * 60_000
const PERIOD = { daily: 86_400_000, weekly: 7 * 86_400_000 } as const

export type BackupState = 'pending' | 'running' | 'done' | 'failed'

/** A backup's copy in one place (`server`, or a destination's `<integration>:<connection>`). */
export interface BackupCopy {
  state: 'done' | 'retrying' | 'failed' | 'removed'
  at?: string
  attempts?: number
  nextAt?: string
  error?: string
  /** Opens the file at the provider, e.g. in Google Drive. */
  link?: string
}

/** The settings saved from the admin (Settings → Backups): only what differs from the code's. */
interface SavedSettings {
  frequency?: 'daily' | 'weekly' | null
  at?: string
  keep?: number
  server?: boolean
  destinations?: { connection: string; keep?: number | null }[]
}

type SettingField = 'frequency' | 'at' | 'keep'
const FIELDS: SettingField[] = ['frequency', 'at', 'keep']

/** Backup settings in effect: the admin's, else the config's, else the defaults. */
export interface BackupSettings {
  frequency: 'daily' | 'weekly' | null
  at: string
  keep: number
  /** Kept on this server's backup storage (the folder, or `backups.storage`). */
  server: boolean
  destinations: { connection: string; keep: number | null }[]
  /** What applies when the admin hasn't changed it: the config's, else the defaults. */
  defaults: { frequency: 'daily' | 'weekly' | null; at: string; keep: number }
  /** Set in the config: the defaults the admin starts from. */
  inCode: SettingField[]
  /** Set in the config with `locked: true`, so the admin can't change them. */
  locked: SettingField[]
}

const SETTINGS_KEY = 'backups'
/** A destination that failed is tried again after these waits, then given up on. */
const RETRY_MINUTES = [1, 5, 30]

function codeDefaults(cms: EasyCMS) {
  const config = cms.config.backups
  const defaults: BackupSettings['defaults'] = {
    frequency: config?.frequency ?? null,
    at: config?.at ?? DEFAULT_BACKUP_TIME,
    keep: config?.keep ?? DEFAULT_BACKUP_KEEP,
  }
  const inCode = FIELDS.filter((f) => config?.[f] !== undefined)
  return { defaults, inCode, locked: config?.locked ? inCode : [] }
}

/** The settings in effect. */
export async function backupSettings(cms: EasyCMS): Promise<BackupSettings> {
  const saved = ((await getSetting<SavedSettings>(cms, SETTINGS_KEY).catch(() => undefined)) ??
    {}) as SavedSettings
  const { defaults, inCode, locked } = codeDefaults(cms)
  const pick = <F extends SettingField>(f: F): BackupSettings['defaults'][F] =>
    locked.includes(f) || saved[f] === undefined
      ? defaults[f]
      : (saved[f] as BackupSettings['defaults'][F])
  return {
    frequency: pick('frequency'),
    at: pick('at'),
    keep: pick('keep'),
    server: saved.server ?? true,
    destinations: (saved.destinations ?? []).map((d) => ({
      connection: d.connection,
      keep: d.keep ?? null,
    })),
    defaults,
    inCode,
    locked,
  }
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/** Saves the settings an admin changed (Settings → Backups). Audit-logged. */
export async function saveBackupSettings(
  cms: EasyCMS,
  body: unknown,
  user: AuthUser,
): Promise<BackupSettings> {
  const input = { ...(typeof body === 'object' && body !== null ? body : {}) } as Record<
    string,
    unknown
  >
  const errors: { field: string; message: string }[] = []
  const next: SavedSettings = {}
  const { defaults, locked } = codeDefaults(cms)
  // What the config locks is the config's: ignored, as the admin shows it without a field.
  for (const f of locked) delete input[f]
  if (input.frequency !== undefined) {
    if (input.frequency !== null && input.frequency !== 'daily' && input.frequency !== 'weekly')
      errors.push({ field: 'frequency', message: 'must be daily, weekly or empty' })
    else next.frequency = input.frequency as 'daily' | 'weekly' | null
  }
  if (input.at !== undefined) {
    if (typeof input.at !== 'string' || !TIME.test(input.at))
      errors.push({ field: 'at', message: 'must be a time, HH:MM' })
    else next.at = input.at
  }
  const keepOf = (value: unknown, field: string) => {
    if (value === null || value === undefined) return null
    if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 1000) {
      errors.push({ field, message: 'must be a whole number from 1 to 1000' })
      return null
    }
    return value as number
  }
  if (input.keep !== undefined) {
    const keep = keepOf(input.keep, 'keep')
    if (keep !== null) next.keep = keep
  }
  next.server = input.server !== false
  const places = new Set((await backupPlaces(cms)).map((p) => p.id))
  const destinations = Array.isArray(input.destinations) ? input.destinations : []
  next.destinations = []
  destinations.forEach((d, i) => {
    const connection = String((d as { connection?: unknown })?.connection ?? '')
    if (!places.has(connection))
      errors.push({ field: `destinations.${i}`, message: `"${connection}" is not connected` })
    else
      next.destinations?.push({
        connection,
        keep: keepOf((d as { keep?: unknown }).keep, `destinations.${i}.keep`),
      })
  })
  if (!next.server && next.destinations.length === 0)
    errors.push({
      field: 'server',
      message: 'Keep backups somewhere: this server or a destination',
    })
  if (errors.length) throw new ValidationError(DATABASE_BACKUPS, errors)
  const saved: SavedSettings = {
    ...((await getSetting<SavedSettings>(cms, SETTINGS_KEY)) ?? {}),
    ...next,
  }
  // The same as the code's is no change: it follows the code when that changes.
  for (const f of FIELDS) if (saved[f] === defaults[f]) delete saved[f]
  await setSetting(cms, SETTINGS_KEY, saved)
  await cms.audit.record({
    action: 'backups.settings',
    target: 'backups',
    user,
    detail: { ...saved },
  })
  return backupSettings(cms)
}

/** The connections backups can go to: of integrations that keep backups. */
export async function backupPlaces(
  cms: EasyCMS,
): Promise<{ id: string; label: string; integration: string }[]> {
  const out: { id: string; label: string; integration: string }[] = []
  for (const def of cms.config.integrations) {
    if (!def.backups) continue
    const name = typeof def.label === 'string' ? def.label : (def.label.en ?? def.id)
    for (const conn of await cms.integrations.all(def.id))
      out.push({
        id: `${def.id}:${conn.name}`,
        label: `${name} · ${conn.name}`,
        integration: def.id,
      })
  }
  return out
}

/** An error trying again won't fix. */
const permanent = (message: string) => Object.assign(new Error(message), { permanent: true })

/** The destination of a place `<integration>:<connection>`. */
async function destinationFor(cms: EasyCMS, place: string): Promise<BackupDestination> {
  const at = place.indexOf(':')
  const integration = place.slice(0, at)
  const name = place.slice(at + 1)
  const def = cms.config.integrations.find((d) => d.id === integration)
  if (!def?.backups) throw permanent(`${integration} no longer keeps backups`)
  const conn = await cms.integrations.get(integration, { name })
  if (!conn) throw permanent(`The connection "${name}" is gone`)
  return def.backups(conn.values, { cms, app: await cms.integrations.app(integration) })
}

/** A backup's copies; older records were only on the server. */
function copiesOf(row: RawDocument): Record<string, BackupCopy> {
  const copies = row.copies as Record<string, BackupCopy> | null | undefined
  if (copies && typeof copies === 'object') return { ...copies }
  return row.state === 'done' ? { server: { state: 'done' } } : {}
}

/**
 * Sends a backup file to a destination, the `attempt`th time; what to record. A failure is
 * tried again later when `retry` (the file is on the server to send again) and it may help.
 */
async function sendCopy(
  cms: EasyCMS,
  place: string,
  filename: string,
  data: Uint8Array,
  attempt: number,
  retry: boolean,
  backup: ID,
): Promise<BackupCopy> {
  const at = place.indexOf(':')
  try {
    const destination = await destinationFor(cms, place)
    const stored = await destination.put(filename, data)
    void cms.integrations.markUsed(place.slice(0, at), place.slice(at + 1)).catch(() => {})
    return {
      state: 'done',
      at: new Date().toISOString(),
      ...(stored?.link ? { link: stored.link } : {}),
    }
  } catch (error) {
    const message = ((error as Error).message || String(error)).slice(0, 500)
    const lasting = (error as { permanent?: boolean }).permanent === true
    const wait = RETRY_MINUTES[attempt - 1]
    if (!lasting && retry && wait !== undefined)
      return {
        state: 'retrying',
        attempts: attempt,
        nextAt: new Date(Date.now() + wait * 60_000).toISOString(),
        error: message,
      }
    if (lasting)
      await cms.integrations
        .markError(place.slice(0, at), message, place.slice(at + 1))
        .catch(() => {})
    cms.systemEvent('backup.failed', { backup, destination: place, error: message })
    return { state: 'failed', attempts: attempt, at: new Date().toISOString(), error: message }
  }
}

/** Deletes a backup's file in one place. */
async function deleteCopy(cms: EasyCMS, place: string, filename: string): Promise<void> {
  if (place === 'server') return (await backupStorage(cms)).delete(filename)
  return (await destinationFor(cms, place)).delete(filename)
}

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
  /** Where it is: `server`, and destinations as `<integration>:<connection>`. */
  copies: Record<string, BackupCopy>
}

/** Settings → Backups (`GET <api>/admin/backups`). */
export interface AdminBackups {
  settings: {
    frequency: 'daily' | 'weekly' | null
    at: string
    keep: number
    /** The storage adapter's name, e.g. `local` or `s3`. */
    storage: string
    /** The folder, for local storage. */
    dir: string | null
    database: string
    /** Why backups can't be made with this setup, if they can't. */
    unavailable: string | null
    /** Kept on this server's backup storage. */
    server: boolean
    destinations: { connection: string; keep: number | null }[]
    /** What applies when the admin hasn't changed it: the config's, else the defaults. */
    defaults: { frequency: 'daily' | 'weekly' | null; at: string; keep: number }
    /** Set in the config: the defaults the admin starts from. */
    inCode: ('frequency' | 'at' | 'keep')[]
    /** Set in the config with `locked: true`: shown, not changed. */
    locked: ('frequency' | 'at' | 'keep')[]
    /** Files are encrypted (`backups.encryptionKey`). */
    encrypted: boolean
  }
  /** Connected destinations to choose from, and names for those backups were sent to. */
  places: { id: string; label: string }[]
  backups: AdminBackup[]
}

const storages = new WeakMap<EasyCMS, Promise<StorageAdapter>>()

/** Where backups are kept: `backups.storage`, else a private local folder. */
export function backupStorage(cms: EasyCMS): Promise<StorageAdapter> {
  let storage = storages.get(cms)
  if (!storage) {
    storage = (async () => {
      const config = cms.config.backups
      const adapter = config?.storage ?? diskStorage({ dir: config?.dir ?? DEFAULT_DIR })
      await adapter.init?.({ cwd: cms.cwd })
      return adapter
    })()
    storages.set(cms, storage)
  }
  return storage
}

/** Why this setup can't make backups, or `null` when it can. */
export function backupUnavailable(cms: EasyCMS): string | null {
  if (cms.db.backup || cms.config.backups?.sqlite || cms.config.db.backupAdapter) return null
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
  const factory = cms.config.backups?.sqlite ?? cms.config.db.backupAdapter
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
    copies: copiesOf(row),
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
  const settings = await backupSettings(cms)
  const { docs } = await cms.db.find({
    collection: DATABASE_BACKUPS,
    sort: ['-createdAt'],
    limit: 0,
    page: 1,
  })
  return {
    settings: {
      frequency: settings.frequency,
      at: settings.at,
      keep: settings.keep,
      storage: storage.name,
      dir: config?.storage ? null : (config?.dir ?? DEFAULT_DIR),
      database: cms.config.db.name,
      unavailable: backupUnavailable(cms),
      server: settings.server,
      destinations: settings.destinations,
      defaults: settings.defaults,
      inCode: settings.inCode,
      locked: settings.locked,
      encrypted: !!config?.encryptionKey,
    },
    places: (await backupPlaces(cms)).map(({ id, label }) => ({ id, label })),
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
    cms.logger.error(`Backup failed: ${(error as Error).message}`, { error }),
  )
  return toAdmin(row)
}

/** Makes the backup for a pending record: write, compress, store, then keep only the newest. */
async function runBackup(cms: EasyCMS, record: RawDocument): Promise<void> {
  const started = new Date()
  // Claimed: only one process makes the backup of a record.
  const { id, ...rest } = record
  const changes = { state: 'running', startedAt: started.toISOString() }
  const claimed = await cms.db.update({
    collection: DATABASE_BACKUPS,
    id,
    data: { ...rest, ...changes, updatedAt: started.toISOString() },
    where: { state: { equals: 'pending' } },
  })
  if (!claimed) return
  let row: RawDocument = { ...record, ...changes }
  const dir = await mkdtemp(join(tmpdir(), 'easy-cms-backup-'))
  try {
    const file = join(dir, 'backup.db')
    await writeBackupFile(cms, file)
    const encryptionKey = cms.config.backups?.encryptionKey
    const gzipped = new Uint8Array(await gzipAsync(await readFile(file)))
    const data = encryptionKey ? encryptBackup(gzipped, encryptionKey) : gzipped
    const settings = await backupSettings(cms)
    const filename = `${filenameFor(cms, started)}${encryptionKey ? '.enc' : ''}`
    // Two backups in the same minute: keep both.
    const key = filename.replace(/\.db\.gz(\.enc)?$/, `-${row.id}.db.gz$1`)
    const copies: Record<string, BackupCopy> = {}
    // On the server unless only destinations were chosen.
    const onServer = settings.server || settings.destinations.length === 0
    // A name no other backup has, in any place (two backups in the same minute).
    const taken = await cms.db.find({
      collection: DATABASE_BACKUPS,
      where: { filename: { equals: filename } },
      sort: ['id'],
      limit: 1,
      page: 1,
    })
    const name = taken.docs.length > 0 ? key : filename
    if (onServer) {
      const storage = await backupStorage(cms)
      await storage.put(name, data, {
        contentType: encryptionKey ? 'application/octet-stream' : 'application/gzip',
      })
      copies.server = { state: 'done', at: new Date().toISOString() }
    }
    for (const destination of settings.destinations)
      copies[destination.connection] = await sendCopy(
        cms,
        destination.connection,
        name,
        data,
        1,
        onServer,
        row.id,
      )
    const kept = Object.values(copies).some((c) => c.state === 'done' || c.state === 'retrying')
    if (!kept) {
      const why = Object.values(copies)
        .map((c) => c.error)
        .filter(Boolean)
        .join('; ')
      throw new Error(why || 'No destination took the backup')
    }
    // The oldest go first (this one counted as the newest), so a backup shown as done never
    // has more than `keep` before it in a place.
    await pruneBackups(cms, copies)
    row = await update(cms, row, {
      state: 'done',
      filename: name,
      size: data.byteLength,
      finishedAt: new Date().toISOString(),
      copies,
    })
    cms.logger.info(`Backup ${name} written (${data.byteLength} bytes)`)
  } catch (error) {
    const message = ((error as Error).message || String(error)).slice(0, 500)
    await update(cms, row, {
      state: 'failed',
      error: message,
      finishedAt: new Date().toISOString(),
    })
    cms.systemEvent('backup.failed', { backup: row.id, error: message })
    throw error
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/**
 * Keeps each place's newest backups (its own `keep`, else the main one), deleting the files of
 * older ones there; a record goes when no place holds it. Failed records stay 30 days.
 */
async function pruneBackups(
  cms: EasyCMS,
  /** A backup about to be marked done: counted first in each place it is in. */
  newest?: Record<string, BackupCopy>,
): Promise<void> {
  const settings = await backupSettings(cms)
  const keepOf = new Map<string, number>([['server', settings.keep]])
  for (const d of settings.destinations) keepOf.set(d.connection, d.keep ?? settings.keep)
  const { docs } = await cms.db.find({
    collection: DATABASE_BACKUPS,
    where: { state: { equals: 'done' } },
    sort: ['-createdAt'],
    limit: 0,
    page: 1,
  })
  const counts = new Map<string, number>()
  for (const [place, copy] of Object.entries(newest ?? {}))
    if (copy.state === 'done' || copy.state === 'retrying') counts.set(place, 1)
  for (const row of docs) {
    const copies = copiesOf(row)
    let changed = false
    for (const [place, copy] of Object.entries(copies)) {
      if (copy.state !== 'done') continue
      const n = (counts.get(place) ?? 0) + 1
      counts.set(place, n)
      if (n <= (keepOf.get(place) ?? settings.keep)) continue
      if (typeof row.filename === 'string')
        await deleteCopy(cms, place, row.filename).catch(() => {})
      copies[place] = { state: 'removed', at: new Date().toISOString() }
      changed = true
    }
    const held = Object.values(copies).some((c) => c.state === 'done' || c.state === 'retrying')
    if (!held) await cms.db.delete({ collection: DATABASE_BACKUPS, id: row.id })
    else if (changed) await update(cms, row, { copies })
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

/** Sends again the copies whose next try is due, from the file on the server. */
async function retryCopies(cms: EasyCMS, now: Date): Promise<void> {
  const { docs } = await cms.db.find({
    collection: DATABASE_BACKUPS,
    where: { state: { equals: 'done' } },
    sort: ['-createdAt'],
    limit: 50,
    page: 1,
  })
  for (const row of docs) {
    const copies = copiesOf(row)
    const due = Object.entries(copies).filter(
      ([, c]) => c.state === 'retrying' && Date.parse(c.nextAt ?? '') <= now.getTime(),
    )
    if (due.length === 0 || typeof row.filename !== 'string') continue
    // Claimed: one process sends the retries of a record (compare and set).
    const { id, ...rest } = row
    const claimed = await cms.db.update({
      collection: DATABASE_BACKUPS,
      id,
      data: {
        ...rest,
        updatedAt: new Date(
          Math.max(now.getTime(), Date.parse(String(row.updatedAt)) + 1),
        ).toISOString(),
      },
      where: { updatedAt: { equals: row.updatedAt as string } },
    })
    if (!claimed) continue
    const file = await (await backupStorage(cms)).get(row.filename).catch(() => null)
    for (const [place, copy] of due) {
      copies[place] = file
        ? await sendCopy(cms, place, row.filename, file.body, (copy.attempts ?? 1) + 1, true, id)
        : { ...copy, state: 'failed', error: 'The file is no longer on the server to send again' }
    }
    await update(cms, { ...row, ...claimed }, { copies })
  }
}

/** The latest slot of a schedule at or before `now`: today's (or the past) `HH:MM`. */

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

  await retryCopies(cms, now).catch((error) =>
    cms.logger.error(`Backup retries: ${(error as Error).message}`, { error }),
  )
  const settings = await backupSettings(cms)
  const every = settings.frequency
  if (!every) return
  const slot = lastSlot(now, settings.at, cms.config.timeZone)
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
    every === 'daily' ? last < slot.getTime() : last < slot.getTime() - PERIOD.weekly + PERIOD.daily
  if (!due) return
  if (await inProgress(cms, now.getTime())) return
  await startBackup(cms, 'scheduled').catch((error) =>
    cms.logger.error(`Scheduled backup could not start: ${(error as Error).message}`, { error }),
  )
}

/** For the dashboard: the last scheduled backup failed, or none finished in two periods. */
export async function backupAttention(
  cms: EasyCMS,
  now: number = Date.now(),
): Promise<{ id: 'backups'; failed: boolean; lastDone: string | null } | null> {
  const every = (await backupSettings(cms)).frequency
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
  // From the server when it is there, else from a destination that has it.
  const copies = copiesOf(row)
  let body: Uint8Array | null = null
  if (copies.server?.state === 'done')
    body = (await (await backupStorage(cms)).get(row.filename))?.body ?? null
  for (const [place, copy] of Object.entries(copies)) {
    if (body || place === 'server' || copy.state !== 'done') continue
    body = await (await destinationFor(cms, place)).get(row.filename).catch(() => null)
  }
  if (!body)
    throw new EasyCMSError(`The file ${row.filename} is in no place that keeps backups`, 404)
  let { filename } = row
  if (filename.endsWith('.enc')) {
    const encryptionKey = cms.config.backups?.encryptionKey
    if (!encryptionKey)
      throw new EasyCMSError(
        'This backup is encrypted: set backups.encryptionKey to download it',
        400,
      )
    body = decryptBackup(body, encryptionKey)
    filename = filename.slice(0, -'.enc'.length)
  }
  await update(cms, row, { downloadedBy: by, downloadedAt: new Date().toISOString() })
  return { filename, body }
}

/** Deletes a backup and its file. */
export async function deleteBackup(cms: EasyCMS, id: ID): Promise<void> {
  const row = await cms.db.findById({ collection: DATABASE_BACKUPS, id })
  if (!row) throw new NotFoundError(DATABASE_BACKUPS, id)
  if (row.state === 'running' || row.state === 'pending')
    throw new EasyCMSError('A backup in progress cannot be deleted', 409)
  if (typeof row.filename === 'string')
    for (const [place, copy] of Object.entries(copiesOf(row)))
      if (copy.state === 'done' || copy.state === 'retrying')
        await deleteCopy(cms, place, row.filename).catch(() => {})
  await cms.db.delete({ collection: DATABASE_BACKUPS, id })
}
