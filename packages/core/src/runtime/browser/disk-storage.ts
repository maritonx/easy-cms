/**
 * `../node/disk-storage.ts` for the browser build (ADR-0074). Core makes a disk storage when the
 * config sets none, so making one works; storing a file throws. Studio sets its own storage.
 */
import type { StorageAdapter } from '../../storage.js'

export interface DiskStorageOptions {
  /** Directory, relative to the project root. Default `uploads`. */
  readonly dir?: string
}

const unavailable = () =>
  new Error(
    "diskStorage needs a disk, which the browser build of Easy CMS doesn't have: set `upload.storage`",
  )

export function diskStorage(_options: DiskStorageOptions = {}): StorageAdapter {
  return {
    name: 'disk',
    put: () => Promise.reject(unavailable()),
    get: () => Promise.resolve(null),
    delete: () => Promise.resolve(),
  }
}
