/**
 * The SPA's HTML shell and the settings injected into it, without Node's modules: the admin
 * handler uses it, and Studio (ADR-0074) renders the shell in a browser (`@easy-cms/admin/shell`).
 */

/** The SPA's HTML entry inside the app directory. */
export const SHELL_FILE = 'shell.html'

export interface ShellOptions {
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
  /**
   * Studio mode (ADR-0074), outside semver: the admin runs in a frame of the page at `origin`,
   * which may tell it to load the schema again (`{ type: 'easy-cms:reload' }`). It has no Log out:
   * Studio's Service Worker signs every request in.
   */
  readonly studio?: { readonly origin: string }
}

const escapeAttr = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
export const trimSlashes = (path: string) => `/${path.replace(/^\/+|\/+$/g, '')}`

/** Injects `<base href>` and the settings the app reads at startup into the shell HTML. */
export function renderShell(source: string, options: ShellOptions = {}): string {
  const basePath = trimSlashes(options.basePath ?? '/admin')
  const settings = JSON.stringify({
    adminPath: basePath,
    apiPath: trimSlashes(options.apiPath ?? '/api/cms'),
    locale: options.locale ?? 'en',
    brand: options.brand ?? {},
    siteURL: options.siteURL ?? '',
    ...(options.studio ? { studio: { origin: options.studio.origin } } : {}),
  })
  return source.replace(
    '<head>',
    `<head>\n    <base href="${escapeAttr(`${basePath}/`)}">\n    <meta name="easy-cms" content="${escapeAttr(settings)}">`,
  )
}
