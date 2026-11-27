/**
 * Studio's share links (ADR-0074): the config, deflated and base64url-encoded, in the URL's hash
 * with the Easy CMS version it was made with: `https://studio.easycms.dev/#v=1.57.0&c=…`. The
 * hash never reaches a server. No Node module: Studio uses this in the browser, and
 * `create-easy-cms --from <link>` in Node.
 */

export interface StudioConfig {
  /** The config's code (`easy-cms.config.ts`). */
  readonly code: string
  /** The Easy CMS version Studio ran it with, when the link says. */
  readonly version?: string
}

export class StudioLinkError extends Error {}

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const piped = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(piped).arrayBuffer())
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

/** The hash for a config: `v=…&c=…`, without the `#`. */
export async function encodeStudioHash(config: StudioConfig): Promise<string> {
  const compressed = await pipe(
    new TextEncoder().encode(config.code),
    new CompressionStream('deflate-raw'),
  )
  const params = new URLSearchParams()
  if (config.version) params.set('v', config.version)
  params.set('c', toBase64Url(compressed))
  return params.toString()
}

/** The config in a Studio link, or in its hash alone (with or without the `#`). */
export async function decodeStudioLink(link: string): Promise<StudioConfig> {
  const hash = link.includes('#') ? link.slice(link.indexOf('#') + 1) : link
  const params = new URLSearchParams(hash)
  const payload = params.get('c')
  if (!payload) throw new StudioLinkError('This is not a Studio link: it has no config (#c=…)')
  let code: string
  try {
    code = new TextDecoder('utf-8', { fatal: true }).decode(
      await pipe(fromBase64Url(payload), new DecompressionStream('deflate-raw')),
    )
  } catch {
    throw new StudioLinkError('The Studio link is cut off or changed: its config cannot be read')
  }
  const version = params.get('v')
  return version ? { code, version } : { code }
}

/** `@easy-cms/*` packages the config imports, besides core. */
export function packagesIn(code: string): string[] {
  const found = new Set<string>()
  for (const match of code.matchAll(
    /(?:from|import)\s*(?:\(\s*)?['"](@easy-cms\/[a-z0-9-]+)(?:\/[^'"]*)?['"]/g,
  ))
    if (match[1] !== '@easy-cms/core') found.add(match[1] as string)
  return [...found].sort()
}
