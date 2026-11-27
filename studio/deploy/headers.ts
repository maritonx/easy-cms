/**
 * Studio's response headers, in one place: the Caddy site blocks (`caddy.ts`), the Service Worker
 * (for the admin's shell, which it makes itself) and the deployed-shape test all use these.
 *
 * The sandbox runs code from shared links, so it gets an origin of its own without cookies, and
 * only the editor may frame it. It needs `'unsafe-eval'` (the config runs with `new Function`)
 * and `'wasm-unsafe-eval'` (sql.js); the editor and the admin need neither.
 */

export interface Origins {
  /** The editor, e.g. https://studio.easycms.dev. */
  readonly studio: string
  /** The sandbox, e.g. https://sandbox.easycms.dev. */
  readonly sandbox: string
  /**
   * Where the analytics script loads from and sends to, when they are on: Umami Cloud is
   * `https://cloud.umami.is` and `https://gateway.umami.is`.
   */
  readonly analytics?: readonly string[]
}

const csp = (directives: Record<string, readonly string[]>) =>
  Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ')

const COMMON: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
}

/** The editor's page and its files. */
export function editorHeaders(origins: Origins): Record<string, string> {
  const stats = origins.analytics ?? []
  return {
    ...COMMON,
    'content-security-policy': csp({
      'default-src': ["'self'"],
      'script-src': ["'self'", ...stats],
      // Monaco puts its styles in <style> elements.
      'style-src': ["'self'", "'unsafe-inline'"],
      'font-src': ["'self'", 'data:'],
      'img-src': ["'self'", 'data:'],
      'worker-src': ["'self'"],
      'connect-src': ["'self'", ...stats],
      'frame-src': [origins.sandbox],
      'frame-ancestors': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      'object-src': ["'none'"],
    }),
  }
}

/** The sandbox's page, its Service Worker and its files. */
export function sandboxHeaders(origins: Origins): Record<string, string> {
  return {
    ...COMMON,
    'content-security-policy': csp({
      'default-src': ["'self'"],
      'script-src': ["'self'", "'unsafe-eval'", "'wasm-unsafe-eval'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'blob:'],
      'font-src': ["'self'", 'data:'],
      'connect-src': ["'self'"],
      'worker-src': ["'self'"],
      'frame-src': ["'self'"],
      'frame-ancestors': [origins.studio],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      'object-src': ["'none'"],
    }),
  }
}

/**
 * The admin in the sandbox (its shell comes from the Service Worker). `frame-ancestors` checks
 * every ancestor up to the top: the sandbox page and the editor above it.
 */
export function adminHeaders(origins: Pick<Origins, 'studio'>): Record<string, string> {
  return {
    ...COMMON,
    'content-security-policy': csp({
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      // Tiptap and Vue transitions set inline style attributes.
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'blob:'],
      'font-src': ["'self'", 'data:'],
      'media-src': ["'self'", 'blob:'],
      'connect-src': ["'self'"],
      'frame-src': ["'self'"],
      'frame-ancestors': ["'self'", origins.studio],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      'object-src': ["'none'"],
    }),
  }
}

/** How long each kind of file may be kept: hashed assets for good, the rest checked each time. */
export function cacheControl(path: string): string {
  return path.startsWith('/assets/') || path.startsWith('/admin/assets/')
    ? 'public, max-age=31536000, immutable'
    : 'no-cache'
}
