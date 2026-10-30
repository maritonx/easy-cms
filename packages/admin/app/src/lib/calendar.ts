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
  /** It may be dragged to another time (permission); its end may be dragged too (an `end` field). */
  startEditable: boolean
  durationEditable: boolean
  extendedProps: {
    to: string
    /** The collection it comes from, and the document's id there. */
    collection?: string
    docId?: string
    /** A scheduled publish of a global. */
    global?: string
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

/** How events are shown and whether they move: the admin's time zone, colours, permission. */
export interface EventOptions {
  timeZone?: string | undefined
  classNames?: string[] | undefined
  /** The user may move it: update (documents) or publish (scheduled publishes). */
  canMove?: boolean | undefined
}

/**
 * A document as an event, `null` without a start. A start at midnight with no end (or an end at
 * midnight too) is a whole day; otherwise without an end it takes an hour.
 */
export function eventOf(
  collection: AdminCollection,
  doc: Doc,
  link: EventLink,
  options: EventOptions = {},
): CalendarEvent | null {
  const { timeZone, classNames, canMove = false } = options
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
    // Unique across collections, for the Calendar page.
    id: `${collection.slug}:${doc.id}`,
    title: titleOf(collection, doc) || `#${doc.id}`,
    start: allDay ? start.slice(0, 10) : start,
    ...(end ? { end: allDay ? end.slice(0, 10) : end } : {}),
    allDay,
    url: link.href,
    classNames: classNames ?? (color === undefined ? [] : [`cal-c${color}`]),
    startEditable: canMove,
    durationEditable: canMove && calendar.end !== undefined,
    extendedProps: {
      to: link.to,
      collection: collection.slug,
      docId: String(doc.id),
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
  options: EventOptions = {},
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
  // With `draft=true` the API matches `where` on the live document but returns a pending draft;
  // keep only what overlaps the range as shown, so a draft's new date isn't put on the old day.
  const overlaps = (doc: Doc) => {
    const start = doc[calendar.start]
    if (typeof start !== 'string' || start >= to) return false
    const end = calendar.end ? doc[calendar.end] : undefined
    return (typeof end === 'string' && end ? end : start) >= from
  }
  return {
    events: [first, ...rest]
      .flatMap((found) => found.docs)
      .filter(overlaps)
      .map((doc) => eventOf(collection, doc, linkOf(String(doc.id)), options))
      .filter((e): e is CalendarEvent => e !== null),
    tooMany: first.totalDocs > RANGE_LIMIT,
  }
}

/** A scheduled publish or unpublish, at its moment, e.g. "Publish: Launch". */
export function jobEvent(
  job: ScheduledPublish & { collection?: string; global?: string; doc: Doc['id'] },
  title: string,
  link: EventLink,
  options: EventOptions = {},
): CalendarEvent {
  const { timeZone, classNames = [], canMove = false } = options
  return {
    id: `job:${job.id}`,
    title,
    start: toZoned(job.runAt, timeZone),
    allDay: false,
    url: link.href,
    classNames: ['cal-scheduled', ...classNames],
    startEditable: canMove,
    durationEditable: false,
    extendedProps: {
      to: link.to,
      ...(job.collection ? { collection: job.collection, docId: String(job.doc) } : {}),
      ...(job.global ? { global: job.global } : {}),
      action: job.action,
    },
  }
}

/** An event moved to new wall-clock times (FullCalendar's "UTC" dates), and where it was. */
export interface CalendarMove {
  extendedProps: CalendarEvent['extendedProps']
  start: Date
  end: Date | null
  oldStart: Date
  oldEnd: Date | null
}

/**
 * Saves a move: a document through an ordinary save (with separate drafts, into its pending draft
 * when there is one, as the edit page does), a scheduled publish by scheduling it again (which
 * replaces it). Returns how to put it back, and whether the change went to a pending draft.
 */
export async function applyMove(
  move: CalendarMove,
  configOf: (slug: string) => CalendarConfig | undefined,
  timeZone?: string,
): Promise<{ draft: boolean; undo: () => Promise<unknown> }> {
  const props = move.extendedProps
  const save = async (start: Date, end: Date | null): Promise<boolean> => {
    if (props.action) {
      const path = props.global
        ? `/globals/${props.global}/schedule`
        : `/${props.collection}/${encodeURIComponent(props.docId ?? '')}/schedule`
      await api('POST', path, { action: props.action, at: momentOf(start, timeZone) })
      return false
    }
    const calendar = props.collection ? configOf(props.collection) : undefined
    if (!calendar || !props.docId) throw new Error('Not on a calendar')
    const body: Record<string, string> = { [calendar.start]: momentOf(start, timeZone) }
    if (calendar.end && end) body[calendar.end] = momentOf(end, timeZone)
    const path = `/${props.collection}/${encodeURIComponent(props.docId)}`
    const saved = await api<Doc>('PATCH', `${path}?depth=0`, body)
    if (saved.status !== 'draft') return false
    // A draft: of a document that is also live (a pending draft), or never published? The
    // calendar reads drafts, so its own status can't say; the live version can.
    const live = await api<Doc>('GET', `${path}?depth=0`).catch(() => null)
    return live?.status === 'published'
  }
  const draft = await save(move.start, move.end)
  return { draft, undo: () => save(move.oldStart, move.oldEnd) }
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
