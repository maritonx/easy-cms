import {
  type AdminSchema,
  createRestHandler,
  defineConfig,
  type RestHandler,
  type StorageAdapter,
} from '@easy-cms/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, open, SECRET, tempProject } from './helpers.js'

/** Private folders (`upload.privateStorage`), signed links, folder keys and API keys by folder. */

/** Files in memory; with `publicUrl` it hands out CDN-style URLs, like S3 or Vercel Blob. */
function memoryStorage(name: string, publicUrl?: string): StorageAdapter & { keys(): string[] } {
  const files = new Map<string, Uint8Array>()
  return {
    name,
    async put(key, data) {
      files.set(key, data)
    },
    async get(key) {
      const body = files.get(key)
      return body ? { body, size: body.byteLength } : null
    },
    async delete(key) {
      files.delete(key)
    },
    ...(publicUrl ? { url: (key: string) => `${publicUrl}/${key}` } : {}),
    keys: () => [...files.keys()].sort(),
  }
}

const pdf = (text: string) => new TextEncoder().encode(`%PDF-1.4\n% ${text}\n`)

describe('private folders', () => {
  const publicFiles = memoryStorage('public', 'https://cdn.test')
  const privateFiles = memoryStorage('private')
  let cms: Awaited<ReturnType<typeof open>>
  let handle: RestHandler
  const tokens: Record<string, Record<string, string>> = {}
  const get = (path: string, as?: string) =>
    handle(new Request(`http://cms.test${path}`, { headers: (as && tokens[as]) || {} }))
  const patch = (path: string, as: string, body: unknown) =>
    handle(
      new Request(`http://cms.test/api/cms${path}`, {
        method: 'PATCH',
        headers: { ...tokens[as], 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    )

  beforeAll(async () => {
    cms = await open(
      defineConfig({
        secret: SECRET,
        db: db(),
        upload: { folders: true, storage: publicFiles, privateStorage: privateFiles },
        auth: { rbac: true, roles: ['admin', 'editor', 'hr'] },
        collections: [
          {
            slug: 'posts',
            fields: [
              { name: 'file', type: 'upload' },
              { name: 'gallery', type: 'upload', hasMany: true },
            ],
          },
          {
            slug: 'contracts',
            access: { read: ({ user }) => user?.role === 'admin' },
            fields: [{ name: 'file', type: 'upload' }],
          },
        ],
      }),
      tempProject(),
    )
    handle = createRestHandler(cms)
    for (const [name, role] of [
      ['admin', 'admin'],
      ['hank', 'hr'],
      ['eve', 'editor'],
    ] as const) {
      await cms.create('users', { email: `${name}@x.co`, password: 'password123', role })
      const { token } = await cms.auth.login({ email: `${name}@x.co`, password: 'password123' })
      tokens[name] = { authorization: `Bearer ${token}` }
    }
    const roles = await cms.roles.list()
    for (const key of ['hr', 'editor']) {
      const role = roles.roles.find((r) => r.key === key)
      await cms.roles.update(
        role?.id as number,
        {
          permissions: {
            collections: { media: ['read', 'create', 'update', 'delete'], posts: ['read'] },
          },
        },
        { id: 0, email: 'setup@x.co', role: 'admin' },
      )
    }
  })
  afterAll(() => cms.destroy())

  it('keeps files in private folders private', async () => {
    const hr = await cms.create('media-folders', {
      name: 'HR',
      private: true,
      permissions: { hr: 'manage' },
    })
    const contract = await cms.upload(
      { data: pdf('contract'), name: 'contract.pdf' },
      { folder: hr.id },
    )
    expect(contract.filename).toMatch(/^contract-[0-9a-f]{8}\.private\.pdf$/)
    expect(contract.private).toBe(true)
    expect(contract.url).toBe(`/api/cms/media/private/${contract.filename}`)
    expect(privateFiles.keys()).toEqual([contract.filename])
    expect(publicFiles.keys()).toEqual([])

    // Not on the public route, not to visitors, not to a role without the folder.
    expect((await get(`/api/cms/media/file/${contract.filename}`)).status).toBe(404)
    expect((await get(contract.url)).status).toBe(404)
    const listed = (await (await get('/api/cms/media')).json()) as { docs: unknown[] }
    expect(listed.docs).toEqual([])
    expect((await get(contract.url, 'eve')).status).toBe(404)
    // Yes to whoever may see it.
    const served = await get(contract.url, 'hank')
    expect(served.status).toBe(200)
    expect(served.headers.get('cache-control')).toBe('private, max-age=300')
    expect(served.headers.get('content-type')).toBe('application/pdf')
    expect(new TextDecoder().decode(await served.arrayBuffer())).toContain('contract')
  })

  it('signs links that expire', async () => {
    const [contract] = (await cms.find('media', { limit: 1 })).docs
    const link = cms.signedMediaURL(contract as never, { expiresIn: '10m' })
    expect(link).toMatch(/\?expires=\d+&signature=/)
    expect((await get(link)).status).toBe(200)
    // Another first character, whatever it was.
    const forged = link.replace(/signature=(.)/, (_, c) => `signature=${c === 'x' ? 'y' : 'x'}`)
    expect((await get(forged)).status).toBe(404)
    const expired = link.replace(/expires=\d+/, `expires=${Math.floor(Date.now() / 1000) - 1}`)
    expect((await get(expired)).status).toBe(404)
    expect(() => cms.signedMediaURL(contract as never, { expiresIn: '8d' })).toThrow(/7 days/)
    // Public files keep their URL.
    const logo = await cms.upload({ data: pdf('logo'), name: 'logo.pdf' })
    expect(cms.signedMediaURL(logo)).toBe(`https://cdn.test/${logo.filename}`)
  })

  it('moves files between storages when they or their folders change', async () => {
    const shared = await cms.create('media-folders', { name: 'Shared' })
    const memo = await cms.upload({ data: pdf('memo'), name: 'memo.pdf' }, { folder: shared.id })
    expect(publicFiles.keys()).toContain(memo.filename)

    // Into a private folder: renamed, moved, the public copy gone.
    const [hr] = (await cms.find('media-folders', { where: { name: { equals: 'HR' } } })).docs
    const moved = await cms.update('media', memo.id, { folder: hr?.id })
    expect(moved.filename).toBe(memo.filename.replace('.pdf', '.private.pdf'))
    expect(moved.private).toBe(true)
    expect(publicFiles.keys()).not.toContain(memo.filename)
    expect(privateFiles.keys()).toContain(moved.filename)

    // The folder made private: its files follow; made public again: back.
    await cms.update('media-folders', shared.id, { private: true })
    const notes = await cms.upload({ data: pdf('notes'), name: 'notes.pdf' }, { folder: shared.id })
    expect(notes.private).toBe(true)
    await cms.update('media-folders', shared.id, { private: false })
    const back = (await cms.findById('media', notes.id)) as Record<string, unknown>
    expect(back.private).toBe(false)
    expect(publicFiles.keys()).toContain(String(back.filename))
    expect(privateFiles.keys()).not.toContain(notes.filename)

    // A private folder deleted: what it held moves to the top level, public.
    const inner = await cms.create('media-folders', { name: 'Inner', private: true })
    const draft = await cms.upload({ data: pdf('draft'), name: 'draft.pdf' }, { folder: inner.id })
    await cms.delete('media-folders', inner.id)
    const top = (await cms.findById('media', draft.id)) as Record<string, unknown>
    expect(top.private).toBe(false)
    expect(top.folder).toBeNull()
    expect(publicFiles.keys()).toContain(String(top.filename))
  })

  it('counts the documents that use files, before they move', async () => {
    const a = await cms.upload({ data: pdf('a'), name: 'a.pdf' })
    const b = await cms.upload({ data: pdf('b'), name: 'b.pdf' })
    await cms.create('posts', { file: a.id })
    await cms.create('posts', { gallery: [b.id, a.id] })
    await cms.create('posts', {})
    expect(await cms.mediaUsage([a.id])).toBe(2)
    expect(await cms.mediaUsage([b.id])).toBe(1)
    const res = await get(`/api/cms/admin/ui/media-usage?ids=${a.id},${b.id}`, 'eve')
    // Two documents use one or both.
    expect(await res.json()).toEqual({ count: 2 })
    // Only what the user may read is counted.
    await cms.create('contracts', { file: b.id })
    expect(await cms.mediaUsage([b.id])).toBe(2)
    const usage = async (who: string) =>
      (
        (await (await get(`/api/cms/admin/ui/media-usage?ids=${b.id}`, who)).json()) as {
          count: number
        }
      ).count
    expect(await usage('eve')).toBe(1)
    expect(await usage('admin')).toBe(2)
  })

  it('moves at most 200 files in one change', async () => {
    const big = await cms.create('media-folders', { name: 'Big' })
    for (let i = 0; i < 201; i++)
      await cms.upload({ data: pdf(String(i)), name: `f${i}.pdf` }, { folder: big.id })
    await expect(cms.update('media-folders', big.id, { private: true })).rejects.toThrow(
      /201 files would move/,
    )
    expect((await cms.findById('media-folders', big.id))?.private).toBeFalsy()
    // One file fewer is fine.
    const [one] = (await cms.find('media', { where: { folder: { equals: big.id } }, limit: 1 }))
      .docs
    await cms.delete('media', one?.id as number)
    const done = await cms.update('media-folders', big.id, { private: true })
    expect(done.private).toBe(true)
  })

  it('lets only admins make folders private, and says so in the schema', async () => {
    const folder = await cms.create('media-folders', { name: 'Open' })
    const res = await patch(`/media-folders/${folder.id}`, 'hank', { private: true })
    expect(res.status).toBe(200)
    expect((await cms.findById('media-folders', folder.id))?.private).toBeFalsy()
    const admin = (await (await get('/api/cms/admin/ui/schema', 'admin')).json()) as AdminSchema
    expect(admin.folders).toEqual({ permissions: true, private: true })
  })
})

describe('private folders without somewhere private', () => {
  it('refuses them when the storage has public URLs', async () => {
    const cms = await open(
      defineConfig({
        secret: SECRET,
        db: db(),
        upload: { folders: true, storage: memoryStorage('cdn', 'https://cdn.test') },
        collections: [],
      }),
    )
    expect(cms.privateStorage).toBeNull()
    await expect(cms.create('media-folders', { name: 'Secret', private: true })).rejects.toThrow(
      /privateStorage/,
    )
    await cms.destroy()
  })
})

describe('upload fields with a folder', () => {
  let cms: Awaited<ReturnType<typeof open>>
  beforeAll(async () => {
    cms = await open(
      defineConfig({
        secret: SECRET,
        db: db(),
        upload: { folders: true },
        collections: [
          {
            slug: 'pages',
            fields: [
              { name: 'banner', type: 'upload', folder: 'banners', folderOnly: true },
              { name: 'image', type: 'upload', folder: 'banners' },
            ],
          },
        ],
      }),
    )
  })
  afterAll(() => cms.destroy())

  it('makes the folder, and keeps folderOnly fields to it', async () => {
    const id = await cms.folders.keyed('banners')
    expect(await cms.folders.keyed('banners')).toBe(id)
    const folder = await cms.findById('media-folders', id)
    expect(folder).toMatchObject({ name: 'banners', key: 'banners' })
    // The key stays; the name can change.
    await cms.update(
      'media-folders',
      id,
      { name: 'Banners', key: 'other' },
      { overrideAccess: false, user: { id: 0, email: 'a@x.co', role: 'admin' } },
    )
    expect(await cms.findById('media-folders', id)).toMatchObject({
      name: 'Banners',
      key: 'banners',
    })

    const sub = await cms.create('media-folders', { name: 'Summer', parent: id })
    const inside = await cms.upload({ data: pdf('in'), name: 'in.pdf' }, { folder: sub.id })
    const outside = await cms.upload({ data: pdf('out'), name: 'out.pdf' })
    await cms.create('pages', { banner: inside.id, image: outside.id })
    await expect(cms.create('pages', { banner: outside.id })).rejects.toThrow(/"banners" folder/)
  })

  it('tells the admin where each field opens', async () => {
    await cms.create('users', { email: 'a@x.co', password: 'password123', role: 'admin' })
    const { token } = await cms.auth.login({ email: 'a@x.co', password: 'password123' })
    const res = await createRestHandler(cms)(
      new Request('http://cms.test/api/cms/admin/ui/schema', {
        headers: { authorization: `Bearer ${token}` },
      }),
    )
    const schema = (await res.json()) as AdminSchema
    const fields = schema.collections.find((c) => c.slug === 'pages')?.fields ?? []
    const id = await cms.folders.keyed('banners')
    expect(fields.find((f) => f.name === 'banner')?.folder).toEqual({ id, only: true })
    expect(fields.find((f) => f.name === 'image')?.folder).toEqual({ id, only: false })
  })

  it('refuses folder on upload fields without upload.folders', async () => {
    await expect(
      open(
        defineConfig({
          secret: SECRET,
          db: db(),
          collections: [{ slug: 'x', fields: [{ name: 'f', type: 'upload', folder: 'a' }] }],
        }),
      ),
    ).rejects.toThrow(/needs upload.folders/)
  })
})

describe('API keys limited to folders', () => {
  it('see and add only in their folders', async () => {
    const cms = await open(
      defineConfig({
        secret: SECRET,
        db: db(),
        apiKeys: true,
        upload: { folders: true },
        collections: [],
      }),
    )
    const handle = createRestHandler(cms)
    const press = await cms.create('media-folders', { name: 'Press' })
    const kit = await cms.create('media-folders', { name: 'Kit', parent: press.id })
    const other = await cms.create('media-folders', { name: 'Other' })
    await cms.upload({ data: pdf('a'), name: 'press.pdf' }, { folder: kit.id })
    await cms.upload({ data: pdf('b'), name: 'other.pdf' }, { folder: other.id })
    await cms.upload({ data: pdf('c'), name: 'top.pdf' })
    const owner = await cms.create('users', {
      email: 'o@x.co',
      password: 'password123',
      role: 'admin',
    })
    const created = await cms.createApiKey(
      {
        name: 'press',
        user: owner.id,
        permissions: {
          collections: { media: ['read', 'create'], 'media-folders': ['read'] },
          folders: [press.id],
        },
      },
      { user: { id: owner.id, email: 'o@x.co', role: 'admin' } },
    )
    const auth = { authorization: `Bearer ${created.key}` }
    const names = async (path: string) =>
      (
        (await (
          await handle(new Request(`http://cms.test/api/cms${path}`, { headers: auth }))
        ).json()) as {
          docs: { originalName?: string; name?: string }[]
        }
      ).docs
        .map((d) => d.originalName ?? d.name)
        .sort()
    expect(await names('/media')).toEqual(['press.pdf'])
    expect(await names('/media-folders')).toEqual(['Kit', 'Press'])
    const upload = (folder?: number | string) => {
      const form = new FormData()
      form.set('file', new Blob([pdf('x')]), 'x.pdf')
      if (folder !== undefined) form.set('folder', String(folder))
      return handle(
        new Request('http://cms.test/api/cms/media', { method: 'POST', headers: auth, body: form }),
      )
    }
    expect((await upload()).status).toBe(403)
    expect((await upload(other.id)).status).toBe(403)
    expect((await upload(kit.id)).status).toBe(201)
    await cms.destroy()
  })
})
