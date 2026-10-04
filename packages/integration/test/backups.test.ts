import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import {
  type AdminBackups,
  type AdminStatus,
  createEasyCMS,
  createRestHandler,
  defineConfig,
  type RestHandler,
  silentLogger,
} from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, open, SECRET, tempProject } from './helpers.js'

/** Backups from the admin: SQLite copies itself; Postgres (PGlite here) goes through `sqlite`. */
let cwd: string
let cms: Awaited<ReturnType<typeof open>>
let handle: RestHandler
let admin: Record<string, string>
let editor: Record<string, string>

const config = () =>
  defineConfig({
    secret: SECRET,
    db: db(),
    admin: { brand: { name: 'My Site' } },
    backups: { every: 'day', at: '03:00', keep: 2, sqlite },
    collections: [{ slug: 'posts', fields: [{ name: 'title', type: 'text' }] }],
  })

beforeAll(async () => {
  cwd = tempProject()
  cms = await open(config(), cwd)
  handle = createRestHandler(cms)
  await cms.create('users', { email: 'admin@x.co', password: 'password123', role: 'admin' })
  await cms.create('users', { email: 'editor@x.co', password: 'password123', role: 'editor' })
  for (const title of ['One', 'Two', 'สาม']) await cms.create('posts', { title })
  const bearer = async (email: string) => ({
    authorization: `Bearer ${(await cms.auth.login({ email, password: 'password123' })).token}`,
  })
  admin = await bearer('admin@x.co')
  editor = await bearer('editor@x.co')
})
afterAll(() => cms.destroy())

const call = (path: string, method = 'GET', headers = admin) =>
  handle(new Request(`http://cms.test/api/cms/admin/backups${path}`, { method, headers }))
const list = async () => (await (await call('')).json()) as AdminBackups

/** Starts a backup and waits for it to finish. */
async function backUp() {
  const started = await call('', 'POST')
  expect(started.status).toBe(202)
  const { id } = (await started.json()) as { id: number }
  for (let i = 0; i < 100; i++) {
    const row = (await list()).backups.find((b) => b.id === id)
    if (row && (row.state === 'done' || row.state === 'failed')) return row
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('backup did not finish')
}

describe('backups in the admin', () => {
  it('backs up the whole database to a compressed SQLite file, and downloads it', async () => {
    const backup = await backUp()
    expect(backup.error).toBeNull()
    expect(backup).toMatchObject({ state: 'done', trigger: 'manual', author: 'admin@x.co' })
    expect(backup.filename).toMatch(/^my-site-\d{4}-\d{2}-\d{2}-\d{4}\.db\.gz$/)
    // Stored privately in backups/, not in uploads.
    expect(readdirSync(join(cwd, 'backups'))).toContain(backup.filename)

    const download = await call(`/${backup.id}/download`)
    expect(download.status).toBe(200)
    expect(download.headers.get('content-disposition')).toContain(String(backup.filename))
    const file = join(cwd, 'restored.db')
    writeFileSync(file, gunzipSync(new Uint8Array(await download.arrayBuffer())))
    // The file opens as a SQLite database with every post and user.
    const restored = await createEasyCMS(
      // Opened with the same table prefix as the database it was copied from.
      {
        ...config(),
        db: sqlite({ url: `file:${file}`, tablePrefix: cms.db.tablePrefix ?? 'ecms_' }),
      },
      { cwd, schema: 'skip', logger: silentLogger, scheduler: false },
    )
    try {
      expect((await restored.find('posts', { sort: 'title' })).docs.map((p) => p.title)).toEqual([
        'One',
        'Two',
        'สาม',
      ])
      expect(await restored.count('users')).toBe(2)
    } finally {
      await restored.destroy()
    }
    // Who downloaded it is recorded.
    expect((await list()).backups[0]).toMatchObject({ downloadedBy: 'admin@x.co' })
  })

  it('runs one at a time, and keeps the newest', async () => {
    await backUp()
    // While one is in progress, another can't start.
    const first = await call('', 'POST')
    expect(first.status).toBe(202)
    expect((await call('', 'POST')).status).toBe(409)
    for (let i = 0; i < 100 && (await list()).backups.some((b) => b.state !== 'done'); i++)
      await new Promise((resolve) => setTimeout(resolve, 50))
    const { backups, settings } = await list()
    expect(settings).toMatchObject({ every: 'day', at: '03:00', keep: 2, storage: 'local' })
    expect(backups.filter((b) => b.state === 'done')).toHaveLength(2)
    expect(readdirSync(join(cwd, 'backups'))).toHaveLength(2)
  })

  it('backs up on schedule when jobs run', async () => {
    // A run after 03:00 with no scheduled backup yet today starts one.
    const now = new Date()
    now.setHours(4, 0, 0, 0)
    await cms.runJobs(now)
    for (let i = 0; i < 100; i++) {
      const scheduled = (await list()).backups.find((b) => b.trigger === 'scheduled')
      if (scheduled?.state === 'done') break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    expect((await list()).backups.find((b) => b.trigger === 'scheduled')?.state).toBe('done')
    // Not again in the same slot.
    await cms.runJobs(now)
    expect((await list()).backups.filter((b) => b.trigger === 'scheduled')).toHaveLength(1)
  })

  it('tells admins on the dashboard when the scheduled backup failed', async () => {
    const stamp = new Date().toISOString()
    await cms.db.create({
      collection: 'database-backups',
      data: {
        state: 'failed',
        trigger: 'scheduled',
        error: 'disk full',
        createdAt: stamp,
        updatedAt: stamp,
      },
    })
    const status = (await (
      await handle(new Request('http://cms.test/api/cms/admin/status', { headers: admin }))
    ).json()) as AdminStatus
    expect(status.attention).toContainEqual(
      expect.objectContaining({ id: 'backups', failed: true }),
    )
  })

  it('deletes backups with their file, for admins only', async () => {
    const done = (await list()).backups.find((b) => b.state === 'done')
    expect((await call(`/${done?.id}`, 'DELETE')).status).toBe(200)
    expect(existsSync(join(cwd, 'backups', String(done?.filename)))).toBe(false)
    expect((await call('', 'GET', editor)).status).toBe(403)
    expect((await call('', 'POST', editor)).status).toBe(403)
    expect((await call(`/${done?.id}/download`, 'GET', {})).status).toBe(401)
  })
})
