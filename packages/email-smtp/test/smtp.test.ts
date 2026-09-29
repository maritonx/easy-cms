import { describe, expect, it } from 'vitest'
import { smtp } from '../src/index.js'

describe('smtp', () => {
  it('sends a message through nodemailer', async () => {
    // nodemailer's JSON transport: builds the message without a server.
    const email = smtp({
      host: 'smtp.example.org',
      from: 'Site <site@example.org>',
      transport: { jsonTransport: true },
    })
    expect(email.from).toBe('Site <site@example.org>')
    await expect(
      email.send({
        from: 'Site <site@example.org>',
        to: ['a@example.org'],
        replyTo: 'b@example.org',
        subject: 'สวัสดี',
        text: 'Hello',
        html: '<p>Hello</p>',
      }),
    ).resolves.toBeUndefined()
  })

  it('needs a host when it sends, not before', async () => {
    const email = smtp({ from: 'x@example.org' })
    const saved = process.env.SMTP_HOST
    delete process.env.SMTP_HOST
    await expect(
      email.send({ from: 'x@example.org', to: 'a@example.org', subject: 's' }),
    ).rejects.toThrow('set `host`')
    if (saved !== undefined) process.env.SMTP_HOST = saved
  })
})
