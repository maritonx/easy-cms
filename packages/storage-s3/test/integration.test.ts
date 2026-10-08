import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEasyCMS, createRestHandler, silentLogger } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { AwsClient } from 'aws4fetch'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type S3StorageOptions, s3Storage } from '../src/index.js'

// Runs against a real S3-compatible server when S3_TEST_ENDPOINT is set, e.g.
//   docker run -p 9000:9000 -e RUSTFS_ACCESS_KEY=... -e RUSTFS_SECRET_KEY=... rustfs/rustfs
const endpoint = process.env.S3_TEST_ENDPOINT
const accessKeyId = process.env.S3_TEST_ACCESS_KEY ?? ''
const secretAccessKey = process.env.S3_TEST_SECRET_KEY ?? ''
const bucket = `ecms-test-${Date.now()}`

describe.skipIf(!endpoint)('s3Storage against a real server', () => {
  const options: S3StorageOptions = {
    bucket,
    endpoint: endpoint as string,
    region: 'us-east-1',
    accessKeyId,
    secretAccessKey,
    prefix: 'media',
  }
  const admin = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'us-east-1' })
  const cwd = mkdtempSync(join(tmpdir(), 'easy-cms-s3-'))

  beforeAll(async () => {
    const response = await admin.fetch(`${endpoint}/${bucket}`, { method: 'PUT' })
    expect(response.ok).toBe(true)
  })
  afterAll(() => {
    try {
      rmSync(cwd, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    } catch {
      // leave it to the OS temp cleaner
    }
  })

  it('puts, gets and deletes objects', async () => {
    const storage = s3Storage(options)
    await storage.init?.({ cwd })
    const data = new TextEncoder().encode('hello s3')
    await storage.put('ภาพ-1a2b.txt', data, { contentType: 'text/plain' })
    expect(await storage.get('ภาพ-1a2b.txt')).toEqual({ body: data, size: data.byteLength })
    await storage.delete('ภาพ-1a2b.txt')
    expect(await storage.get('ภาพ-1a2b.txt')).toBeNull()
    await storage.delete('never-existed.txt')
  })

  it('rejects wrong credentials', async () => {
    const storage = s3Storage({ ...options, secretAccessKey: 'wrong-secret' })
    await storage.init?.({ cwd })
    await expect(
      storage.put('a.txt', new Uint8Array(1), { contentType: 'text/plain' }),
    ).rejects.toThrow(/S3 PUT a\.txt failed \(403\)/)
  })

  it('stores uploads and image sizes, serves them through the API and deletes them', async () => {
    const cms = await createEasyCMS(
      {
        secret: 'x'.repeat(32),
        db: sqlite({ url: `file:${join(cwd, 'cms.db')}` }),
        upload: { storage: s3Storage(options), imageSizes: [{ name: 'thumb', width: 4 }] },
        collections: [],
      },
      { cwd, logger: silentLogger },
    )
    try {
      const png = readFileSync(new URL('../../../e2e/fixtures/photo.png', import.meta.url))
      const media = await cms.upload({ name: 'photo.png', data: new Uint8Array(png) }, { alt: 'x' })
      expect(media.url).toBe(`/api/cms/media/file/${media.filename}`)

      const handler = createRestHandler(cms)
      const served = await handler(new Request(`http://localhost${media.url}`))
      expect(served.status).toBe(200)
      expect(served.headers.get('content-security-policy')).toContain('sandbox')
      expect(new Uint8Array(await served.arrayBuffer())).toEqual(new Uint8Array(png))

      const thumbKey = media.sizes.thumb?.filename
      expect(thumbKey && (await cms.storage.get(thumbKey))).toBeTruthy()

      await cms.delete('media', media.id)
      expect(await cms.storage.get(media.filename)).toBeNull()
      expect(thumbKey && (await cms.storage.get(thumbKey))).toBeNull()
    } finally {
      await cms.destroy()
    }
  })

  it('takes files straight from the browser with a presigned PUT', async () => {
    const cms = await createEasyCMS(
      {
        secret: 'x'.repeat(32),
        db: sqlite({ url: `file:${join(cwd, 'direct.db')}` }),
        upload: { storage: s3Storage(options) },
        collections: [],
      },
      { cwd, logger: silentLogger },
    )
    try {
      const pdf = new TextEncoder().encode('%PDF-1.4\n% a brochure\n')
      const started = await cms.createUpload({ name: 'brochure.pdf', size: pdf.byteLength })
      expect(started.upload?.method).toBe('PUT')
      // What the browser does, with what it was told.
      const sent = await fetch(started.upload?.url as string, {
        method: 'PUT',
        headers: started.upload?.headers ?? {},
        body: pdf,
      })
      expect(sent.ok).toBe(true)
      const media = await cms.completeUpload(started.ticket)
      expect(media).toMatchObject({ mimeType: 'application/pdf', filesize: pdf.byteLength })

      // Contents that aren't what was announced are refused, and the file is deleted.
      const lie = await cms.createUpload({ name: 'notes.pdf', size: 5 })
      await fetch(lie.upload?.url as string, {
        method: 'PUT',
        headers: lie.upload?.headers ?? {},
        body: new TextEncoder().encode('hello'),
      })
      await expect(cms.completeUpload(lie.ticket)).rejects.toThrow(/not application\/pdf/)
      const key = JSON.parse(
        Buffer.from(lie.ticket.split('.')[0] as string, 'base64url').toString(),
      ).key
      expect(await cms.storage.get(key)).toBeNull()
    } finally {
      await cms.destroy()
    }
  })
})
