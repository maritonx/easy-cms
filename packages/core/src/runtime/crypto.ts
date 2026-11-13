/**
 * Hashes, MACs, random values and encryption for the rest of core. Only this file imports
 * `node:crypto` (which Node, Bun, Deno and Cloudflare Workers with `nodejs_compat` all have);
 * moving a function to Web Crypto changes only this file (ADR-0067).
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from 'node:crypto'
import { type Encoding, utf8 } from './bytes.js'

export type { Encoding } from './bytes.js'

type Data = string | Uint8Array

const bytes = (data: Data) => (typeof data === 'string' ? utf8(data) : data)
const asBytes = (data: Uint8Array) => new Uint8Array(data.buffer, data.byteOffset, data.byteLength)

/** The hash of `data` (text is hashed as UTF-8). */
export function hash(algorithm: 'sha1' | 'sha256', data: Data): Uint8Array
export function hash(algorithm: 'sha1' | 'sha256', data: Data, encoding: Encoding): string
export function hash(
  algorithm: 'sha1' | 'sha256',
  data: Data,
  encoding?: Encoding,
): string | Uint8Array {
  const digest = createHash(algorithm).update(bytes(data))
  return encoding ? digest.digest(encoding) : asBytes(digest.digest())
}

/** The HMAC-SHA256 of `data` with `key`. */
export function hmac(key: Data, data: Data, encoding: Encoding): string {
  return createHmac('sha256', bytes(key)).update(bytes(data)).digest(encoding)
}

/**
 * Whether two values are equal, in time that doesn't depend on where they differ.
 * Values of different lengths are unequal (the length isn't secret).
 */
export function safeEqual(a: Data, b: Data): boolean {
  const left = bytes(a)
  const right = bytes(b)
  return left.byteLength === right.byteLength && timingSafeEqual(left, right)
}

/** `size` cryptographically random bytes. */
export function randomBytes(size: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(size))
}

/** A random UUID (v4). */
export function randomUUID(): string {
  return globalThis.crypto.randomUUID()
}

/** HKDF-SHA256 key derivation. */
export function hkdf(secret: Data, salt: Data, info: string, length: number): Uint8Array {
  return new Uint8Array(hkdfSync('sha256', bytes(secret), bytes(salt), info, length))
}

export interface Sealed {
  readonly data: Uint8Array
  readonly tag: Uint8Array
}

/** AES-256-GCM encryption with a 32-byte key and a 12-byte IV. */
export function aesGcmEncrypt(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Sealed {
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const first = cipher.update(data)
  const last = cipher.final()
  const result = new Uint8Array(first.byteLength + last.byteLength)
  result.set(first)
  result.set(last, first.byteLength)
  return { data: result, tag: asBytes(cipher.getAuthTag()) }
}

/** AES-256-GCM decryption; throws when the key is wrong or the data changed. */
export function aesGcmDecrypt(key: Uint8Array, iv: Uint8Array, sealed: Sealed): Uint8Array {
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(sealed.tag)
  const first = decipher.update(sealed.data)
  const last = decipher.final()
  const result = new Uint8Array(first.byteLength + last.byteLength)
  result.set(first)
  result.set(last, first.byteLength)
  return result
}

export interface ScryptParams {
  readonly N: number
  readonly r: number
  readonly p: number
}

/** scrypt key derivation (text as NFKC-normalised UTF-8 is the caller's choice). */
export function scrypt(
  password: Data,
  salt: Uint8Array,
  length: number,
  params: ScryptParams,
): Promise<Uint8Array> {
  // 128 * N * r bytes, with room to spare; Node refuses more than `maxmem`.
  const maxmem = 256 * params.N * params.r
  return new Promise((resolve, reject) => {
    nodeScrypt(bytes(password), salt, length, { ...params, maxmem }, (error, key) =>
      error ? reject(error) : resolve(asBytes(key)),
    )
  })
}
