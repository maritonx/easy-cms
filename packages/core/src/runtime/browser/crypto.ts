/**
 * `../crypto.ts` without `node:crypto`, for the browser build (ADR-0074). Web Crypto is async and
 * core's hashes and MACs are not, so this uses @noble (audited, pure JS). Same functions, same
 * results: `test/runtime-browser.test.ts` compares the two.
 */
import { gcm } from '@noble/ciphers/aes.js'
import { hkdf as nobleHkdf } from '@noble/hashes/hkdf.js'
import { hmac as nobleHmac } from '@noble/hashes/hmac.js'
import { sha1 } from '@noble/hashes/legacy.js'
import { scryptAsync } from '@noble/hashes/scrypt.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { type Encoding, encode, utf8 } from './bytes.js'

export type { Encoding } from './bytes.js'

type Data = string | Uint8Array

const bytes = (data: Data) => (typeof data === 'string' ? utf8(data) : data)
const TAG_LENGTH = 16

/** The hash of `data` (text is hashed as UTF-8). */
export function hash(algorithm: 'sha1' | 'sha256', data: Data): Uint8Array
export function hash(algorithm: 'sha1' | 'sha256', data: Data, encoding: Encoding): string
export function hash(
  algorithm: 'sha1' | 'sha256',
  data: Data,
  encoding?: Encoding,
): string | Uint8Array {
  const digest = (algorithm === 'sha1' ? sha1 : sha256)(bytes(data))
  return encoding ? encode(digest, encoding) : digest
}

/** The HMAC of `data` with `key`: SHA-256, or SHA-1 where a protocol asks (OAuth 1.0a). */
export function hmac(
  key: Data,
  data: Data,
  encoding: Encoding,
  algorithm: 'sha1' | 'sha256' = 'sha256',
): string {
  return encode(nobleHmac(algorithm === 'sha1' ? sha1 : sha256, bytes(key), bytes(data)), encoding)
}

/**
 * Whether two values are equal, in time that doesn't depend on where they differ.
 * Values of different lengths are unequal (the length isn't secret).
 */
export function safeEqual(a: Data, b: Data): boolean {
  const left = bytes(a)
  const right = bytes(b)
  if (left.byteLength !== right.byteLength) return false
  let diff = 0
  for (let i = 0; i < left.byteLength; i++) diff |= (left[i] as number) ^ (right[i] as number)
  return diff === 0
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
  return nobleHkdf(sha256, bytes(secret), bytes(salt), utf8(info), length)
}

export interface Sealed {
  readonly data: Uint8Array
  readonly tag: Uint8Array
}

/** AES-256-GCM encryption with a 32-byte key and a 12-byte IV. */
export function aesGcmEncrypt(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Sealed {
  const sealed = gcm(key, iv).encrypt(data)
  const end = sealed.byteLength - TAG_LENGTH
  return { data: sealed.slice(0, end), tag: sealed.slice(end) }
}

/** AES-256-GCM decryption; throws when the key is wrong or the data changed. */
export function aesGcmDecrypt(key: Uint8Array, iv: Uint8Array, sealed: Sealed): Uint8Array {
  const joined = new Uint8Array(sealed.data.byteLength + sealed.tag.byteLength)
  joined.set(sealed.data)
  joined.set(sealed.tag, sealed.data.byteLength)
  return gcm(key, iv).decrypt(joined)
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
  return scryptAsync(bytes(password), salt, { ...params, dkLen: length })
}
