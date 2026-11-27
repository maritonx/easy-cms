/**
 * What this package needs from the runtime, taken from core so the browser build of core
 * (ADR-0074) brings its own versions and this package imports no Node module.
 *
 * Read off a namespace import, not imported by name: they are new in core 1.57, and npm may pair
 * this package with an older core, which only runs on a server. There they come from Node's own
 * modules (`process.getBuiltinModule`, in Node 22.3+, Bun and Deno).
 */
import * as core from '@easy-cms/core/internal'

const internal: Partial<typeof core> = core

// biome-ignore lint/suspicious/noExplicitAny: Node's modules, typed by the callers below
const builtin = (name: string): any =>
  (globalThis.process as { getBuiltinModule(name: string): unknown }).getBuiltinModule(name)

export const createContext: typeof core.createContext =
  internal.createContext ?? (() => new (builtin('node:async_hooks').AsyncLocalStorage)())

/** The SHA-256 of `text` as hex. */
export const sha256Hex = (text: string): string =>
  internal.hash
    ? internal.hash('sha256', text, 'hex')
    : builtin('node:crypto').createHash('sha256').update(text).digest('hex')

export const fileExists: typeof core.fileExists =
  internal.fileExists ?? ((path) => builtin('node:fs').existsSync(path))
export const joinPath: typeof core.joinPath =
  internal.joinPath ?? ((...paths) => builtin('node:path').join(...paths))
export const resolvePath: typeof core.resolvePath =
  internal.resolvePath ?? ((...paths) => builtin('node:path').resolve(...paths))
export const readUtf8: typeof core.readUtf8 =
  internal.readUtf8 ?? ((path) => builtin('node:fs/promises').readFile(path, 'utf8'))
export const writeText: typeof core.writeText =
  internal.writeText ?? ((path, text) => builtin('node:fs/promises').writeFile(path, text))
export const listDir: typeof core.listDir =
  internal.listDir ?? ((path) => builtin('node:fs/promises').readdir(path))
export const makeDir: typeof core.makeDir =
  internal.makeDir ??
  (async (path) => {
    await builtin('node:fs/promises').mkdir(path, { recursive: true })
  })
