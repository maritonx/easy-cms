import type { AdminCollection, ScheduledPublish } from '@easy-cms/core'
import { api, type Doc, type Paginated, toQuery } from './api'
import { titleOf } from './fields'
import { fromZoned, toZoned } from './time-zone'

/**
 * Calendars (#272), in a collection's list and on the Calendar page: which documents a range
 * shows, and how they and scheduled publishes become events.
 *
 * FullCalendar is given wall-clock times of the admin's time zone and told they are UTC, so it
 * needs no time zone plugin: `toZoned` on the way in, `fromZoned` on the way out (as the date
 * inputs do).
 */

export type CalendarConfig = NonNullable<AdminCollection['calendar']>

/** At most this many documents per range; past it, the calendar asks to filter more. */
export const RANGE_LIMIT = 500

/** Colours of `color` values, in order: `cal-c0` … (see CalendarView's styles). */
export const COLORS = 8

/** Documents that overlap `[from, to)`: they start before its end and end (or start) inside it. */
export function rangeWhere(calendar: CalendarConfig, from: string, to: string) {
  const { start, end } = calendar
  const startsBefore = { [start]: { lt: to } }
  if (!end) return { and: [{ [start]: { gte: from } }, startsBefore] }
  return {
    and: [startsBefore, { or: [{ [end]: { gte: from } }, { [start]: { gte: from } }] }],
  }
}

/** A wall-clock time from FullCalendar (`Date` in "UTC") → the moment, in the admin's zone. */
export function momentOf(wall: Date, timeZone?: string): string {
  return fromZoned(wall.toISOString().slice(0, 16), timeZone) ?? wall.toISOString()
}

const midnight = (wall: string) => wall.endsWith('T00:00')

/** The index of a colour for a document's `color` value: a select's option order, else a hash. */
export function colorOf(collection: AdminCollection, doc: Doc): number | undefined {
  const name = collection.calendar?.color
  if (!name) return undefined
  const raw = doc[name]
  const value =
    raw && typeof raw === 'object' && 'id' in raw ? (raw as { id: unknown }).id : (raw ?? undefined)
  if (value === undefined || value === null || value === '') return undefined
  const field = collection.fields.find((f) => f.name === name)
  const option = field?.options?.findIndex((o) => o.value === value) ?? -1
  if (option >= 0) return option % COLORS
  let hash = 0
  for (const char of String(value)) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0
  return hash % COLORS
}

/** Where an event leads: the link's `href`, and the route the admin opens on a click. */
export interface EventLink {
  href: string
  to: string
}

export interface CalendarEvent {
  id: string
  title: string
  start: string
  end?: string
  allDay: boolean
  url: string
  classNames: string[]
  extendedProps: {
    to: string
    /** The collection it comes from. */
    collection?: string
    /** A document's `status` (with drafts). */
    status?: string
    /** A scheduled publish's action. */
    action?: 'publish' | 'unpublish'
  }
}

/** What a calendar shows for a range, and whether there was more than it could. */
export interface CalendarRange {
  events: CalendarEvent[]
  tooMany: boolean
}

/**
 * A document as an event, `null` without a start. A start at midnight with no end (or an end at
 * midnight too) is a whole day; otherwise without an end it takes an hour.
 */
export function eventOf(
  collection: AdminCollection,
  doc: Doc,
  link: EventLink,
  timeZone?: string,
  classNames?: string[],
): CalendarEvent | null {
  const calendar = collection.calendar
  if (!calendar) return null
  const startIso = doc[calendar.start]
  if (typeof startIso !== 'string' || !startIso) return null
  const start = toZoned(startIso, timeZone)
  if (!start) return null
  const endIso = calendar.end ? doc[calendar.end] : undefined
  const end = typeof endIso === 'string' && endIso ? toZoned(endIso, timeZone) : ''
  const allDay = midnight(start) && (!end || midnight(end))
  const color = colorOf(collection, doc)
  return {
    id: String(doc.id),
    title: titleOf(collection, doc) || `#${doc.id}`,
    start: allDay ? start.slice(0, 10) : start,
    ...(end ? { end: allDay ? end.slice(0, 10) : end } : {}),
    allDay,
    url: link.href,
    classNames: classNames ?? (color === undefined ? [] : [`cal-c${color}`]),
    extendedProps: {
      to: link.to,
      collection: collection.slug,
      ...(typeof doc.status === 'string' ? { status: doc.status } : {}),
    },
  }
}

/** The REST API's largest page. */
const PAGE = 100

/**
 * A collection's documents in `[from, to)` that also match `where`, as events: pages of 100 (the
 * first, then the rest at once), at most RANGE_LIMIT.
 */
export async function loadRange(
  collection: AdminCollection,
  where: Record<string, unknown> | undefined,
  from: string,
  to: string,
  linkOf: (id: string) => EventLink,
  timeZone?: string,
  classNames?: string[],
): Promise<CalendarRange> {
  const calendar = collection.calendar
  if (!calendar) return { events: [], tooMany: false }
  const range = rangeWhere(calendar, from, to)
  const all = where ? { and: [where, range] } : range
  const page = (n: number) =>
    api<Paginated<Doc>>(
      'GET',
      `/${collection.slug}${toQuery({ where: all, limit: PAGE, page: n, depth: 0, draft: true, sort: calendar.start })}`,
    )
  const first = await page(1)
  const pages = Math.min(first.totalPages, RANGE_LIMIT / PAGE)
  const rest = await Promise.all(Array.from({ length: pages - 1 }, (_, i) => page(i + 2)))
  return {
    events: [first, ...rest]
      .flatMap((found) => found.docs)
      .map((doc) => eventOf(collection, doc, linkOf(String(doc.id)), timeZone, classNames))
      .filter((e): e is CalendarEvent => e !== null),
    tooMany: first.totalDocs > RANGE_LIMIT,
  }
}

/** A scheduled publish or unpublish, at its moment, e.g. "Publish: Launch". */
export function jobEvent(
  job: ScheduledPublish & { collection?: string; doc: Doc['id'] },
  title: string,
  link: EventLink,
  timeZone?: string,
  classNames: string[] = [],
): CalendarEvent {
  return {
    id: `job:${job.id}`,
    title,
    start: toZoned(job.runAt, timeZone),
    allDay: false,
    url: link.href,
    classNames: ['cal-scheduled', ...classNames],
    extendedProps: {
      to: link.to,
      ...(job.collection ? { collection: job.collection } : {}),
      action: job.action,
    },
  }
}

/** A day's events for a list: whole days first, then by start. */
export function dayAgenda(events: readonly CalendarEvent[]): CalendarEvent[] {
  return [...events].sort(
    (a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start),
  )
}

/**
 * The values a new document starts with, from an empty slot: a day (all day) or a slot of the
 * week or day view (an hour unless more was selected).
 */
export function initialFor(
  calendar: CalendarConfig,
  slot: { start: Date; end: Date; allDay: boolean },
  timeZone?: string,
): Record<string, string> {
  const start = momentOf(slot.start, timeZone)
  const values: Record<string, string> = { [calendar.start]: start }
  if (!calendar.end) return values
  if (slot.allDay) {
    // A selection of several days ends at the start of the last one's next day: keep its end.
    const days = Math.round((slot.end.getTime() - slot.start.getTime()) / 86_400_000)
    if (days > 1) values[calendar.end] = momentOf(slot.end, timeZone)
    return values
  }
  values[calendar.end] = momentOf(slot.end, timeZone)
  return values
}
