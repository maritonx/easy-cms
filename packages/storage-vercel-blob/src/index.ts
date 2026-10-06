import type { StorageAdapter } from '@easy-cms/core'
import { del, get, put } from '@vercel/blob'

export interface VercelBlobStorageOptions {
  /** The store's read-write token. Default: `BLOB_READ_WRITE_TOKEN` (set when a store is connected). */
  readonly token?: string
  /**
   * `public` (default): files are served from the Blob CDN, for uploads. `private`: only through
   * the API, e.g. for `backups.storage`.
   */
  readonly access?: 'public' | 'private'
  /** A folder for the files, e.g. `uploads/`. Default: none. */
  readonly prefix?: string
}

/** Calls to Vercel Blob; replaceable in tests. */
export interface VercelBlobClient {
  put: typeof put
  del: typeof del
  get: typeof get
}

/** The store id in a read-write token: `vercel_blob_rw_<store id>_<secret>`. */
function storeIdOf(token: string): string {
  const id = token.split('_')[3] ?? ''
  if (!id) throw new Error('Vercel Blob: BLOB_READ_WRITE_TOKEN is not a read-write token')
  return id
}

/**
 * Stores uploaded files in Vercel Blob, for sites on Vercel (whose disk doesn't keep files).
 * Connect a Blob store to the project and `BLOB_READ_WRITE_TOKEN` is set for you.
 */
export function vercelBlobStorage(
  options: VercelBlobStorageOptions = {},
  client: VercelBlobClient = { put, del, get },
): StorageAdapter {
  const access = options.access ?? 'public'
  const prefix = options.prefix ?? ''
  const token = () => {
    const value = options.token ?? process.env.BLOB_READ_WRITE_TOKEN
    if (!value) throw new Error('Vercel Blob: set BLOB_READ_WRITE_TOKEN (connect a Blob store)')
    return value
  }
  return {
    name: 'vercel-blob',
    async put(key, data, { contentType }) {
      await client.put(`${prefix}${key}`, Buffer.from(data), {
        access,
        contentType,
        token: token(),
        addRandomSuffix: false,
      })
    },
    async get(key) {
      const found = await client.get(`${prefix}${key}`, { access, token: token() })
      if (found?.statusCode !== 200) return null
      const body = new Uint8Array(await new Response(found.stream).arrayBuffer())
      return { body, size: body.byteLength }
    },
    async delete(key) {
      await client.del(`${prefix}${key}`, { token: token() })
    },
    url(key) {
      // Private files are served through the API, which reads them with the token.
      if (access !== 'public') return undefined
      return `https://${storeIdOf(token())}.public.blob.vercel-storage.com/${prefix}${key}`
    },
  }
}
