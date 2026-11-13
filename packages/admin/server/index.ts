import { readFile, stat } from 'node:fs/promises'
import { dirname, extname, join, normalize, posix, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface AdminHandlerOptions {
  /** Where the admin UI is served. Default `/admin`. */
  readonly basePath?: string
  /** Where the REST API is served. Default `/api/cms`. */
  readonly apiPath?: string
  /** Default UI language before the user picks one. Default `en`. */
  readonly locale?: 'en' | 'th'
  /** Name, logo and main color shown in the admin (`admin.brand` in the config). */
  readonly brand?: { readonly name?: string; readonly logo?: string; readonly color?: string }
  /** The public site, for the "View site" link (`admin.siteURL`). Empty: no link. */
  readonly siteURL?: string
  /** Directory with the built app. Defaults to the one shipped in this package. */
  readonly appDir?: string
  /**
   * Reads a file of the built app (a path inside it, e.g. `assets/index-abc.js`), `undefined`
   * when there is none. Instead of `appDir` where there is no disk: on Cloudflare Workers, from
   * the Worker's static assets.
   */
  readonly readFile?: (path: string) => Promise<Uint8Array | undefined>
  /**
   * Redirect `/admin` to `/admin/`. Default true. Turn off for frameworks that strip trailing
   * slashes (Next.js); the app works at either URL because of its `<base href>`.
   */
  readonly trailingSlashRedirect?: boolean
  /**
   * More origins the admin may send requests to, besides its own: where the storage takes
   * large files directly (`uploadOrigins` of the storage adapters). `adminHandlerFor` fills it in.
   */
  readonly connectSrc?: readonly string[]
}

export type AdminHandler = (request: Request) => Promise<Response>

/**
 * The built admin app shipped with this package. Computed from this file's path rather than
 * `new URL(..., import.meta.url)`, which bundlers rewrite into asset imports.
 */
export const APP_DIR = appDirOf(import.meta.url)

function appDirOf(url: string | undefined): string {
  // A bundled Worker has no file URL here; it reads the app with `readFile` instead.
  try {
    return join(dirname(fileURLToPath(url as string)), '..', 'app')
  } catch {
    return ''
  }
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

/** Security headers for every admin response (NFR-SEC-04). */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self'",
    // Tiptap and Vue transitions set inline style attributes.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "connect-src 'self'",
    // Live preview shows the site in a frame; the site may be on another origin (standalone).
    "frame-src 'self' http: https:",
    "font-src 'self' data:",
    // Audio and video previews of files in the media library, which may be on a CDN.
    "media-src 'self' blob: https:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; '),
  'x-frame-options': 'DENY',
  'referrer-policy': 'same-origin',
  'x-content-type-options': 'nosniff',
}

/** `SECURITY_HEADERS`, allowing requests to more origins too, e.g. a storage's upload API. */
export function securityHeaders(connectSrc: readonly string[] = []): Record<string, string> {
  // Origins only: nothing that could end the directive or add another.
  const extra = [...new Set(connectSrc)].filter((origin) => /^https?:\/\/[^\s;,'"]+$/.test(origin))
  const csp = SECURITY_HEADERS['content-security-policy'] as string
  return extra.length
    ? {
        ...SECURITY_HEADERS,
        'content-security-policy': csp.replace(
          "connect-src 'self'",
          `connect-src 'self' ${extra.join(' ')}`,
        ),
      }
    : { ...SECURITY_HEADERS }
}

/** The SPA's HTML entry inside the app directory. */
export const SHELL_FILE = 'shell.html'

/**
 * HSTS, sent in production: browsers then reach the site over HTTPS only, for a year. Browsers
 * ignore it on plain HTTP, and it leaves subdomains alone.
 */
export const STRICT_TRANSPORT_SECURITY = 'max-age=31536000'

const escapeAttr = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const trimSlashes = (path: string) => `/${path.replace(/^\/+|\/+$/g, '')}`

/** Injects `<base href>` and the settings the app reads at startup into the shell HTML. */
export function renderShell(
  source: string,
  options: Omit<AdminHandlerOptions, 'appDir' | 'readFile'> = {},
): string {
  const basePath = trimSlashes(options.basePath ?? '/admin')
  const settings = JSON.stringify({
    adminPath: basePath,
    apiPath: trimSlashes(options.apiPath ?? '/api/cms'),
    locale: options.locale ?? 'en',
    brand: options.brand ?? {},
    siteURL: options.siteURL ?? '',
  })
  return source.replace(
    '<head>',
    `<head>\n    <base href="${escapeAttr(`${basePath}/`)}">\n    <meta name="easy-cms" content="${escapeAttr(settings)}">`,
  )
}

/** Serves the admin SPA: static assets, and index.html for every other path under `basePath`. */
/** What `adminHandlerFor` reads from a resolved config (`resolveConfig()`, `cms.config`). */
export interface AdminConfigLike {
  readonly admin: {
    readonly path: string
    readonly locale: 'en' | 'th'
    readonly brand: NonNullable<AdminHandlerOptions['brand']>
    readonly siteURL: string
  }
  readonly routes: { readonly api: string }
  /** Storages whose `uploadOrigins` the admin may send large files to. */
  readonly upload?: {
    readonly storage?: { readonly uploadOrigins?: readonly string[] } | undefined
    readonly privateStorage?: { readonly uploadOrigins?: readonly string[] } | undefined
  }
}

/**
 * The admin handler for a resolved config: its path, API, language, brand and site link, which
 * `overrides` can change (e.g. `siteURL: '/'` when the site is the same app).
 */
export function adminHandlerFor(
  config: AdminConfigLike,
  overrides: Omit<AdminHandlerOptions, 'basePath' | 'apiPath'> = {},
): AdminHandler {
  return createAdminHandler({
    basePath: config.admin.path,
    apiPath: config.routes.api,
    locale: config.admin.locale,
    brand: config.admin.brand,
    siteURL: config.admin.siteURL,
    connectSrc: [
      ...(config.upload?.storage?.uploadOrigins ?? []),
      ...(config.upload?.privateStorage?.uploadOrigins ?? []),
    ],
    ...overrides,
  })
}

export function createAdminHandler(options: AdminHandlerOptions = {}): AdminHandler {
  const basePath = trimSlashes(options.basePath ?? '/admin')
  const appDir = options.appDir ?? APP_DIR
  /** A file of the app, read from `appDir` unless `readFile` is given. */
  const readApp =
    options.readFile ??
    (async (path: string) => {
      const file = join(appDir, path)
      const info = await stat(file).catch(() => undefined)
      return info?.isFile() ? new Uint8Array(await readFile(file)) : undefined
    })
  let shell: Promise<string> | undefined
  // Outside production the shell is read on each request, so a rebuilt admin is picked up.
  const cache = process.env.NODE_ENV === 'production'
  const html = () => {
    const read = () =>
      readApp(SHELL_FILE).then((data) => {
        if (!data) throw new Error(`The admin app has no ${SHELL_FILE}: build @easy-cms/admin`)
        return renderShell(new TextDecoder().decode(data), options)
      })
    if (!cache) return read()
    shell ??= read()
    return shell
  }

  return async (request) => {
    const url = new URL(request.url)
    const headers = new Headers(securityHeaders(options.connectSrc))
    if (process.env.NODE_ENV === 'production')
      headers.set('strict-transport-security', STRICT_TRANSPORT_SECURITY)
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      headers.set('allow', 'GET, HEAD')
      return new Response('Method not allowed', { status: 405, headers })
    }
    if (url.pathname === basePath && options.trailingSlashRedirect !== false) {
      headers.set('location', `${basePath}/${url.search}`)
      return new Response(null, { status: 308, headers })
    }
    if (url.pathname !== basePath && !url.pathname.startsWith(`${basePath}/`))
      return new Response('Not found', { status: 404, headers })

    let relative: string
    try {
      relative = decodeURIComponent(url.pathname.slice(basePath.length + 1))
    } catch {
      return new Response('Bad request', { status: 400, headers })
    }
    // Static files: only inside the app directory, never the shell directly (it needs injection).
    const path = posix.normalize(relative)
    const inside = options.readFile
      ? !path.startsWith('../') && path !== '..' && !path.startsWith('/')
      : normalize(join(appDir, relative)).startsWith(appDir + sep)
    if (relative !== '' && relative !== SHELL_FILE && inside && extname(path) !== '') {
      const data = await readApp(path)
      if (data) {
        headers.set('content-type', TYPES[extname(path)] ?? 'application/octet-stream')
        // Vite puts content hashes in asset names, so they never change.
        headers.set(
          'cache-control',
          relative.startsWith('assets/')
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=3600',
        )
        const body = request.method === 'HEAD' ? null : (data as Uint8Array<ArrayBuffer>)
        return new Response(body, { status: 200, headers })
      }
      if (relative.startsWith('assets/')) return new Response('Not found', { status: 404, headers })
    }

    headers.set('content-type', TYPES['.html'] as string)
    headers.set('cache-control', 'no-store')
    return new Response(request.method === 'HEAD' ? null : await html(), { status: 200, headers })
  }
}
