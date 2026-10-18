/**
 * Times of day in a time zone (`timeZone` in the config), for `jobs[].at` and `backups.at`.
 * Without a zone, the server's: what `Date#setHours` does.
 */

const DAY = 86_400_000

/** Whether `zone` is an IANA time zone this runtime knows, e.g. `Asia/Bangkok`. */
export function isTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>()

/** The wall-clock time at `instant` in `zone`, as if it were UTC (milliseconds). */
function wallClock(instant: number, zone: string): number {
  let format = formatters.get(zone)
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
    formatters.set(zone, format)
  }
  const parts: Record<string, number> = {}
  for (const part of format.formatToParts(instant))
    if (part.type !== 'literal') parts[part.type] = Number(part.value)
  return Date.UTC(
    parts.year as number,
    (parts.month as number) - 1,
    parts.day as number,
    parts.hour as number,
    parts.minute as number,
    parts.second as number,
  )
}

/** The instant whose wall-clock time in `zone` is `wall` (a UTC-based millisecond value). */
function instantOf(wall: number, zone: string): number {
  // The zone's offset at a first guess, then again at the result, for days the offset changes.
  let instant = wall - (wallClock(wall, zone) - wall)
  instant = wall - (wallClock(instant, zone) - instant)
  return instant
}

const parse = (at: string) => at.split(':').map(Number) as [number, number]

/** The latest time `at` (`HH:MM`) at or before `now`. */
export function lastSlot(now: Date, at: string, zone?: string): Date {
  const [hours, minutes] = parse(at)
  if (!zone) {
    const slot = new Date(now)
    slot.setHours(hours, minutes, 0, 0)
    if (slot.getTime() > now.getTime()) slot.setDate(slot.getDate() - 1)
    return slot
  }
  const today = wallClock(now.getTime(), zone)
  const midnight = today - (today % DAY)
  let slot = instantOf(midnight + hours * 3_600_000 + minutes * 60_000, zone)
  if (slot > now.getTime())
    slot = instantOf(midnight - DAY + hours * 3_600_000 + minutes * 60_000, zone)
  return new Date(slot)
}

/** The first time `at` after `after`. */
export function nextSlot(after: Date, at: string, zone?: string): Date {
  const last = lastSlot(after, at, zone)
  // A day later on the wall clock, which is not always 24 hours.
  return lastSlot(new Date(last.getTime() + DAY + 2 * 3_600_000), at, zone)
}

/**
 * Whether a run at `at` every `every` seconds (whole days) is due at `now`, given the last run:
 * once per slot, and for `every` above a day, not before that many days since the last run.
 */
export function dueAt(
  now: Date,
  at: string,
  every: number,
  lastRun: string | undefined,
  zone?: string,
): boolean {
  if (lastRun === undefined) return true
  const last = Date.parse(lastRun)
  if (Number.isNaN(last)) return true
  const slot = lastSlot(now, at, zone).getTime()
  return last < slot - (every * 1000 - DAY)
}

/** When a run at `at` every `every` seconds is next due, after a run at `lastRun`. */
export function nextAt(at: string, every: number, lastRun: string, zone?: string): Date {
  return nextSlot(new Date(Date.parse(lastRun) + (every * 1000 - DAY)), at, zone)
}
