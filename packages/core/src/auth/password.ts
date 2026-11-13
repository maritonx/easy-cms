import { decode, encode } from '../runtime/bytes.js'
import { randomBytes, safeEqual, scrypt } from '../runtime/crypto.js'

export const MIN_PASSWORD_LENGTH = 8

/**
 * scrypt with N=2^15, r=8, p=3: as strong as OWASP's N=2^17, p=1, in 32 MB instead of 128 MB,
 * so it fits a Cloudflare Worker (ADR-0067). The parameters are stored in each hash; older
 * hashes still verify and are replaced at the next sign-in (`needsRehash`).
 */
const N = 2 ** 15
const R = 8
const P = 3
const KEY_LENGTH = 64
/** Hashes asking for more memory (N * r) than this are refused instead of computed. */
const MAX_COST = 2 ** 17 * 8

const derive = (
  password: string,
  salt: Uint8Array,
  n: number,
  r: number,
  p: number,
  length: number,
) => scrypt(password.normalize('NFKC'), salt, length, { N: n, r, p })

/** Hashes a password as `scrypt$N$r$p$salt$hash` (base64url). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await derive(password, salt, N, R, P, KEY_LENGTH)
  return ['scrypt', N, R, P, encode(salt, 'base64url'), encode(key, 'base64url')].join('$')
}

/** Checks a password against a hash in constant time. Malformed hashes never match. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltText, keyText] = stored.split('$')
  const params = [Number(n), Number(r), Number(p)] as const
  if (scheme !== 'scrypt' || !saltText || !keyText) return false
  if (!params.every((v) => Number.isInteger(v) && v > 0) || params[0] * params[1] > MAX_COST)
    return false
  const expected = decode(keyText, 'base64url')
  const key = await derive(password, decode(saltText, 'base64url'), ...params, expected.length)
  return safeEqual(key, expected)
}

/** Whether a hash (that verified) was made with other parameters than `hashPassword` uses now. */
export function needsRehash(stored: string): boolean {
  return !stored.startsWith(`scrypt$${N}$${R}$${P}$`)
}

let dummyHash: Promise<string> | undefined

/** Burns the same time as a real check, so response times don't reveal whether an email exists. */
export async function fakeVerify(password: string): Promise<false> {
  dummyHash ??= hashPassword('easy-cms-dummy-password')
  await verifyPassword(password, await dummyHash)
  return false
}
