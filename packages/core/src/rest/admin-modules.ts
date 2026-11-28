import type { EasyCMS } from '../local-api.js'
import { hash } from '../runtime/crypto.js'
import { entryFile, joinPath, readText, resolveModule } from '../runtime/node/files.js'

/**
 * Finds the file of an admin module (`admin.modules`): a package export or a path relative to
 * the project root. Looks from the project root first, then from the server's entry file
 * (a Nuxt `.output/server` build keeps traced packages next to it). `undefined` when not found.
 */
export function resolveAdminModule(
  specifier: string,
  cwd: string = process.cwd(),
): string | undefined {
  const bases = [joinPath(cwd, 'package.json')]
  const entry = entryFile()
  if (entry && !specifier.startsWith('.')) bases.push(entry)
  for (const base of bases) {
    try {
      return resolveModule(specifier, base)
    } catch {
      // Try the next base.
    }
  }
  return undefined
}

export interface AdminModuleFile {
  readonly body: string
  readonly etag: string
}

const resolved = new WeakMap<EasyCMS, (string | undefined)[]>()

/** Marks a module given as code (`provideAdminModules`) where a file's path would be. */
const GIVEN = 'given:'
const given = new Map<string, string>()

/**
 * Admin modules given as code rather than found as files, by specifier: where there are no files
 * to read (Studio runs the CMS in a browser, ADR-0074). A module given here wins over a file.
 */
export function provideAdminModules(modules: Readonly<Record<string, string>>): void {
  for (const [specifier, code] of Object.entries(modules)) given.set(specifier, code)
}

/** The files of `admin.modules`, resolved once per CMS; a missing one is logged and skipped. */
function files(cms: EasyCMS): (string | undefined)[] {
  let result = resolved.get(cms)
  if (!result) {
    result = cms.config.admin.modules.map((specifier) => {
      if (given.has(specifier)) return `${GIVEN}${specifier}`
      const file = resolveAdminModule(specifier, cms.cwd)
      if (!file) {
        // A module `easy-cms build:admin` makes (admin/dist/…): not built yet.
        const built = /(^|\/)dist\//.test(specifier) && specifier.startsWith('.')
        cms.logger.error(
          built
            ? `Admin module "${specifier}" not found: build it with \`npx easy-cms build:admin\` before starting (e.g. in the build script), then restart. The admin loads without it.`
            : `Admin module "${specifier}" not found: install the package, or check the path (relative to ${cms.cwd}). The admin loads without it.`,
        )
      }
      return file
    })
    resolved.set(cms, result)
  }
  return result
}

/** URLs (under the API) of the admin modules that exist, for the admin schema. */
export function adminModuleUrls(cms: EasyCMS): string[] {
  return files(cms).flatMap((file, i) => (file ? [`/admin/ui/modules/${i}.js`] : []))
}

/** One admin module's code, read on each request so edits show up without a restart. */
export async function readAdminModule(
  cms: EasyCMS,
  index: number,
): Promise<AdminModuleFile | undefined> {
  const file = files(cms)[index]
  if (!file) return undefined
  const body = file.startsWith(GIVEN) ? given.get(file.slice(GIVEN.length)) : await readText(file)
  if (body === undefined) return undefined
  return { body, etag: `"${hash('sha1', body, 'base64url')}"` }
}
