import { createRestHandler, defineConfig, type StorageAdapter } from '@easy-cms/core'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, open, SECRET } from './helpers.js'

/** Large files straight to the storage (`createUpload`, `completeUpload`). */

/** A storage in memory that hands out upload URLs, like S3 or Vercel Blob. */
function directStorage() {
  const files = new Map<string, Uint8Array>()
  const storage: StorageAdapter = {
    name: 'direct',
    async put(key, data) {
      files.set(key, data)
    },
    async get(key) {
      const body = files.get(key)
      return body ? { body, size: body.byteLength } : null
    },
    async getStart(key, bytes) {
      const body = files.get(key)
      return body ? { body: body.subarray(0, bytes), size: body.byteLength } : null
    },
    async delete(key) {
      files.delete(key)
    },
    async uploadURL(key, { contentType }) {
      return {
        url: `https://storage.test/${key}`,
        method: 'PUT',
        headers: { 'content-type': contentType },
      }
    },
  }
  /** What a browser does with the URL. */
  const send = (url: string, data: Uint8Array) =>
    files.set(url.replace('https://storage.test/', ''), data)
  return { storage, send, files }
}

const pdf = (text: string) => new TextEncoder().encode(`%PDF-1.4\n% ${text}\n`)

describe('direct uploads', () => {
  const { storage, send, files } = directStorage()
  let cms: Awaited<ReturnType<typeof open>>
  let token: string

  beforeAll(async () => {
    cms = await open(
      defineConfig({
        secret: SECRET,
        db: db(),
        upload: {
          storage,
          maxFileSize: 1_000_000,
          imageSizes: [{ name: 'thumb', width: 8 }],
        },
        collections: [],
      }),
    )
    await cms.create('users', { email: 'a@x.co', password: 'password123', role: 'admin' })
    token = (await cms.auth.login({ email: 'a@x.co', password: 'password123' })).token
  })
  afterAll(() => cms.destroy())

  it('checks the file once it is in the storage, then makes its document', async () => {
    const data = pdf('brochure')
    const { ticket, upload } = await cms.createUpload(
      { name: 'Brochure.PDF', size: data.byteLength },
      { alt: 'Our brochure' },
    )
    expect(upload).toMatchObject({ method: 'PUT', headers: { 'content-type': 'application/pdf' } })
    await expect(cms.completeUpload(ticket)).rejects.toThrow(/was not uploaded/)
    send(upload?.url as string, data)
    const media = await cms.completeUpload(ticket)
    expect(media).toMatchObject({
      originalName: 'Brochure.PDF',
      mimeType: 'application/pdf',
      filesize: data.byteLength,
      alt: 'Our brochure',
      filename: expect.stringMatching(/^brochure-[0-9a-f]{8}\.pdf$/),
    })
    // Once only.
    await expect(cms.completeUpload(ticket)).rejects.toThrow(/used already/)
    expect(files.has(media.filename)).toBe(true)
  })

  it('makes resized copies of images', async () => {
    const png = new Uint8Array(
      await sharp({ create: { width: 40, height: 20, channels: 3, background: 'red' } })
        .png()
        .toBuffer(),
    )
    const { ticket, upload } = await cms.createUpload({ name: 'big.png', size: png.byteLength })
    send(upload?.url as string, png)
    const media = await cms.completeUpload(ticket)
    expect(media).toMatchObject({ width: 40, height: 20 })
    expect(files.has(media.sizes.thumb?.filename as string)).toBe(true)
  })

  it('refuses and deletes files that are not what was announced', async () => {
    const lie = await cms.createUpload({ name: 'report.pdf', size: 5 })
    send(lie.upload?.url as string, new TextEncoder().encode('hello'))
    await expect(cms.completeUpload(lie.ticket)).rejects.toThrow(/not application\/pdf/)
    expect([...files.keys()].some((k) => k.startsWith('report-'))).toBe(false)

    const bigger = await cms.createUpload({ name: 'a.pdf', size: 10 })
    send(bigger.upload?.url as string, pdf('more than ten bytes'))
    await expect(cms.completeUpload(bigger.ticket)).rejects.toThrow(/not the 10 announced/)
  })

  it('refuses what upload() refuses, before anything is sent', async () => {
    await expect(cms.createUpload({ name: 'huge.pdf', size: 2_000_000 })).rejects.toThrow(
      /larger than/,
    )
    await expect(cms.createUpload({ name: 'a.zip', size: 10 })).rejects.toThrow(/not allowed/)
    await expect(cms.createUpload({ name: 'a.pdf', size: 0 })).rejects.toThrow(/size/)
  })

  it('rejects forged tickets', async () => {
    const { ticket } = await cms.createUpload({ name: 'a.pdf', size: 10 })
    const [payload] = ticket.split('.')
    const forged = JSON.parse(Buffer.from(payload as string, 'base64url').toString())
    forged.size = 99
    const changed = `${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${ticket.split('.')[1]}`
    await expect(cms.completeUpload(changed)).rejects.toThrow(/not valid/)
  })

  it('works over REST, for the user who started it only', async () => {
    const handle = createRestHandler(cms)
    const call = (path: string, body: unknown, auth = true) =>
      handle(
        new Request(`http://cms.test/api/cms${path}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(auth ? { authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(body),
        }),
      )
    const data = pdf('rest')
    expect(
      (await call('/media/uploads', { name: 'r.pdf', size: data.byteLength }, false)).status,
    ).toBe(401)
    const started = await call('/media/uploads', { name: 'r.pdf', size: data.byteLength, alt: 'R' })
    expect(started.status).toBe(201)
    const { ticket, upload } = (await started.json()) as {
      ticket: string
      upload: { url: string }
    }
    send(upload.url, data)
    expect((await call('/media/uploads/complete', { ticket }, false)).status).toBe(401)
    const done = await call('/media/uploads/complete', { ticket })
    expect(done.status).toBe(201)
    expect(await done.json()).toMatchObject({ alt: 'R', mimeType: 'application/pdf' })
  })
})

describe('direct uploads without a storage that takes them', () => {
  it('say so: upload through the server instead', async () => {
    const cms = await open(defineConfig({ secret: SECRET, db: db(), collections: [] }))
    const { upload } = await cms.createUpload({ name: 'a.pdf', size: 10 })
    expect(upload).toBeNull()
    await cms.destroy()
  })
})
