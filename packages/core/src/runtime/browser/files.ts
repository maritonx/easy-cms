/**
 * `../node/files.ts` for the browser build (ADR-0074): there is no disk. Paths are joined as
 * POSIX paths; reading finds nothing; writing throws.
 */
const unavailable = (what: string) =>
  new Error(`${what} needs a file system, which the browser build of Easy CMS doesn't have`)

function normalize(path: string): string {
  const absolute = path.startsWith('/')
  const parts: string[] = []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (parts.length > 0 && parts.at(-1) !== '..') parts.pop()
      else if (!absolute) parts.push('..')
    } else parts.push(part)
  }
  const joined = parts.join('/')
  return absolute ? `/${joined}` : joined || '.'
}

/** Joins paths with `/`. */
export function joinPath(...paths: string[]): string {
  return normalize(paths.filter((p) => p !== '').join('/'))
}

/** Resolves paths from `/`, as `path.posix.resolve` does with `/` as the working directory. */
export function resolvePath(...paths: string[]): string {
  let resolved = ''
  for (const path of paths) resolved = path.startsWith('/') ? path : `${resolved}/${path}`
  return normalize(`/${resolved}`)
}

export function fileExists(_path: string): boolean {
  return false
}

export function readText(_path: string): Promise<string | undefined> {
  return Promise.resolve(undefined)
}

export function readUtf8(path: string): Promise<string> {
  return Promise.reject(unavailable(`Reading ${path}`))
}

export function writeText(path: string, _text: string): Promise<void> {
  return Promise.reject(unavailable(`Writing ${path}`))
}

export function listDir(path: string): Promise<string[]> {
  return Promise.reject(unavailable(`Listing ${path}`))
}

export function makeDir(path: string): Promise<void> {
  return Promise.reject(unavailable(`Making ${path}`))
}

export function readBytes(path: string): Promise<Uint8Array> {
  return Promise.reject(unavailable(`Reading ${path}`))
}

export function removePath(_path: string): Promise<void> {
  return Promise.resolve()
}

export function makeTempDir(_prefix: string): Promise<string> {
  return Promise.reject(unavailable('A temporary directory'))
}

export function resolveModule(specifier: string, _base: string): string {
  throw unavailable(`Resolving ${specifier}`)
}

export function entryFile(): string | undefined {
  return undefined
}
