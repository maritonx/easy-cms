import { describe, expect, it } from 'vitest'
import { type VercelBlobClient, vercelBlobStorage } from '../src/index.js'

/** A store in memory, answering like the SDK. */
function fakeClient() {
  const files = new Map<string, { data: Buffer; options: Record<string, unknown> }>()
  const client = {
    put: async (pathname: string, data: Buffer, options: Record<string, unknown>) => {
      files.set(pathname, { data, options })
      return { url: `https://x/${pathname}` }
    },
    get: async (pathname: string) => {
      const file = files.get(pathname)
      if (!file) return null
      return {
        statusCode: 200,
        stream: new Response(file.data).body,
        headers: new Headers(),
        blob: {},
      }
    },
    del: async (pathname: string) => {
      files.delete(pathname)
    },
  }
  return { files, client: client as unknown as VercelBlobClient }
}

const TOKEN = 'vercel_blob_rw_AbC123Store_secretpart'

describe('vercelBlobStorage', () => {
  it('stores, reads and deletes files, public on the Blob CDN', async () => {
    const { files, client } = fakeClient()
    const storage = vercelBlobStorage({ token: TOKEN, prefix: 'uploads/' }, client)
    await storage.put('photo-1.png', new Uint8Array([1, 2, 3]), { contentType: 'image/png' })
    expect(files.get('uploads/photo-1.png')?.options).toMatchObject({
      access: 'public',
      contentType: 'image/png',
      addRandomSuffix: false,
      token: TOKEN,
    })
    expect(storage.url?.('photo-1.png')).toBe(
      'https://AbC123Store.public.blob.vercel-storage.com/uploads/photo-1.png',
    )
    expect(await storage.get('photo-1.png')).toEqual({ body: new Uint8Array([1, 2, 3]), size: 3 })
    await storage.delete('photo-1.png')
    expect(await storage.get('photo-1.png')).toBeNull()
  })

  it('lets browsers send large files with a token for that file, and reads their start', async () => {
    const { client } = fakeClient()
    const asked: Record<string, unknown>[] = []
    const storage = vercelBlobStorage(
      { token: TOKEN, prefix: 'media/' },
      {
        ...client,
        clientToken: (async (options: Record<string, unknown>) => {
          asked.push(options)
          return 'vercel_blob_client_x'
        }) as never,
      },
    )
    const upload = await storage.uploadURL?.('big-1a2b.mp4', {
      contentType: 'video/mp4',
      size: 50_000_000,
      expiresIn: 900,
    })
    expect(upload?.url).toBe('https://vercel.com/api/blob/?pathname=media%2Fbig-1a2b.mp4')
    // The admin's CSP lets the browser send it there.
    expect(storage.uploadOrigins).toEqual(['https://vercel.com'])
    expect(upload?.headers).toMatchObject({
      authorization: 'Bearer vercel_blob_client_x',
      'x-vercel-blob-access': 'public',
      'x-content-type': 'video/mp4',
    })
    // Only headers the Blob API's CORS lets browsers send (checked against its preflight).
    const allowed = ['authorization', 'x-api-version', 'x-vercel-blob-access', 'x-content-type']
    expect(Object.keys(upload?.headers ?? {}).filter((h) => !allowed.includes(h))).toEqual([])
    expect(asked[0]).toMatchObject({
      token: TOKEN,
      pathname: 'media/big-1a2b.mp4',
      maximumSizeInBytes: 50_000_000,
      allowedContentTypes: ['video/mp4'],
      addRandomSuffix: false,
    })

    await storage.put('doc-1.pdf', new Uint8Array([1, 2, 3, 4, 5, 6]), {
      contentType: 'application/pdf',
    })
    const start = await storage.getStart?.('doc-1.pdf', 4)
    expect([...(start?.body ?? [])]).toEqual([1, 2, 3, 4])
  })

  it('keeps private files behind the API', () => {
    const storage = vercelBlobStorage({ token: TOKEN, access: 'private' }, fakeClient().client)
    expect(storage.url?.('backup.db.gz')).toBeUndefined()
  })

  it('says what is missing without a token', async () => {
    const before = process.env.BLOB_READ_WRITE_TOKEN
    delete process.env.BLOB_READ_WRITE_TOKEN
    try {
      const storage = vercelBlobStorage({}, fakeClient().client)
      await expect(
        storage.put('a.png', new Uint8Array(), { contentType: 'image/png' }),
      ).rejects.toMatchObject({
        status: 503,
        message: expect.stringContaining('BLOB_READ_WRITE_TOKEN'),
      })
      // Reading still works, without the files: pages that show images don't break.
      expect(storage.url?.('a.png')).toBeUndefined()
      expect(await storage.get('a.png')).toBeNull()
    } finally {
      if (before !== undefined) process.env.BLOB_READ_WRITE_TOKEN = before
    }
  })
})
