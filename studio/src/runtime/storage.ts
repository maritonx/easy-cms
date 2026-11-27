import type { StorageAdapter } from '@easy-cms/core'

/** Files kept in memory, served through the REST API like the disk storage. */
export function memoryStorage(): StorageAdapter {
  const files = new Map<string, { body: Uint8Array; contentType: string }>()
  return {
    name: 'memory',
    async put(key, data, { contentType }) {
      files.set(key, { body: data, contentType })
    },
    async get(key) {
      const file = files.get(key)
      return file
        ? { body: file.body, size: file.body.byteLength, contentType: file.contentType }
        : null
    },
    async delete(key) {
      files.delete(key)
    },
  }
}
