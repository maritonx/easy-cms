import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { type AdminHandler, APP_DIR, adminHandlerFor, SHELL_FILE } from '@easy-cms/admin'
import {
  type ApiHandlerOptions,
  type AuthUser,
  type Config,
  createApiHandler,
  type EasyCMS,
  resolveConfig,
  sharedEasyCMS,
} from '@easy-cms/core'

type Handler = (request: Request) => Promise<Response>

export type { ApiHandlerOptions }

/**
 * The Easy CMS Local API for this server, typed from your config. Use it in Server
 * Components, Route Handlers and Server Actions. The instance survives hot reloads, and is the
 * same for every server layer, which Next.js each bundles the config into.
 */
export function getEasyCMS<const C extends Config>(config: C): Promise<EasyCMS<C>> {
  return sharedEasyCMS(config)
}

/**
 * `basePath`, `getClientIp` and `trustProxy` (use `X-Forwarded-For` for the client IP, only
 * behind a proxy you trust; Vercel and Netlify are recognized without it).
 */
export type RouteHandlerOptions = ApiHandlerOptions

/**
 * REST API route handlers. In `app/api/cms/[...path]/route.ts` (matching `routes.api`):
 *
 * ```ts
 * import config from '@/easy-cms.config'
 * import { createRouteHandlers } from '@easy-cms/next'
 * export const { GET, HEAD, POST, PATCH, PUT, DELETE, OPTIONS } = createRouteHandlers(config)
 * ```
 */
export function createRouteHandlers(config: Config, options: RouteHandlerOptions = {}) {
  const handle: Handler = createApiHandler(config, options)
  return {
    GET: handle,
    HEAD: handle,
    POST: handle,
    PATCH: handle,
    PUT: handle,
    DELETE: handle,
    OPTIONS: handle,
  }
}

/**
 * Admin UI route handlers. In `app/admin/[[...path]]/route.ts` (matching `admin.path`):
 *
 * ```ts
 * import config from '@/easy-cms.config'
 * import { createAdminRouteHandlers } from '@easy-cms/next'
 * export const { GET, HEAD } = createAdminRouteHandlers(config)
 * ```
 */
export function createAdminRouteHandlers(config: Config, options: { appDir?: string } = {}) {
  let handler: Promise<AdminHandler> | undefined
  const handle: Handler = async (request) => {
    handler ??= resolveConfig(config).then((resolved) =>
      adminHandlerFor(resolved, {
        // The site is this Next.js app.
        siteURL: resolved.admin.siteURL || '/',
        appDir: options.appDir ?? adminAppDir(),
        // Next.js strips trailing slashes; redirecting back would loop.
        trailingSlashRedirect: false,
      }),
    )
    return (await handler)(request)
  }
  return { GET: handle, HEAD: handle }
}

/** The logged-in Easy CMS user for the current request (session cookie or Bearer token), or `null`. */
export async function getEasyCMSUser(config: Config): Promise<AuthUser | null> {
  // next/headers only works inside a request; import it lazily so this module loads anywhere.
  const { headers } = await import('next/headers.js')
  const cms = (await getEasyCMS(config)) as EasyCMS
  return cms.auth.userFromHeaders(await headers())
}

/**
 * Where the built admin app is on disk. First @easy-cms/admin's own `APP_DIR`: withEasyCMS() keeps
 * that package external, so its path is real, and it is what the build traces. That is the only
 * lookup that works on Vercel, which deploys traced files and not the project's node_modules.
 * When the admin package was bundled after all (no withEasyCMS), `APP_DIR` points into the build;
 * then follow the dependency chain on disk: project → @easy-cms/next → @easy-cms/admin.
 */
function adminAppDir(): string {
  if (existsSync(join(APP_DIR, SHELL_FILE))) return APP_DIR
  try {
    const fromProject = createRequire(join(process.cwd(), 'package.json'))
    const nextPackage = fromProject.resolve('@easy-cms/next/package.json')
    const adminPackage = createRequire(nextPackage).resolve('@easy-cms/admin/package.json')
    return join(dirname(adminPackage), 'dist/app')
  } catch {
    return APP_DIR
  }
}
