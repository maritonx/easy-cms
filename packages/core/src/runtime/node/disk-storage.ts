/** The local disk as file storage (ADR-0067: only where there is a disk). */
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, normalize, resolve, sep } from 'node:path'
import type { StorageAdapter } from '../../storage.js'

export interface DiskStorageOptions {
  /** Directory, relative to the project root. Default `uploads`. */
  readonly dir?: string
}

/** Stores files on the local disk. Suitable for servers with a persistent filesystem. */
export function diskStorage(options: DiskStorageOptions = {}): StorageAdapter {
  // turbopackIgnore: paths are only known at runtime; without it Next traces the whole project.
  let root = resolve(/* turbopackIgnore: true */ options.dir ?? 'uploads')
  const pathOf = (key: string) => {
    const path = normalize(join(/* turbopackIgnore: true */ root, key))
    if (!path.startsWith(root + sep)) throw new Error(`Invalid storage key "${key}"`)
    return path
  }
  return {
    name: 'local',
    apiVersion: 1,
    init({ cwd }) {
      const dir = options.dir ?? 'uploads'
      root = isAbsolute(dir) ? dir : resolve(/* turbopackIgnore: true */ cwd, dir)
    },
    async put(key, data) {
      const path = pathOf(key)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, data, { flag: 'wx' })
    },
    async get(key) {
      const path = pathOf(key)
      const info = await stat(path).catch(() => undefined)
      if (!info?.isFile()) return null
      return { body: new Uint8Array(await readFile(path)), size: info.size }
    },
    async delete(key) {
      await rm(pathOf(key), { force: true })
    },
  }
}
