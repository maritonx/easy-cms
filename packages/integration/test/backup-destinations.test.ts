import {
  type AdminBackup,
  type AdminBackups,
  type BackupDestination,
  createRestHandler,
  defineConfig,
  type IntegrationConfig,
  type RestHandler,
} from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'

type Card = {
  id: string
  connections: { name: string; lastError: string | null }[]
  app?: { values: Record<string, string>; complete: boolean } & Record<string, unknown>
}

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, open, SECRET } from './helpers.js'

/** Backups sent to destinations from Integrations, set up in Settings → Backups (#395). */

/** A pretend cloud drive: files by connection, and how it should fail. */
const drives = new Map<string, Map<string, Uint8Array>>()
const failing = new Map<string, 'busy' | 'revoked'>()

const memoryDrive: IntegrationConfig = {
  id: 'memory-drive',
  label: 'Memory drive',
  category: 'backups',
  kind: 'fields',
  fields: [{ name: 'folder', required: true }],
  backups: (values) => {
    const folder = values.folder ?? ''
    const files = drives.get(folder) ?? new Map<string, Uint8Array>()
    drives.set(folder, files)
    const destination: BackupDestination = {
      async put(name, data) {
        const how = failing.get(folder)
        if (how === 'revoked') throw Object.assign(new Error('Token revoked'), { permanent: true })
        if (how === 'busy') throw new Error('Service busy')
        files.set(name, data)
        return { link: `https://drive.example/${folder}/${name}` }
      },
      async get(name) {
        return files.get(name) ?? null
      },
      async delete(name) {
        files.delete(name)
      },
    }
    return destination
  },
}

/** An OAuth provider whose app keys are entered in the admin. */
const oauthApp: IntegrationConfig = {
  id: 'cloud',
  label: 'Cloud',
  category: 'backups',
  kind: 'oauth',
  oauth: {
    app: {
      fields: [
        { name: 'clientId', required: true },
        { name: 'clientSecret', required: true, secret: true },
      ],
      env: { clientId: 'CLOUD_CLIENT_ID', clientSecret: 'CLOUD_CLIENT_SECRET' },
    },
    authorizeUrl: ({ redirectUri, state, app }) =>
      `https://cloud.example/auth?client_id=${app.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`,
    exchange: () => ({ values: { token: 't' }, account: 'me' }),
  },
}

const config = (backups: Record<string, unknown> = {}) =>
  defineConfig({
    secret: SECRET,
    db: db(),
    backups: { sqlite, ...backups },
    plugins: [(c) => ({ ...c, integrations: [...(c.integrations ?? []), memoryDrive, oauthApp] })],
    collections: [{ slug: 'posts', fields: [{ name: 'title', type: 'text' }] }],
  })

let cms: Awaited<ReturnType<typeof open>>
let handle: RestHandler
const token: Record<string, string> = {}

async function setup(backups: Record<string, unknown> = {}) {
  drives.clear()
  failing.clear()
  cms = await open(config(backups))
  handle = createRestHandler(cms)
  for (const [email, role] of [
    ['admin@x.co', 'admin'],
    ['editor@x.co', 'editor'],
  ] as const) {
    await cms.create('users', { email, password: 'password123', role })
    token[role] = (await cms.auth.login({ email, password: 'password123' })).token
  }
  await cms.create('posts', { title: 'One' })
}
afterEach(() => cms?.destroy())

function call(path: string, method = 'GET', body?: unknown, who = 'admin') {
  return handle(
    new Request(`http://cms.test/api/cms${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token[who]}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  )
}
const list = async () => (await (await call('/admin/backups')).json()) as AdminBackups
const connect = async (name: string, folder: string) =>
  expect(
    (
      await call('/admin/integrations/memory-drive/connections', 'POST', {
        name,
        values: { folder },
      })
    ).status,
  ).toBe(201)

async function backUp(): Promise<AdminBackup> {
  const started = await call('/admin/backups', 'POST')
  expect(started.status).toBe(202)
  const { id } = (await started.json()) as { id: number }
  for (let i = 0; i < 400; i++) {
    const row = (await list()).backups.find((b) => b.id === id)
    if (row && (row.state === 'done' || row.state === 'failed')) return row
    await new Promise((r) => setTimeout(r, 25))
  }
  throw new Error('the backup did not finish')
}

describe('backup destinations', () => {
  beforeEach(() => setup())

  it('sets backups up in the admin and sends them to a destination too', async () => {
    await connect('Main', 'a')
    const before = await list()
    expect(before.settings).toMatchObject({
      frequency: null,
      keep: 7,
      server: true,
      destinations: [],
      locked: [],
      encrypted: false,
    })
    expect(before.places).toEqual([{ id: 'memory-drive:Main', label: 'Memory drive · Main' }])
    const saved = await call('/admin/backups/settings', 'PUT', {
      frequency: 'daily',
      at: '02:30',
      keep: 3,
      server: true,
      destinations: [{ connection: 'memory-drive:Main', keep: 5 }],
    })
    expect(saved.status).toBe(200)
    expect((await list()).settings).toMatchObject({
      frequency: 'daily',
      at: '02:30',
      keep: 3,
      destinations: [{ connection: 'memory-drive:Main', keep: 5 }],
    })
    const backup = await backUp()
    expect(backup.state).toBe('done')
    expect(backup.copies.server?.state).toBe('done')
    expect(backup.copies['memory-drive:Main']).toMatchObject({
      state: 'done',
      link: `https://drive.example/a/${backup.filename}`,
    })
    expect(drives.get('a')?.has(String(backup.filename))).toBe(true)
    // Editors can't change them; nonsense is refused.
    expect((await call('/admin/backups/settings', 'PUT', {}, 'editor')).status).toBe(403)
    const bad = await call('/admin/backups/settings', 'PUT', {
      at: '25:00',
      server: false,
      destinations: [{ connection: 'memory-drive:Gone' }],
    })
    expect(bad.status).toBe(400)
    expect(
      ((await bad.json()) as { errors: { field: string }[] }).errors.map((e) => e.field),
    ).toEqual(['at', 'destinations.0', 'server'])
  })

  it('tries a busy destination again later, and gives up on a revoked one at once', async () => {
    await connect('Busy', 'busy')
    await connect('Revoked', 'revoked')
    failing.set('busy', 'busy')
    failing.set('revoked', 'revoked')
    await call('/admin/backups/settings', 'PUT', {
      destinations: [{ connection: 'memory-drive:Busy' }, { connection: 'memory-drive:Revoked' }],
    })
    const events: string[] = []
    cms.on('backup.failed' as never, ({ data }) => {
      events.push(String((data as { destination?: string }).destination))
    })
    const backup = await backUp()
    expect(backup.state).toBe('done')
    expect(backup.copies['memory-drive:Busy']).toMatchObject({
      state: 'retrying',
      attempts: 1,
      error: 'Service busy',
    })
    expect(backup.copies['memory-drive:Revoked']).toMatchObject({
      state: 'failed',
      error: 'Token revoked',
    })
    expect(events).toEqual(['memory-drive:Revoked'])
    const card = (
      (await (await call('/admin/integrations')).json()) as {
        integrations: Card[]
      }
    ).integrations.find((i) => i.id === 'memory-drive')
    expect(card?.connections.find((c) => c.name === 'Revoked')?.lastError).toBe('Token revoked')
    // Back again: the next run after a minute sends it from the file on the server.
    failing.delete('busy')
    await cms.runJobs(new Date(Date.now() + 2 * 60_000))
    const after = (await list()).backups.find((b) => b.id === backup.id)
    expect(after?.copies['memory-drive:Busy']).toMatchObject({ state: 'done' })
    expect(drives.get('busy')?.has(String(backup.filename))).toBe(true)
  })

  it('fails when the only place chosen fails', async () => {
    await connect('Only', 'only')
    failing.set('only', 'busy')
    await call('/admin/backups/settings', 'PUT', {
      server: false,
      destinations: [{ connection: 'memory-drive:Only' }],
    })
    const backup = await backUp()
    expect(backup.state).toBe('failed')
    expect(backup.error).toBe('Service busy')
  })

  it('keeps each place’s newest backups, and downloads from a destination', async () => {
    await connect('Main', 'keep')
    await call('/admin/backups/settings', 'PUT', {
      keep: 1,
      destinations: [{ connection: 'memory-drive:Main', keep: 2 }],
    })
    const made: AdminBackup[] = []
    for (let i = 0; i < 3; i++) made.push(await backUp())
    const { backups } = await list()
    // The oldest is gone from both; the middle one is only on the drive.
    expect(backups.map((b) => b.id)).toEqual([made[2]?.id, made[1]?.id])
    expect(backups[1]?.copies.server?.state).toBe('removed')
    expect(drives.get('keep')?.size).toBe(2)
    const download = await call(`/admin/backups/${made[1]?.id}/download`)
    expect(download.status).toBe(200)
    expect((await download.arrayBuffer()).byteLength).toBeGreaterThan(0)
  })
})

describe('backup settings in the code', () => {
  beforeEach(() => setup({ frequency: 'weekly', keep: 4 }))

  it('wins over the admin, and says so', async () => {
    await call('/admin/backups/settings', 'PUT', { frequency: 'daily', keep: 9, at: '01:00' })
    expect((await list()).settings).toMatchObject({
      frequency: 'weekly',
      keep: 4,
      at: '01:00',
      locked: ['frequency', 'keep'],
    })
  })
})

describe('OAuth app keys', () => {
  beforeEach(() => setup())

  const card = async () =>
    (
      (await (await call('/admin/integrations')).json()) as { integrations: Card[] }
    ).integrations.find((i) => i.id === 'cloud')

  it('are entered by an admin before connecting, secrets kept out of sight', async () => {
    expect((await card())?.app).toEqual({
      fields: [
        { name: 'clientId', required: true },
        { name: 'clientSecret', required: true, secret: true },
      ],
      envFields: [],
      values: {},
      complete: false,
      redirectUri: 'http://cms.test/api/cms/admin/integrations/cloud/callback',
    })
    const early = await call('/admin/integrations/cloud/authorize', 'POST', { name: 'Mine' })
    expect(early.status).toBe(400)
    expect(
      (await call('/admin/integrations/cloud/app', 'PUT', { values: { clientId: 'x' } }, 'editor'))
        .status,
    ).toBe(403)
    const missing = await call('/admin/integrations/cloud/app', 'PUT', {
      values: { clientId: 'id-1' },
    })
    expect(missing.status).toBe(400)
    expect(
      (
        await call('/admin/integrations/cloud/app', 'PUT', {
          values: { clientId: 'id-1', clientSecret: 'shh-12345678' },
        })
      ).status,
    ).toBe(200)
    expect((await card())?.app?.values).toEqual({ clientId: 'id-1', clientSecret: '••••5678' })
    expect((await card())?.app?.complete).toBe(true)
    // An empty secret keeps the saved one.
    await call('/admin/integrations/cloud/app', 'PUT', { values: { clientId: 'id-2' } })
    expect((await card())?.app?.values).toEqual({ clientId: 'id-2', clientSecret: '••••5678' })
    const started = await call('/admin/integrations/cloud/authorize', 'POST', { name: 'Mine' })
    expect(((await started.json()) as { url: string }).url).toContain('client_id=id-2')
  })

  it('come from the environment when set there', async () => {
    process.env.CLOUD_CLIENT_ID = 'env-id'
    process.env.CLOUD_CLIENT_SECRET = 'env-secret-0000'
    try {
      expect((await card())?.app).toMatchObject({
        envFields: ['clientId', 'clientSecret'],
        complete: true,
      })
      const started = await call('/admin/integrations/cloud/authorize', 'POST', { name: 'Mine' })
      expect(((await started.json()) as { url: string }).url).toContain('client_id=env-id')
    } finally {
      delete process.env.CLOUD_CLIENT_ID
      delete process.env.CLOUD_CLIENT_SECRET
    }
  })
})

describe('remote libSQL', () => {
  it('backs up by copying into a local SQLite file', () => {
    expect(sqlite({ url: 'libsql://example.turso.io' }).backupAdapter).toBe(sqlite)
    expect(sqlite({ url: 'file:./cms.db' }).backupAdapter).toBeUndefined()
  })
})
