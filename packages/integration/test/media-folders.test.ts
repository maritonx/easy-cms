import {
  type AdminRoles,
  type AdminSchema,
  createRestHandler,
  defineConfig,
  type RestHandler,
} from '@easy-cms/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, open, SECRET, tempProject } from './helpers.js'

/** Media folders and their permissions (`upload.folders`, `auth.rbac`). */
let cms: Awaited<ReturnType<typeof open>>
let handle: RestHandler
const tokens: Record<string, Record<string, string>> = {}
const folders: Record<string, number> = {}

const config = () =>
  defineConfig({
    secret: SECRET,
    db: db(),
    upload: { folders: true },
    auth: { rbac: true, roles: ['admin', 'editor', 'marketing', 'hr'] },
    audit: true,
    collections: [{ slug: 'posts', fields: [{ name: 'cover', type: 'upload' }] }],
  })

const call = (path: string, method = 'GET', as?: string, body?: unknown) =>
  handle(
    new Request(`http://cms.test/api/cms${path}`, {
      method,
      headers: {
        ...(as ? tokens[as] : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  )
const json = async <T>(response: Response | Promise<Response>) =>
  (await (await response).json()) as T
const names = async (path: string, as: string) =>
  (await json<{ docs: { name?: string; originalName?: string }[] }>(call(path, 'GET', as))).docs
    .map((d) => d.name ?? d.originalName)
    .sort()

const pdf = (name: string) => ({
  data: new TextEncoder().encode(`%PDF-1.4\n% ${name}\n`),
  name,
})

const upload = (as: string, folder: number | null | undefined, name: string) => {
  const form = new FormData()
  const file = pdf(name)
  form.set('file', new Blob([file.data], { type: 'application/pdf' }), name)
  if (folder !== null && folder !== undefined) form.set('folder', String(folder))
  return handle(
    new Request('http://cms.test/api/cms/media', {
      method: 'POST',
      headers: tokens[as] ?? {},
      body: form,
    }),
  )
}

beforeAll(async () => {
  cms = await open(config(), tempProject())
  handle = createRestHandler(cms)
  for (const [name, role] of [
    ['admin', 'admin'],
    ['mia', 'marketing'],
    ['hank', 'hr'],
  ] as const) {
    await cms.create('users', { email: `${name}@x.co`, password: 'password123', role })
    const { token } = await cms.auth.login({ email: `${name}@x.co`, password: 'password123' })
    tokens[name] = { authorization: `Bearer ${token}` }
  }
  // Both roles may use the whole media library; folders narrow it.
  const { roles } = await json<AdminRoles>(call('/admin/roles', 'GET', 'admin'))
  for (const key of ['marketing', 'hr']) {
    const role = roles.find((r) => r.key === key)
    const saved = await call(`/admin/roles/${role?.id}`, 'PATCH', 'admin', {
      permissions: { collections: { media: ['read', 'create', 'update', 'delete'] } },
    })
    expect(saved.status).toBe(200)
  }
  // Marketing (private to marketing) › Campaigns (inherits) › Archive (hr may view)
  // Shared (no permissions: everyone)
  const create = async (name: string, parent: string | null, permissions?: unknown) => {
    const res = await call('/media-folders', 'POST', 'admin', {
      name,
      ...(parent ? { parent: folders[parent] } : {}),
      ...(permissions !== undefined ? { permissions } : {}),
    })
    expect(res.status).toBe(201)
    folders[name] = (await json<{ id: number }>(res)).id
  }
  await create('Marketing', null, { marketing: 'manage' })
  await create('Campaigns', 'Marketing')
  await create('Archive', 'Campaigns', { marketing: 'edit', hr: 'view' })
  await create('Shared', null)
  for (const [name, folder] of [
    ['top.pdf', null],
    ['brand.pdf', folders.Marketing],
    ['launch.pdf', folders.Campaigns],
    ['old.pdf', folders.Archive],
    ['handbook.pdf', folders.Shared],
  ] as const) {
    const res = await upload('admin', folder, name)
    expect(res.status).toBe(201)
  }
})
afterAll(() => cms.destroy())

describe('folders (upload.folders)', () => {
  it('lists only the folders and files a role may view', async () => {
    expect(await names('/media-folders?limit=100', 'mia')).toEqual([
      'Archive',
      'Campaigns',
      'Marketing',
      'Shared',
    ])
    expect(await names('/media-folders?limit=100', 'hank')).toEqual(['Archive', 'Shared'])
    expect(await names('/media?limit=100', 'hank')).toEqual(['handbook.pdf', 'old.pdf', 'top.pdf'])
    expect(await names('/media?limit=100', 'admin')).toHaveLength(5)
    // Not signed in: files as before (folders sort the team's work, they don't hide files).
    expect(await names('/media?limit=100', '')).toHaveLength(5)
    expect((await call('/media-folders')).status).toBe(401)
  })

  it('filters files by folder', async () => {
    expect(await names(`/media?where[folder][equals]=${folders.Campaigns}`, 'mia')).toEqual([
      'launch.pdf',
    ])
    expect(await names('/media?where[folder][exists]=false', 'hank')).toEqual(['top.pdf'])
  })

  it('needs edit to upload or move files into a folder, manage for subfolders', async () => {
    expect((await upload('hank', folders.Archive, 'x.pdf')).status).toBe(403)
    expect((await upload('hank', folders.Marketing, 'x.pdf')).status).toBe(403)
    expect((await upload('mia', folders.Archive, 'new.pdf')).status).toBe(201)
    // hr can't move their file into marketing's folder.
    const res = await upload('hank', folders.Shared, 'memo.pdf')
    const memo = (await json<{ id: number }>(res)).id
    expect(
      (await call(`/media/${memo}`, 'PATCH', 'hank', { folder: folders.Marketing })).status,
    ).toBe(403)
    expect(
      (await call(`/media/${memo}`, 'PATCH', 'mia', { folder: folders.Marketing })).status,
    ).toBe(200)
    // Now in Marketing: hr can't see or change it.
    expect((await call(`/media/${memo}`, 'GET', 'hank')).status).toBe(404)
    expect((await call(`/media/${memo}`, 'PATCH', 'hank', { alt: 'x' })).status).toBe(403)
    // Subfolders: edit is not enough.
    expect(
      (await call('/media-folders', 'POST', 'mia', { name: 'Sub', parent: folders.Archive }))
        .status,
    ).toBe(403)
    expect(
      (await call('/media-folders', 'POST', 'mia', { name: 'Sub', parent: folders.Campaigns }))
        .status,
    ).toBe(201)
    expect((await call('/media-folders', 'POST', 'hank', { name: 'HR' })).status).toBe(201)
  })

  it('keeps names unique among siblings and folders out of themselves', async () => {
    const dup = await call('/media-folders', 'POST', 'admin', { name: 'marketing' })
    expect(dup.status).toBe(400)
    const moved = await call(`/media-folders/${folders.Marketing}`, 'PATCH', 'admin', {
      parent: folders.Archive,
    })
    expect(moved.status).toBe(400)
    expect(JSON.stringify(await moved.json())).toContain('cannot be the folder itself')
    // The same name in another folder is fine.
    expect(
      (await call('/media-folders', 'POST', 'admin', { name: 'Archive', parent: folders.Shared }))
        .status,
    ).toBe(201)
  })

  it('lets only admins see and set permissions, for roles that exist', async () => {
    const asMia = await json<{ permissions?: unknown }>(
      call(`/media-folders/${folders.Marketing}`, 'GET', 'mia'),
    )
    expect(asMia.permissions).toBeUndefined()
    const asAdmin = await json<{ permissions?: unknown }>(
      call(`/media-folders/${folders.Marketing}`, 'GET', 'admin'),
    )
    expect(asAdmin.permissions).toEqual({ marketing: 'manage' })
    // Marketing manages its folder but can't open it to others.
    await call(`/media-folders/${folders.Marketing}`, 'PATCH', 'mia', {
      permissions: { marketing: 'manage', hr: 'manage' },
    })
    expect(await names('/media-folders?limit=100', 'hank')).not.toContain('Marketing')
    const bad = await call(`/media-folders/${folders.Shared}`, 'PATCH', 'admin', {
      permissions: { sales: 'view', hr: 'owner' },
    })
    expect(bad.status).toBe(400)
  })

  it('moves what a deleted folder holds up to its parent', async () => {
    const res = await call('/media-folders', 'POST', 'admin', {
      name: 'Temp',
      parent: folders.Shared,
    })
    const temp = (await json<{ id: number }>(res)).id
    await upload('admin', temp, 'temp.pdf')
    await call('/media-folders', 'POST', 'admin', { name: 'Inner', parent: temp })
    expect((await call(`/media-folders/${temp}`, 'DELETE', 'admin')).status).toBe(200)
    expect(await names(`/media?where[folder][equals]=${folders.Shared}`, 'admin')).toContain(
      'temp.pdf',
    )
    expect(
      await names(`/media-folders?where[parent][equals]=${folders.Shared}`, 'admin'),
    ).toContain('Inner')
  })

  it('records permission changes in the audit log', async () => {
    await call(`/media-folders/${folders.Shared}`, 'PATCH', 'admin', {
      permissions: { hr: 'view' },
    })
    const { docs } = await json<{ docs: { action: string }[] }>(
      call('/admin/audit?action=folder', 'GET', 'admin'),
    )
    expect(docs[0]?.action).toBe('folder.permissions')
  })

  it('tells the admin about folders', async () => {
    const admin = await json<AdminSchema>(call('/admin/ui/schema', 'GET', 'admin'))
    expect(admin.folders).toEqual({ permissions: true, private: true })
    const mia = await json<AdminSchema>(call('/admin/ui/schema', 'GET', 'mia'))
    expect(mia.folders).toEqual({ permissions: false, private: false })
  })
})
