import { describe, expect, it } from 'vitest'
import { knownPages, PageCursors, pageLinks } from '../app/src/lib/list-pages'

describe('list pages (#279)', () => {
  it('counts the pages a total spans', () => {
    expect(knownPages(null, 20)).toBeNull()
    expect(knownPages({ total: 0, more: false }, 20)).toBe(1)
    expect(knownPages({ total: 41, more: false }, 20)).toBe(3)
    expect(knownPages({ total: 10_000, more: true }, 50)).toBe(200)
  })

  it('links the first, the neighbours and the last page', () => {
    expect(pageLinks(1, 1, false)).toEqual([1])
    expect(pageLinks(1, 3, true)).toEqual([1, 2, 3])
    expect(pageLinks(5, 10, true)).toEqual([1, 'gap', 4, 5, 6, 'gap', 10])
    expect(pageLinks(10, 10, false)).toEqual([1, 'gap', 9, 10])
  })

  it('leaves the last page out while it is unknown, and goes past the counted pages', () => {
    expect(pageLinks(1, null, true)).toEqual([1, 2])
    expect(pageLinks(4, null, true)).toEqual([1, 'gap', 3, 4, 5])
    expect(pageLinks(4, null, false)).toEqual([1, 'gap', 3, 4])
    // Deeper than 10,000 counted: the current page and the next.
    expect(pageLinks(600, null, true)).toEqual([1, 'gap', 599, 600, 601])
  })

  it('keeps the cursors of one query', () => {
    const cursors = new PageCursors()
    cursors.use('a')
    expect(cursors.get(1)).toBe('')
    cursors.set(1, 'c2')
    cursors.set(2, null)
    expect(cursors.get(2)).toBe('c2')
    expect(cursors.get(3)).toBeUndefined()
    cursors.use('a')
    expect(cursors.get(2)).toBe('c2')
    cursors.use('b')
    expect(cursors.get(2)).toBeUndefined()
    cursors.disable()
    expect(cursors.get(1)).toBeUndefined()
  })
})
