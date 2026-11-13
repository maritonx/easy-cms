/**
 * Bytes and text encodings. The rest of core uses these instead of `Buffer`, so moving off
 * `node:buffer` later (to `Uint8Array.fromBase64` and friends) changes only this file (ADR-0067).
 */
import { Buffer } from 'node:buffer'

export type Encoding = 'hex' | 'base64' | 'base64url'

const view = (data: Uint8Array) => Buffer.from(data.buffer, data.byteOffset, data.byteLength)

/** Text as UTF-8 bytes. */
export function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

/** UTF-8 bytes as text. */
export function text(data: Uint8Array): string {
  return new TextDecoder().decode(data)
}

/** Bytes (or text, as UTF-8) in an encoding. */
export function encode(data: Uint8Array | string, encoding: Encoding): string {
  return (typeof data === 'string' ? Buffer.from(data, 'utf8') : view(data)).toString(encoding)
}

/** Bytes from an encoding. Characters outside it are skipped, as `Buffer.from` does. */
export function decode(value: string, encoding: Encoding): Uint8Array {
  const buffer = Buffer.from(value, encoding)
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
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
  return view(data).includes(search, 0, 'latin1')
}
