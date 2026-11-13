import { afterEach, describe, expect, it, vi } from 'vitest'
import { platformClientIp } from '../src/internal.js'

describe('platformClientIp', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  const headers = new Headers({
    'cf-connecting-ip': '203.0.113.7',
    'x-forwarded-for': '198.51.100.1',
  })

  it('reads CF-Connecting-IP on Cloudflare Workers (ADR-0067)', () => {
    vi.stubEnv('VERCEL', '')
    vi.stubEnv('NETLIFY', '')
    vi.stubGlobal('navigator', { userAgent: 'Cloudflare-Workers' })
    expect(platformClientIp(headers)).toBe('203.0.113.7')
  })

  it('trusts no header elsewhere', () => {
    vi.stubEnv('VERCEL', '')
    vi.stubEnv('NETLIFY', '')
    expect(platformClientIp(headers)).toBeUndefined()
  })
})
