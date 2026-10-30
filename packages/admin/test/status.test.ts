import { describe, expect, it } from 'vitest'
import { shownStatus } from '../app/src/lib/status'

const job = (action: 'publish' | 'unpublish', runAt: string, state = 'pending') =>
  ({ id: 1, action, runAt, state, error: null, doc: 4 }) as never

describe('a status as people read it (#303)', () => {
  it('tells a draft from a scheduled one, with the next publish', () => {
    expect(shownStatus(false, false)).toEqual({ kind: 'draft' })
    expect(
      shownStatus(false, false, [
        job('publish', '2026-11-05T03:00:00.000Z'),
        job('publish', '2026-11-01T02:00:00.000Z'),
      ]),
    ).toEqual({ kind: 'scheduled', at: '2026-11-01T02:00:00.000Z' })
    // A job that ran or failed is not pending.
    expect(
      shownStatus(false, false, [job('publish', '2026-11-01T02:00:00.000Z', 'failed')]),
    ).toEqual({
      kind: 'draft',
    })
  })

  it('says what is pending on a published one', () => {
    expect(shownStatus(true, false)).toEqual({ kind: 'published', changed: false })
    // A publish scheduled on a live document: its changes go live then.
    expect(shownStatus(true, true, [job('publish', '2026-10-31T02:00:00.000Z')])).toEqual({
      kind: 'published',
      changed: true,
      publishAt: '2026-10-31T02:00:00.000Z',
    })
    expect(shownStatus(true, true, [job('unpublish', '2026-11-05T03:00:00.000Z')])).toEqual({
      kind: 'published',
      changed: true,
      unpublishAt: '2026-11-05T03:00:00.000Z',
    })
  })
})
