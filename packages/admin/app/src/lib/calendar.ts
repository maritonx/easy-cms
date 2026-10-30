import type { AdminCollection } from '@easy-cms/core'
import type { Doc } from './api'
import { titleOf } from './fields'
import { fromZoned, toZoned } from './time-zone'

/**
 * The list's Calendar mode (#272): which documents a range shows, and how they become events.
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

export interface CalendarEvent {
  id: string
  title: string
  start: string
  end?: string
  allDay: boolean
  url: string
  classNames: string[]
}

/**
 * A document as an event, `null` without a start. A start at midnight with no end (or an end at
 * midnight too) is a whole day; otherwise without an end it takes an hour.
 */
export function eventOf(
  collection: AdminCollection,
  doc: Doc,
  href: string,
  timeZone?: string,
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
    url: href,
    classNames: color === undefined ? [] : [`cal-c${color}`],
  }
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
