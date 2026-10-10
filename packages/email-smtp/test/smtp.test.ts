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

  it('describes its settings and where they come from, never the password', () => {
    const saved = { ...process.env }
    process.env.SMTP_HOST = 'smtp.env.example'
    process.env.SMTP_USER = 'mailer'
    process.env.SMTP_PASSWORD = 'secret-password'
    delete process.env.SMTP_PORT
    delete process.env.SMTP_FROM
    try {
      const settings = smtp({ from: 'Site <site@example.org>' }).describe?.()
      expect(settings).toEqual([
        { key: 'host', value: 'smtp.env.example', source: 'SMTP_HOST' },
        { key: 'port', value: '587', source: 'default' },
        { key: 'secure', value: 'false', source: 'port 465 or not' },
        { key: 'requireTLS', value: 'true', source: 'port 587 or not' },
        { key: 'user', value: 'mailer', source: 'SMTP_USER' },
        { key: 'password', value: 'set', source: 'SMTP_PASSWORD' },
        { key: 'from', value: 'Site <site@example.org>', source: 'smtp({ from })' },
      ])
      expect(JSON.stringify(settings)).not.toContain('secret-password')
    } finally {
      process.env = saved
    }
  })

  it('checks the connection without sending', async () => {
    // Nothing listens on port 1.
    const email = smtp({ host: '127.0.0.1', port: 1, transport: { connectionTimeout: 2000 } })
    await expect(email.verify?.()).rejects.toThrow(/ECONNREFUSED|connect/)
  })
})
