import { describe, expect, it } from 'vitest'
import { matchesWhere } from '../src/realtime.js'

// Whether a subscriber could see a document before a change (ADR-0070): `where` in memory, and
// `undefined` (so no `leave` or `delete`) when it can't tell.
describe('matchesWhere', () => {
  const doc = {
    id: 3,
    status: 'published',
    owner: 7,
    author: { id: 9, name: 'A' },
    title: { en: 'Hello', th: 'สวัสดี' },
    views: 12,
    tags: ['a'],
    at: '2026-11-14T00:00:00.000Z',
  }

  it('compares values as the database does', () => {
    expect(matchesWhere({ status: { equals: 'published' } }, doc)).toBe(true)
    expect(matchesWhere({ owner: { equals: '7' } }, doc)).toBe(true)
    expect(matchesWhere({ owner: { not_equals: 7 } }, doc)).toBe(false)
    expect(matchesWhere({ author: { equals: 9 } }, doc)).toBe(true)
    expect(matchesWhere({ 'title.th': { equals: 'สวัสดี' } }, doc)).toBe(true)
    expect(matchesWhere({ views: { gt: 10, lte: 12 } }, doc)).toBe(true)
    expect(matchesWhere({ at: { lt: '2026-12-01' } }, doc)).toBe(true)
    expect(matchesWhere({ status: { in: ['draft'] } }, doc)).toBe(false)
    expect(matchesWhere({ missing: { exists: false } }, doc)).toBe(true)
    expect(matchesWhere({ missing: { equals: null } }, doc)).toBe(true)
  })

  it('joins with and / or', () => {
    const owner = { owner: { equals: 7 } }
    const draft = { status: { equals: 'draft' } }
    expect(matchesWhere({ and: [owner, draft] }, doc)).toBe(false)
    expect(matchesWhere({ or: [owner, draft] }, doc)).toBe(true)
  })

  it('is unsure about what only the database can tell', () => {
    expect(matchesWhere({ title: { like: 'hel' } }, doc)).toBeUndefined()
    expect(matchesWhere({ tags: { equals: 'a' } }, doc)).toBeUndefined()
    expect(matchesWhere({ title: { equals: 'Hello' } }, doc)).toBeUndefined()
    // A definite false still wins.
    expect(matchesWhere({ and: [{ owner: { equals: 1 } }, { tags: { equals: 'a' } }] }, doc)).toBe(
      false,
    )
  })
})
