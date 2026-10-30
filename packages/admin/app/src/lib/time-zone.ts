import { computed, ref } from 'vue'

/**
 * The admin's time zone (#271): `config.timeZone` when set, else the browser's (`undefined`).
 * Every date the admin shows or takes is in it, so a scheduled publish reads the same everywhere.
 */
export const adminTimeZone = ref<string | undefined>()

/** The browser's own zone. */
export const browserTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone

/** Minutes `timeZone` is ahead of UTC at `ms` (the browser's zone when none). */
function offsetAt(ms: number, timeZone: string | undefined): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const asUTC = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  )
  return Math.round((asUTC - Math.floor(ms / 1000) * 1000) / 60_000)
}

/** The moment a day (`YYYY-MM-DD`) starts in `timeZone`, as an ISO string. */
export function dayStart(day: string, timeZone?: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const midnight = Date.UTC(y, m - 1, d)
  let ms = midnight - offsetAt(midnight, timeZone) * 60_000
  // Across a change of offset (daylight saving), once more with the offset of that moment.
  const second = offsetAt(ms, timeZone)
  ms = midnight - second * 60_000
  return new Date(ms).toISOString()
}

/** The day (`YYYY-MM-DD`) a moment falls on in `timeZone`. */
export function dayOf(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

/** The day after (`YYYY-MM-DD`), on the calendar. */
export function nextDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

/** Today, `days` days from it (negative: before), as `YYYY-MM-DD` in `timeZone`. */
export function today(timeZone?: string, days = 0, now = new Date()): string {
  const day = dayOf(now.toISOString(), timeZone)
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** An ISO moment as `YYYY-MM-DDTHH:mm` in `timeZone`, for `<input type="datetime-local">`. */
export function toZoned(iso: string, timeZone?: string): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return ''
  return new Date(ms + offsetAt(ms, timeZone) * 60_000).toISOString().slice(0, 16)
}

/** `YYYY-MM-DDTHH:mm` read in `timeZone` → ISO moment (`null` when not a date). */
export function fromZoned(local: string, timeZone?: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local)
  if (!match) return null
  const [, y, mo, d, h, mi] = match.map(Number) as [number, number, number, number, number, number]
  const wall = Date.UTC(y, mo - 1, d, h, mi)
  let ms = wall - offsetAt(wall, timeZone) * 60_000
  // Across a change of offset (daylight saving), once more with the offset of that moment.
  ms = wall - offsetAt(ms, timeZone) * 60_000
  return new Date(ms).toISOString()
}

/**
 * Whether to name the zone next to dates: only when it differs from the browser's
 * (someone abroad), so people in the site's own zone see no extra text.
 */
export const zoneDiffers = computed(() => {
  const zone = adminTimeZone.value
  if (!zone || zone === browserTimeZone()) return false
  const now = Date.now()
  return offsetAt(now, zone) !== offsetAt(now, undefined)
})

/** The zone as people read it, e.g. "Indochina Time (GMT+7)" or "เวลาอินโดจีน (GMT+7)". */
export function zoneName(locale: string, timeZone = adminTimeZone.value): string {
  const part = (style: 'long' | 'shortOffset') =>
    new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: style })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName')?.value ?? ''
  const long = part('long')
  const offset = part('shortOffset')
  return long && long !== offset ? `${long} (${offset})` : offset || (timeZone ?? '')
}
