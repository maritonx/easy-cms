import { describe, expect, it } from 'vitest'
import {
  csrfMatches,
  csrfToken,
  hashToken,
  newToken,
  passwordFingerprint,
  passwordTokenMatches,
  signPasswordToken,
  signPreviewToken,
  signToken,
  unsignToken,
  verifyPreviewToken,
} from '../src/auth/tokens.js'
import { hashPassword, verifyPassword } from '../src/internal.js'

const SECRET = 's'.repeat(32)

describe('passwords', () => {
  it('hashes with a random salt and verifies', async () => {
    const [a, b] = await Promise.all([hashPassword('pässword'), hashPassword('pässword')])
    expect(a).not.toBe(b)
    expect(await verifyPassword('pässword', a)).toBe(true)
    expect(await verifyPassword('password', a)).toBe(false)
  })

  it('normalizes unicode before hashing', async () => {
    const hash = await hashPassword('café')
    expect(await verifyPassword('café', hash)).toBe(true)
  })

  it('never matches malformed hashes', async () => {
    for (const bad of ['', 'plain', 'bcrypt$1$2$3$4$5', 'scrypt$16384$8$1$$']) {
      expect(await verifyPassword('x', bad)).toBe(false)
    }
  })
})

describe('tokens', () => {
  it('signs and verifies', () => {
    const token = newToken()
    const signed = signToken(SECRET, token)
    expect(unsignToken(SECRET, signed)).toBe(token)
    expect(unsignToken('o'.repeat(32), signed)).toBeUndefined()
    expect(unsignToken(SECRET, `${signed}x`)).toBeUndefined()
    expect(unsignToken(SECRET, token)).toBeUndefined()
  })

  it('derives distinct hashes and CSRF tokens', () => {
    const token = newToken()
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/)
    expect(csrfToken(SECRET, token)).not.toBe(signToken(SECRET, token).split('.')[1])
    expect(newToken()).not.toBe(token)
  })
})

describe('a previous secret (#167)', () => {
  const OLD = 'o'.repeat(32)
  const both = [SECRET, OLD]

  it('verifies what it signed, while new values are signed with the current one', () => {
    const token = newToken()
    const old = signToken(OLD, token)
    expect(unsignToken(SECRET, old)).toBeUndefined()
    expect(unsignToken(both, old)).toBe(token)
    expect(unsignToken(both, signToken(SECRET, token))).toBe(token)
    expect(unsignToken(['x'.repeat(32), SECRET], old)).toBeUndefined()
    // A client may still send the CSRF token it got before the change.
    expect(csrfMatches(both, token, csrfToken(OLD, token))).toBe(true)
    expect(csrfMatches(both, token, csrfToken(SECRET, token))).toBe(true)
    expect(csrfMatches(SECRET, token, csrfToken(OLD, token))).toBe(false)
  })

  it('covers password links and preview tokens', () => {
    const fingerprint = passwordFingerprint('hash')
    const link = signPasswordToken(OLD, {
      userId: '1',
      purpose: 'reset',
      expiresAt: Date.now() + 60_000,
      fingerprint,
    })
    expect(passwordTokenMatches(SECRET, link, fingerprint)).toBe(false)
    expect(passwordTokenMatches(both, link, fingerprint)).toBe(true)
    const preview = signPreviewToken(OLD, { global: 'site' }, Date.now() + 60_000)
    expect(verifyPreviewToken(SECRET, preview)).toBeNull()
    expect(verifyPreviewToken(both, preview)).toMatchObject({ global: 'site' })
  })
})
