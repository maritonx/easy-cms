import type { StorageAdapter } from '@easy-cms/core'
import { getStore, type Store } from '@netlify/blobs'

export interface NetlifyBlobsStorageOptions {
  /** The blob store's name. Default `easy-cms-uploads`. */
  readonly name?: string
  /**
   * Outside Netlify's runtime (scripts, other hosts): the site and a personal access token.
   * On Netlify they come from the environment.
   */
  readonly siteID?: string
  readonly token?: string
  /** For tests: a local blobs server. */
  readonly edgeURL?: string
  readonly uncachedEdgeURL?: string
  readonly apiURL?: string
}

/**
 * Stores uploaded files in Netlify Blobs, for sites on Netlify (whose disk doesn't keep files).
 * Files are served through the REST API (`<api>/media/file/<key>`).
 */
export function netlifyBlobsStorage(options: NetlifyBlobsStorageOptions = {}): StorageAdapter {
  // Each time: Netlify sets up the blobs context for each request.
  const open = (): Store =>
    getStore({
      name: options.name ?? 'easy-cms-uploads',
      // Uploads are read right after they are written: strong consistency.
      consistency: 'strong',
      ...(options.siteID ? { siteID: options.siteID } : {}),
      ...(options.token ? { token: options.token } : {}),
      ...(options.edgeURL ? { edgeURL: options.edgeURL } : {}),
      ...(options.uncachedEdgeURL ? { uncachedEdgeURL: options.uncachedEdgeURL } : {}),
      ...(options.apiURL ? { apiURL: options.apiURL } : {}),
    })
  return {
    name: 'netlify-blobs',
    apiVersion: 1,
    async put(key, data, { contentType }) {
      const bytes = new Uint8Array(data)
      await open().set(key, bytes.buffer as ArrayBuffer, { metadata: { contentType } })
    },
    async get(key) {
      const found = await open().get(key, { type: 'arrayBuffer' })
      if (found === null) return null
      const body = new Uint8Array(found)
      return { body, size: body.byteLength }
    },
    async delete(key) {
      await open().delete(key)
    },
  }
}
