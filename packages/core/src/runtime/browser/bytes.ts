/**
 * `../bytes.ts` without `node:buffer`, for the browser build (ADR-0074). Same functions, same
 * results: `test/runtime-browser.test.ts` compares the two.
 */
export type Encoding = 'hex' | 'base64' | 'base64url'

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
/** Both alphabets decode, as `Buffer.from` does. */
const SEXTETS = new Map<string, number>([
  ...[...BASE64].map((c, i) => [c, i] as const),
  ['-', 62],
  ['_', 63],
])
const HEX = '0123456789abcdef'

/** Text as UTF-8 bytes. */
export function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

/** UTF-8 bytes as text. */
export function text(data: Uint8Array): string {
  return new TextDecoder().decode(data)
}

function toBase64(data: Uint8Array, alphabet: string, pad: boolean): string {
  let out = ''
  for (let i = 0; i < data.length; i += 3) {
    const a = data[i] as number
    const b = data[i + 1]
    const c = data[i + 2]
    out += alphabet[a >> 2]
    out += alphabet[((a & 3) << 4) | ((b ?? 0) >> 4)]
    if (b === undefined) out += pad ? '==' : ''
    else {
      out += alphabet[((b & 15) << 2) | ((c ?? 0) >> 6)]
      out += c === undefined ? (pad ? '=' : '') : alphabet[c & 63]
    }
  }
  return out
}

/** Bytes (or text, as UTF-8) in an encoding. */
export function encode(data: Uint8Array | string, encoding: Encoding): string {
  const bytes = typeof data === 'string' ? utf8(data) : data
  if (encoding === 'base64') return toBase64(bytes, BASE64, true)
  if (encoding === 'base64url') return toBase64(bytes, BASE64URL, false)
  let out = ''
  for (const byte of bytes) out += HEX[byte >> 4] + (HEX[byte & 15] as string)
  return out
}

/** Bytes from an encoding. Characters outside it are skipped, as `Buffer.from` does. */
export function decode(value: string, encoding: Encoding): Uint8Array {
  if (encoding === 'hex') {
    // Like Buffer: stops at the first pair that isn't hex.
    const out: number[] = []
    for (let i = 0; i + 1 < value.length; i += 2) {
      const pair = value.slice(i, i + 2)
      if (!/^[0-9a-f]{2}$/i.test(pair)) break
      out.push(Number.parseInt(pair, 16))
    }
    return new Uint8Array(out)
  }
  const out: number[] = []
  let bits = 0
  let count = 0
  for (const char of value) {
    if (char === '=') break
    const sextet = SEXTETS.get(char)
    if (sextet === undefined) continue
    bits = (bits << 6) | sextet
    count += 6
    if (count >= 8) {
      count -= 8
      out.push((bits >> count) & 255)
    }
  }
  return new Uint8Array(out)
}

/** A JSON value as base64url, for tokens and cursors. */
export function toBase64Url(value: unknown): string {
  return encode(JSON.stringify(value), 'base64url')
}

/** The JSON value of `toBase64Url`; throws when it isn't JSON. */
export function fromBase64Url<T = unknown>(value: string): T {
  return JSON.parse(text(decode(value, 'base64url'))) as T
}

/** The bytes one after another. */
export function concat(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.byteLength, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.byteLength
  }
  return result
}

/** Whether two byte arrays are the same (not in constant time: see `safeEqual`). */
export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.byteLength === b.byteLength && a.every((byte, i) => byte === b[i])
}

/** The bytes compressed with gzip (Web `CompressionStream`). */
export async function gzip(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Whether the bytes contain `search`, an ASCII string. */
export function containsAscii(data: Uint8Array, search: string): boolean {
  const needle = [...search].map((c) => c.charCodeAt(0) & 255)
  if (needle.length === 0) return true
  outer: for (let i = 0; i + needle.length <= data.length; i++) {
    for (let j = 0; j < needle.length; j++) if (data[i + j] !== needle[j]) continue outer
    return true
  }
  return false
}
