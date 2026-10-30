import type { AdminCollection } from '@easy-cms/core'
import { describe, expect, it } from 'vitest'
import {
  colorOf,
  eventOf,
  initialFor,
  jobEvent,
  momentOf,
  rangeWhere,
} from '../app/src/lib/calendar'

// The browser's zone in these tests: UTC, wherever they run.
process.env.TZ = 'UTC'

const events = {
  slug: 'events',
  useAsTitle: 'title',
  calendar: { start: 'startsAt', end: 'endsAt', color: 'kind' },
  fields: [
    { name: 'title', type: 'text' },
    { name: 'startsAt', type: 'date' },
    { name: 'endsAt', type: 'date' },
    {
      name: 'kind',
      type: 'select',
      options: [
        { label: 'Talk', value: 'talk' },
        { label: 'Workshop', value: 'workshop' },
      ],
    },
  ],
} as unknown as AdminCollection
const bangkok = 'Asia/Bangkok'

describe('calendar mode (#272)', () => {
  it('asks for documents that overlap the range', () => {
    expect(rangeWhere({ start: 'startsAt', end: 'endsAt' }, 'A', 'B')).toEqual({
      and: [
        { startsAt: { lt: 'B' } },
        { or: [{ endsAt: { gte: 'A' } }, { startsAt: { gte: 'A' } }] },
      ],
    })
    expect(rangeWhere({ start: 'publishedAt' }, 'A', 'B')).toEqual({
      and: [{ publishedAt: { gte: 'A' } }, { publishedAt: { lt: 'B' } }],
    })
  })

  it('places documents in the admin time zone', () => {
    // 30 Oct 17:30 UTC is 31 Oct 00:30 in Bangkok.
    const doc = {
      id: 7,
      title: 'Launch',
      startsAt: '2026-10-30T17:30:00.000Z',
      endsAt: '2026-10-30T19:00:00.000Z',
      kind: 'workshop',
    }
    const link = { href: '/admin/collections/events/7', to: '/collections/events/7' }
    expect(eventOf(events, doc, link, bangkok)).toEqual({
      id: '7',
      title: 'Launch',
      start: '2026-10-31T00:30',
      end: '2026-10-31T02:00',
      allDay: false,
      url: '/admin/collections/events/7',
      classNames: ['cal-c1'],
      extendedProps: { to: '/collections/events/7' },
    })
    // Midnight to midnight in the zone: whole days.
    const days = eventOf(
      events,
      {
        id: 8,
        title: 'Fair',
        startsAt: '2026-11-04T17:00:00.000Z',
        endsAt: '2026-11-06T17:00:00.000Z',
      },
      { href: '', to: '' },
      bangkok,
    )
    expect(days).toMatchObject({
      start: '2026-11-05',
      end: '2026-11-07',
      allDay: true,
      classNames: [],
    })
    // Without a start, not on the calendar; without a title, its id.
    expect(eventOf(events, { id: 9 }, { href: '', to: '' }, bangkok)).toBeNull()
    expect(
      eventOf(events, { id: 10, startsAt: '2026-11-01T03:00:00.000Z' }, '', bangkok)?.title,
    ).toBe('#10')
  })

  it('shows a scheduled publish at its moment, outlined in its collection colour', () => {
    const job = {
      id: 3,
      action: 'publish',
      runAt: '2026-10-30T17:30:00.000Z',
      collection: 'posts',
      doc: 5,
    } as never
    expect(jobEvent(job, 'Publish: Launch', { href: '/h', to: '/t' }, bangkok, ['cal-c2'])).toEqual(
      {
        id: 'job:3',
        title: 'Publish: Launch',
        start: '2026-10-31T00:30',
        allDay: false,
        url: '/h',
        classNames: ['cal-scheduled', 'cal-c2'],
        extendedProps: { to: '/t' },
      },
    )
  })

  it('colours by select option, else by a hash of the value', () => {
    expect(colorOf(events, { id: 1, kind: 'talk' })).toBe(0)
    const byCategory = {
      ...events,
      calendar: { start: 'startsAt', color: 'category' },
      fields: [...events.fields, { name: 'category', type: 'relationship', to: 'categories' }],
    } as unknown as AdminCollection
    const a = colorOf(byCategory, { id: 1, category: 3 })
    expect(a).toBe(colorOf(byCategory, { id: 2, category: { id: 3 } }))
    expect(a).toBeGreaterThanOrEqual(0)
    expect(colorOf(byCategory, { id: 3 })).toBeUndefined()
  })

  it('starts a new document from an empty slot', () => {
    const calendar = { start: 'startsAt', end: 'endsAt' }
    // FullCalendar's wall-clock times are "UTC" dates: 28 Oct 09:00–10:00 in Bangkok.
    const slot = {
      start: new Date('2026-10-28T09:00:00Z'),
      end: new Date('2026-10-28T10:00:00Z'),
      allDay: false,
    }
    expect(initialFor(calendar, slot, bangkok)).toEqual({
      startsAt: '2026-10-28T02:00:00.000Z',
      endsAt: '2026-10-28T03:00:00.000Z',
    })
    // A day of the month view: all day, no end.
    const day = {
      start: new Date('2026-10-28T00:00:00Z'),
      end: new Date('2026-10-29T00:00:00Z'),
      allDay: true,
    }
    expect(initialFor(calendar, day, bangkok)).toEqual({ startsAt: '2026-10-27T17:00:00.000Z' })
    // Several days: the end too.
    const three = { ...day, end: new Date('2026-10-31T00:00:00Z') }
    expect(initialFor(calendar, three, bangkok)).toEqual({
      startsAt: '2026-10-27T17:00:00.000Z',
      endsAt: '2026-10-30T17:00:00.000Z',
    })
    expect(initialFor({ start: 'startsAt' }, slot, bangkok)).toEqual({
      startsAt: '2026-10-28T02:00:00.000Z',
    })
    expect(momentOf(new Date('2026-10-28T09:00:00Z'))).toBe('2026-10-28T09:00:00.000Z')
  })
})
