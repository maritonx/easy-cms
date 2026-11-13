import { describe, expect, it } from 'vitest'
import { slugify } from '../src/document.js'
import { trimChar } from '../src/trim.js'

describe('trimChar', () => {
  it('trims a character at either end, or one of them', () => {
    expect(trimChar('--a-b--', '-')).toBe('a-b')
    expect(trimChar('//admin//', '/', { start: false })).toBe('//admin')
    expect(trimChar('//admin//', '/', { end: false })).toBe('admin//')
    expect(trimChar('----', '-')).toBe('')
    expect(trimChar('', '-')).toBe('')
  })

  it('takes linear time on many repetitions', () => {
    const many = `${'-'.repeat(200_000)}x${'-'.repeat(200_000)}`
    const start = performance.now()
    expect(trimChar(many, '-')).toBe('x')
    expect(slugify(`${'!'.repeat(100_000)}สวัสดี World!${'!'.repeat(100_000)}`)).toBe('สวัสดี-world')
    expect(performance.now() - start).toBeLessThan(1000)
  })
})
