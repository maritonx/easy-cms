import { describe, expect, it } from 'vitest'
import { dueAt, isTimeZone, lastSlot, nextAt, nextSlot } from '../src/time-of-day.js'

const at = (iso: string) => new Date(iso)

describe('time of day in a time zone', () => {
  it('knows IANA zones', () => {
    expect(isTimeZone('Asia/Bangkok')).toBe(true)
    expect(isTimeZone('UTC')).toBe(true)
    expect(isTimeZone('Mars/Olympus')).toBe(false)
  })

  it('finds the latest slot at or before now (Bangkok, UTC+7)', () => {
    // 10:00 in Bangkok: today's 02:00 has passed.
    expect(lastSlot(at('2026-10-18T03:00:00Z'), '02:00', 'Asia/Bangkok').toISOString()).toBe(
      '2026-10-17T19:00:00.000Z',
    )
    // 01:00 in Bangkok: today's 02:00 hasn't come, so yesterday's.
    expect(lastSlot(at('2026-10-17T18:00:00Z'), '02:00', 'Asia/Bangkok').toISOString()).toBe(
      '2026-10-16T19:00:00.000Z',
    )
    // Exactly at the slot counts.
    expect(lastSlot(at('2026-10-17T19:00:00Z'), '02:00', 'Asia/Bangkok').toISOString()).toBe(
      '2026-10-17T19:00:00.000Z',
    )
  })

  it('finds the next slot after a time', () => {
    expect(nextSlot(at('2026-10-17T19:00:00Z'), '02:00', 'Asia/Bangkok').toISOString()).toBe(
      '2026-10-18T19:00:00.000Z',
    )
    expect(nextSlot(at('2026-10-17T18:59:00Z'), '02:00', 'Asia/Bangkok').toISOString()).toBe(
      '2026-10-17T19:00:00.000Z',
    )
  })

  it('keeps the wall-clock time across a daylight-saving change (New York)', () => {
    // 2026-11-01: clocks go back from EDT (UTC-4) to EST (UTC-5).
    expect(lastSlot(at('2026-10-31T12:00:00Z'), '03:00', 'America/New_York').toISOString()).toBe(
      '2026-10-31T07:00:00.000Z',
    )
    expect(nextSlot(at('2026-10-31T07:00:00Z'), '03:00', 'America/New_York').toISOString()).toBe(
      '2026-11-01T08:00:00.000Z',
    )
    // 2026-03-08: clocks go forward; 03:00 exists that day in EDT (UTC-4).
    expect(lastSlot(at('2026-03-08T12:00:00Z'), '03:00', 'America/New_York').toISOString()).toBe(
      '2026-03-08T07:00:00.000Z',
    )
  })

  it('runs daily once per slot, and catches up once after a missed one', () => {
    const zone = 'Asia/Bangkok'
    // Never ran: due.
    expect(dueAt(at('2026-10-18T03:00:00Z'), '02:00', 86_400, undefined, zone)).toBe(true)
    // Ran after today's slot: not again today.
    expect(dueAt(at('2026-10-18T03:00:00Z'), '02:00', 86_400, '2026-10-17T19:05:00Z', zone)).toBe(
      false,
    )
    // Last ran two days ago (the server was down): due once now.
    expect(dueAt(at('2026-10-18T03:00:00Z'), '02:00', 86_400, '2026-10-16T19:01:00Z', zone)).toBe(
      true,
    )
  })

  it('runs every few days at the time', () => {
    const zone = 'Asia/Bangkok'
    const weekly = 7 * 86_400
    // Six days after the last run, the slot has come but a week hasn't passed.
    expect(dueAt(at('2026-10-24T03:00:00Z'), '02:00', weekly, '2026-10-17T19:00:00Z', zone)).toBe(
      false,
    )
    // The seventh day's slot.
    expect(dueAt(at('2026-10-24T19:00:00Z'), '02:00', weekly, '2026-10-17T19:00:00Z', zone)).toBe(
      true,
    )
    expect(nextAt('02:00', weekly, '2026-10-17T19:00:00Z', zone).toISOString()).toBe(
      '2026-10-24T19:00:00.000Z',
    )
  })

  it("uses the server's time without a zone", () => {
    const now = new Date(2026, 9, 18, 10, 0)
    const slot = lastSlot(now, '02:00')
    expect([slot.getHours(), slot.getMinutes(), slot.getDate()]).toEqual([2, 0, 18])
  })
})
