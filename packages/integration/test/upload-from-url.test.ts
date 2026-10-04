import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  createRestHandler,
  defineConfig,
  type RestHandler,
  resolveConfig,
  ValidationError,
} from '@easy-cms/core'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, open, SECRET } from './helpers.js'

/** Uploads from a link (`upload.fromURL`), from a server on this machine (`allowPrivate`). */
let server: Server
let origin: string
let png: Uint8Array
beforeAll(async () => {
  png = new Uint8Array(
    await sharp({ create: { width: 4, height: 3, channels: 3, background: '#2f6f5e' } })
      .png()
      .toBuffer(),
  )
  server = createServer((req, res) => {
    if (req.url === '/photos/beach.png') {
      res.writeHead(200, { 'content-type': 'image/png' })
      res.end(png)
    } else if (req.url === '/notes.txt') {
      res.end('plain text')
    } else {
      res.writeHead(404)
      res.end()
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

const config = defineConfig({
  secret: SECRET,
  db: db(),
  upload: { fromURL: { allowedHosts: ['127.0.0.1'], allowPrivate: true } },
  collections: [],
})

type CMS = Awaited<ReturnType<typeof open<typeof config>>>
let cms: CMS
let handle: RestHandler
let bearer: Record<string, string>
beforeAll(async () => {
  cms = await open(config)
  handle = createRestHandler(cms)
  await cms.create('users', { email: 'editor@x.co', password: 'password123', role: 'editor' })
  const { token } = await cms.auth.login({ email: 'editor@x.co', password: 'password123' })
  bearer = { authorization: `Bearer ${token}` }
})
afterAll(() => cms.destroy())

const post = (body: unknown, headers: Record<string, string> = bearer) =>
  handle(
    new Request('http://cms.test/api/cms/media', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
  )

describe('upload from a link', () => {
  it('downloads the file and stores it like any upload', async () => {
    const media = await cms.uploadFromURL(`${origin}/photos/beach.png`, { alt: 'The beach' })
    expect(media).toMatchObject({
      originalName: 'beach.png',
      mimeType: 'image/png',
      width: 4,
      height: 3,
      alt: 'The beach',
    })
    expect(media.filename).toMatch(/^beach-[0-9a-f]+\.png$/)
  })

  it('takes { url } over REST for users who may upload', async () => {
    const response = await post({ url: `${origin}/photos/beach.png`, alt: 'Over REST' })
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ mimeType: 'image/png', alt: 'Over REST' })

    expect((await post({ url: `${origin}/photos/beach.png` }, {})).status).toBe(401)
    const missing = await post({ url: `${origin}/missing.png` })
    expect(missing.status).toBe(400)
    expect(await missing.json()).toMatchObject({
      errors: [{ field: 'url', message: 'could not be downloaded (HTTP 404)' }],
    })
    // The file type is checked from the contents, as for any upload.
    const text = await post({ url: `${origin}/notes.txt` })
    expect(((await text.json()) as { errors: { field: string }[] }).errors[0]?.field).toBe('file')
    // Only hosts in allowedHosts.
    const other = await post({ url: 'http://localhost/photos/beach.png' })
    expect(((await other.json()) as { errors: unknown[] }).errors[0]).toEqual({
      field: 'url',
      message: 'localhost is not an allowed host',
    })
  })

  it('is off over REST without upload.fromURL, and checks the options', async () => {
    const plain = await open(defineConfig({ secret: SECRET, db: db(), collections: [] }))
    try {
      await plain.create('users', { email: 'a@x.co', password: 'password123', role: 'admin' })
      const user = (await plain.find('users')).docs[0] as never
      const error = await plain
        .uploadFromURL(`${origin}/photos/beach.png`, {}, { user, overrideAccess: false })
        .catch((e: unknown) => e)
      expect(error).toBeInstanceOf(ValidationError)
      expect((error as ValidationError).errors[0]?.message).toContain('upload.fromURL')
      // Trusted code may still download, but never from private addresses by default.
      await expect(plain.uploadFromURL(`${origin}/photos/beach.png`)).rejects.toThrow(
        '127.0.0.1 is a private network address',
      )
    } finally {
      await plain.destroy()
    }
    const bad = (fromURL: unknown) =>
      resolveConfig(
        defineConfig({ secret: SECRET, db: db(), upload: { fromURL: fromURL as never } }),
      )
    await expect(bad({ allowedHosts: [] })).rejects.toThrow(/allowedHosts: must be a non-empty/)
    await expect(bad({ allowedHosts: ['https://x.com'] })).rejects.toThrow(
      /allowedHosts\[0\]: must be a host name/,
    )
    await expect(bad({ allowedHosts: ['*'], allowPrivate: 'yes' })).rejects.toThrow(
      /allowPrivate: must be true or false/,
    )
  })
})
