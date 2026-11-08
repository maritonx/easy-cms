import { describe, expect, it } from 'vitest'
import { NOTIFY_EVENTS, noticeOf } from '../src/messages.js'

describe('notices', () => {
  it('tells about a social post that failed (#312)', () => {
    expect(NOTIFY_EVENTS).toContain('social.failed')
    const notice = noticeOf(
      {
        event: 'social.failed',
        data: {
          post: { id: 3, title: 'Launch day' },
          channel: 'social-webhook:Make',
          error: 'HTTP 500',
        },
        about: { collection: 'social-posts', id: 3 },
      },
      'en',
    )
    expect(notice).toEqual({
      title: 'A social post failed',
      lines: ['Post: Launch day', 'Channel: social-webhook:Make', 'Error: HTTP 500'],
      path: '/collections/social-posts/3',
      open: 'Open in the admin',
    })
    expect(noticeOf({ event: 'social.failed', data: {} }, 'th')?.title).toBe('โพสต์โซเชียลไม่สำเร็จ')
  })
})
