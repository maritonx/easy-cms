import { existsSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import {
  applyPlugins,
  CONFIG_FILE_NAMES,
  importConfig,
  resolveAdminModule,
} from '@easy-cms/core/internal'

/** The subset of Next's config this helper reads and sets. */
interface NextConfigLike {
  serverExternalPackages?: string[]
  outputFileTracingIncludes?: Record<string, string[]>
}

/**
 * A Next config object, or the function form Next also accepts. Generic rather than an index
 * signature, so Next's own `NextConfig` interface is accepted as is.
 */
export type NextConfigInput<T extends object = NextConfigLike> =
  | T
  // biome-ignore lint/suspicious/noExplicitAny: Next passes its full default config here
  | ((phase: string, ctx: { defaultConfig: any }) => T | Promise<T>)

export interface WithEasyCMSOptions {
  /** Path to the Easy CMS config, relative to the project root. Default: `easy-cms.config.ts` (or .mts/.js/.mjs). */
  readonly configPath?: string
}

/**
 * Packages Next must load from node_modules instead of bundling: they read files next to
 * themselves (the admin app, PGlite's WebAssembly) or load native binaries.
 */
export const SERVER_EXTERNAL_PACKAGES = [
  '@easy-cms/core',
  '@easy-cms/admin',
  '@easy-cms/drizzle',
  '@easy-cms/db-sqlite',
  '@easy-cms/db-postgres',
  '@libsql/client',
  'libsql',
  '@electric-sql/pglite',
  'drizzle-kit',
  'drizzle-orm',
  'postgres',
  'sharp',
  'jiti',
]

/**
 * Wraps `next.config.ts` so the server build includes what Easy CMS needs at runtime:
 *
 * ```ts
 * import { withEasyCMS } from '@easy-cms/next/config'
 * export default withEasyCMS({ ... })
 * ```
 */
export function withEasyCMS<T extends object = NextConfigLike>(
  nextConfig: NextConfigInput<T> = {} as T,
  options: WithEasyCMSOptions = {},
) {
  return async (
    phase: string,
    // biome-ignore lint/suspicious/noExplicitAny: see NextConfigInput
    ctx: { defaultConfig: any },
  ): Promise<T & Required<NextConfigLike>> => {
    const config = typeof nextConfig === 'function' ? await nextConfig(phase, ctx) : nextConfig
    const base = config as T & NextConfigLike
    const root = process.cwd()
    const include = [...(await tracedFiles(root, options.configPath))]
    return {
      ...base,
      serverExternalPackages: [
        ...new Set([...(base.serverExternalPackages ?? []), ...SERVER_EXTERNAL_PACKAGES]),
      ],
      outputFileTracingIncludes: {
        ...base.outputFileTracingIncludes,
        '/**': [...(base.outputFileTracingIncludes?.['/**'] ?? []), ...include],
      },
    }
  }
}

/**
 * An admin module given by package export, as paths through the package's folder in node_modules:
 * its package.json and the module file. The runtime finds the module by that folder, which pnpm
 * makes a link to `.pnpm`; tracing the file only at its real path deploys it where Node never
 * looks, and the admin says the module's components are missing (Vercel deploys traced files
 * only). Empty for a path in the project.
 */
function packageLink(specifier: string, file: string, root: string): string[] {
  if (specifier.startsWith('.') || isAbsolute(specifier)) return []
  const name = specifier
    .split('/')
    .slice(0, specifier.startsWith('@') ? 2 : 1)
    .join('/')
  for (let dir = root; ; dir = dirname(dir)) {
    const folder = join(dir, 'node_modules', name)
    if (existsSync(join(folder, 'package.json'))) {
      const inside = relative(realpathSync(folder), file)
      return [
        join(folder, 'package.json'),
        ...(inside.startsWith('..') ? [] : [join(folder, inside)]),
      ]
    }
    if (dirname(dir) === dir) return []
  }
}

/** Files the standalone output needs that static tracing cannot see, as globs relative to the project. */
async function tracedFiles(root: string, configPath: string | undefined): Promise<string[]> {
  const toGlob = (path: string) => relative(root, path).replace(/\\/g, '/')
  const files = ['easy-cms/migrations/**']

  // The admin SPA is read from disk by the admin route handler.
  try {
    const adminPackage = createRequire(join(root, 'package.json')).resolve(
      '@easy-cms/admin/package.json',
    )
    files.push(`${toGlob(join(dirname(adminPackage), 'dist/app'))}/**`)
  } catch {
    // @easy-cms/admin comes with @easy-cms/next; if it cannot be resolved there is nothing to add.
  }

  // Native binaries the database adapter loads dynamically (e.g. libsql).
  const file = configPath
    ? isAbsolute(configPath)
      ? configPath
      : resolve(root, configPath)
    : CONFIG_FILE_NAMES.map((name) => join(root, name)).find((path) => existsSync(path))
  if (file && existsSync(file)) {
    try {
      const config = await importConfig(file)
      for (const path of config?.db?.bundle?.traceInclude ?? []) files.push(toGlob(path))
      // Admin modules (`admin.modules`, often added by plugins) are read from disk at runtime.
      const withPlugins = config ? await applyPlugins(config).catch(() => config) : undefined
      for (const specifier of withPlugins?.admin?.modules ?? []) {
        const module = resolveAdminModule(specifier, root)
        if (module) files.push(toGlob(module), ...packageLink(specifier, module, root).map(toGlob))
        else console.warn(`[easy-cms] Admin module "${specifier}" not found from ${root}.`)
      }
    } catch (error) {
      console.warn(`[easy-cms] Could not read ${file} at build time: ${(error as Error).message}`)
    }
  }
  return files
}
