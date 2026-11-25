import { describe, expect, it } from 'vitest'
import { trimSlashes } from '../src/slashes.js'

describe('trimSlashes', () => {
  it('trims both ends, or only the end', () => {
    expect(trimSlashes('/api/cms/')).toBe('api/cms')
    expect(trimSlashes('///api//cms///')).toBe('api//cms')
    expect(trimSlashes('/admin/', 'end')).toBe('/admin')
    expect(trimSlashes('///')).toBe('')
    expect(trimSlashes('')).toBe('')
  })

  it('stays fast on a long run of slashes', () => {
    const start = performance.now()
    expect(trimSlashes(`${'/'.repeat(200_000)}x${'/'.repeat(200_000)}`)).toBe('x')
    expect(trimSlashes(`a${'/'.repeat(200_000)}b`)).toBe(`a${'/'.repeat(200_000)}b`)
    expect(performance.now() - start).toBeLessThan(500)
  })
})
