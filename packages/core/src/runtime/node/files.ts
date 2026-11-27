/**
 * The file system and module resolution, for what only works on a server with a disk: config
 * files, admin modules, backups' scratch files, migration files (ADR-0067).
 */
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export { join as joinPath, resolve as resolvePath }

/** Whether a file or directory exists. */
export function fileExists(path: string): boolean {
  return existsSync(/* turbopackIgnore: true */ path)
}

/** A file's text, or `undefined` when it can't be read. */
export function readText(path: string): Promise<string | undefined> {
  return readFile(path, 'utf8').catch(() => undefined)
}

/** A file's text; throws when it can't be read. */
export function readUtf8(path: string): Promise<string> {
  return readFile(path, 'utf8')
}

/** Writes text to a file, replacing it. */
export function writeText(path: string, text: string): Promise<void> {
  return writeFile(path, text)
}

/** The names in a directory; throws when it can't be read. */
export function listDir(path: string): Promise<string[]> {
  return readdir(path)
}

/** Makes a directory and its parents; nothing happens when it exists. */
export async function makeDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true })
}

/** A file's bytes. */
export async function readBytes(path: string): Promise<Uint8Array> {
  const data = await readFile(path)
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
}

/** Removes a file or directory; nothing happens when it doesn't exist. */
export function removePath(path: string): Promise<void> {
  return rm(path, { recursive: true, force: true })
}

/** A new empty directory in the system's temp directory. */
export function makeTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix))
}

/** Resolves a package export (or path) as `require.resolve` would from `base`; throws if missing. */
export function resolveModule(specifier: string, base: string): string {
  return createRequire(base).resolve(specifier)
}

/** The server's entry file (`process.argv[1]`), when there is one. */
export function entryFile(): string | undefined {
  return globalThis.process?.argv?.[1]
}
