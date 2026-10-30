import { afterEach, describe, expect, it } from 'vitest'
import { fromLocalInput, toLocalInput } from '../app/src/lib/fields'
import { formatDate, locale } from '../app/src/lib/i18n'
import { adminTimeZone, fromZoned, toZoned, zoneDiffers, zoneName } from '../app/src/lib/time-zone'

// The browser's zone in these tests: UTC, wherever they run.
process.env.TZ = 'UTC'

afterEach(() => {
  adminTimeZone.value = undefined
  locale.value = 'en'
})

describe('admin time zone (#271)', () => {
  // The site's zone is Bangkok, UTC+7.
  it('shows and takes times in config.timeZone, near midnight', () => {
    adminTimeZone.value = 'Asia/Bangkok'
    // 30 Oct 17:30 UTC is already 31 Oct in Bangkok.
    expect(toLocalInput('2026-10-30T17:30:00.000Z')).toBe('2026-10-31T00:30')
    expect(fromLocalInput('2026-10-31T00:30')).toBe('2026-10-30T17:30:00.000Z')
    expect(formatDate('2026-10-30T17:30:00.000Z')).toBe('31 Oct 2026, 00:30')
    locale.value = 'th'
    expect(formatDate('2026-10-30T17:30:00.000Z')).toBe('31 ต.ค. 2569 00:30')
  })

  it("keeps the browser's zone without config.timeZone", () => {
    expect(toLocalInput('2026-10-30T17:30:00.000Z')).toBe('2026-10-30T17:30')
    expect(fromLocalInput('2026-10-30T17:30')).toBe('2026-10-30T17:30:00.000Z')
    expect(zoneDiffers.value).toBe(false)
  })

  it('round-trips across daylight saving time', () => {
    const zone = 'America/New_York'
    // Moments in summer time, at the change back (1 Nov 2026) and in winter time.
    for (const iso of [
      '2026-11-01T12:00:00.000Z',
      '2026-07-01T03:59:00.000Z',
      '2026-12-31T23:00:00.000Z',
    ])
      expect(fromZoned(toZoned(iso, zone), zone)).toBe(iso)
    expect(toZoned('2026-11-02T04:00:00.000Z', zone)).toBe('2026-11-01T23:00')
  })

  it('names the zone only when the browser is in another one', () => {
    adminTimeZone.value = 'Asia/Bangkok'
    expect(zoneDiffers.value).toBe(true)
    expect(zoneName('en-GB')).toMatch(/GMT\+7/)
    adminTimeZone.value = 'UTC'
    expect(zoneDiffers.value).toBe(false)
  })
})
