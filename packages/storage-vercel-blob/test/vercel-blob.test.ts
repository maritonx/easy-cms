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
      ).rejects.toThrow('BLOB_READ_WRITE_TOKEN')
    } finally {
      if (before !== undefined) process.env.BLOB_READ_WRITE_TOKEN = before
    }
  })
})
