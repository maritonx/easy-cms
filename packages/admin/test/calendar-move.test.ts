import { beforeEach, describe, expect, it, vi } from 'vitest'

// What the server answers to a save: a pending draft keeps the change when there is one.
const api = vi.fn()
/** A refusal, made outside the spy (a spy's own bookkeeping would leave a rejection unhandled). */
let refuse: string | null = null
vi.mock('../app/src/lib/api', async (importActual) => ({
  ...(await importActual<object>()),
  api: (...args: unknown[]) => {
    const result = api(...args)
    return refuse ? Promise.reject(new Error(refuse)) : result
  },
}))
const { applyMove } = await import('../app/src/lib/calendar')

const bangkok = 'Asia/Bangkok'
const configOf = (slug: string) =>
  slug === 'events' ? { start: 'startsAt', end: 'endsAt' } : undefined
// FullCalendar's wall-clock dates: 28 Oct 09:00–10:00 in Bangkok, moved to 29 Oct 14:00–15:00.
const wall = (s: string) => new Date(`${s}:00Z`)
const move = (extendedProps: object) => ({
  extendedProps: { to: '/x', ...extendedProps },
  start: wall('2026-10-29T14:00'),
  end: wall('2026-10-29T15:00'),
  oldStart: wall('2026-10-28T09:00'),
  oldEnd: wall('2026-10-28T10:00'),
})

describe('moving on a calendar (#272)', () => {
  beforeEach(() => {
    api.mockReset()
    refuse = null
  })

  it('saves a document like the edit page, and undoes it', async () => {
    api.mockResolvedValue({ id: 7, status: 'published' })
    const result = await applyMove(
      move({ collection: 'events', docId: '7', status: 'published' }),
      configOf,
      bangkok,
    )
    expect(api).toHaveBeenCalledWith('PATCH', '/events/7?depth=0', {
      startsAt: '2026-10-29T07:00:00.000Z',
      endsAt: '2026-10-29T08:00:00.000Z',
    })
    expect(result.draft).toBe(false)
    await result.undo()
    expect(api).toHaveBeenLastCalledWith('PATCH', '/events/7?depth=0', {
      startsAt: '2026-10-28T02:00:00.000Z',
      endsAt: '2026-10-28T03:00:00.000Z',
    })
  })

  it('says when the move went into a pending draft', async () => {
    // The calendar shows the pending draft (status draft); the live version is published.
    api
      .mockResolvedValueOnce({ id: 7, status: 'draft' })
      .mockResolvedValueOnce({ status: 'published' })
    const pending = await applyMove(
      move({ collection: 'events', docId: '7', status: 'draft' }),
      configOf,
      bangkok,
    )
    expect(pending.draft).toBe(true)
    expect(api).toHaveBeenLastCalledWith('GET', '/events/7?depth=0')
    // Never published: no live version, a plain "Moved".
    api.mockReset()
    api.mockResolvedValueOnce({ id: 8, status: 'draft' }).mockResolvedValueOnce(null)
    const draft = await applyMove(
      move({ collection: 'events', docId: '8', status: 'draft' }),
      configOf,
      bangkok,
    )
    expect(draft.draft).toBe(false)
  })

  it('moves a scheduled publish by scheduling it again', async () => {
    api.mockResolvedValue({})
    await applyMove(move({ collection: 'posts', docId: '5', action: 'publish' }), configOf, bangkok)
    expect(api).toHaveBeenCalledWith('POST', '/posts/5/schedule', {
      action: 'publish',
      at: '2026-10-29T07:00:00.000Z',
    })
    await applyMove(move({ global: 'site', action: 'unpublish' }), configOf, bangkok)
    expect(api).toHaveBeenLastCalledWith('POST', '/globals/site/schedule', {
      action: 'unpublish',
      at: '2026-10-29T07:00:00.000Z',
    })
  })

  it('passes a refused save on, so the calendar puts the event back', async () => {
    refuse = 'startsAt: must be in the future'
    const refused = await applyMove(
      move({ collection: 'events', docId: '7' }),
      configOf,
      bangkok,
    ).then(
      () => null,
      (e: Error) => e.message,
    )
    expect(refused).toMatch(/must be in the future/)
  })
})

describe('a range of documents (#272)', () => {
  beforeEach(() => {
    api.mockReset()
    refuse = null
  })

  it("keeps only what overlaps the range as shown (a pending draft's new date)", async () => {
    const { loadRange } = await import('../app/src/lib/calendar')
    // The API matched the live dates; "Moved" is a pending draft already on the next day.
    api.mockResolvedValue({
      docs: [
        { id: 1, title: 'Here', startsAt: '2026-10-30T02:00:00.000Z' },
        { id: 2, title: 'Moved', startsAt: '2026-10-31T01:00:00.000Z' },
        {
          id: 3,
          title: 'Started before',
          startsAt: '2026-10-29T10:00:00.000Z',
          endsAt: '2026-10-30T03:00:00.000Z',
        },
      ],
      totalDocs: 3,
      totalPages: 1,
    })
    const events = {
      slug: 'events',
      useAsTitle: 'title',
      calendar: { start: 'startsAt', end: 'endsAt' },
      fields: [],
    }
    const range = await loadRange(
      events as never,
      undefined,
      '2026-10-29T17:00:00.000Z',
      '2026-10-30T17:00:00.000Z',
      () => ({ href: '', to: '' }),
      { timeZone: bangkok },
    )
    expect(range.events.map((e) => e.title)).toEqual(['Here', 'Started before'])
  })
})
