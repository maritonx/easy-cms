/**
 * What this package needs from the runtime, so it imports no Node module and runs in browsers
 * too (Studio, ADR-0074): random values from Web Crypto, HMAC from core.
 *
 * `hmac` is read off a namespace import, not imported by name: it is new in core 1.58, and npm
 * may pair this package with an older core, which only runs on a server. There it comes from
 * Node's own module (`process.getBuiltinModule`, in Node 22.3+, Bun and Deno).
 */
import * as core from '@easy-cms/core/internal'

const internal: Partial<typeof core> = core

/** The HMAC of `data` with `key`, SHA-256 unless SHA-1 is asked for (OAuth 1.0a). */
export const hmac = (
  key: string,
  data: string,
  encoding: 'hex' | 'base64',
  algorithm: 'sha1' | 'sha256' = 'sha256',
): string =>
  internal.hmac
    ? internal.hmac(key, data, encoding, algorithm)
    : (globalThis.process as { getBuiltinModule(name: string): typeof import('node:crypto') })
        .getBuiltinModule('node:crypto')
        .createHmac(algorithm, key)
        .update(data)
        .digest(encoding)

/** `size` random bytes, as hex. */
export const randomHex = (size: number): string =>
  Array.from(globalThis.crypto.getRandomValues(new Uint8Array(size)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')
