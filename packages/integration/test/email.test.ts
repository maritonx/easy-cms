import { consoleEmail, createRestHandler, defineConfig, type EmailAdapter } from '@easy-cms/core'
import { describe, expect, it } from 'vitest'
import { db, open, SECRET } from './helpers.js'

const base = (email?: EmailAdapter) =>
  defineConfig({
    secret: SECRET,
    db: db(),
    ...(email ? { email } : {}),
    collections: [{ slug: 'notes', fields: [{ name: 'text', type: 'text' }] }],
  })

describe('email', () => {
  it('sends through the adapter, with its sender', async () => {
    const lines: string[] = []
    const email = consoleEmail({ from: 'Site <site@x.test>', log: (t) => lines.push(t) })
    const cms = await open(base(email))
    await cms.sendEmail({ to: ['a@x.test', 'b@x.test'], subject: 'Hello', text: 'Body' })
    await cms.flushEmails()
    expect(email.sent).toEqual([
      { to: ['a@x.test', 'b@x.test'], subject: 'Hello', text: 'Body', from: 'Site <site@x.test>' },
    ])
    expect(lines[0]).toContain('Subject: Hello')
    await cms.destroy()
  })

  it('keeps failed emails and retries them from the queue', async () => {
    let fail = true
    const sent: string[] = []
    const flaky: EmailAdapter = {
      from: 'site@x.test',
      async send(message) {
        if (fail) throw new Error('SMTP down')
        sent.push(message.subject)
      },
    }
    const cms = await open(base(flaky))
    await cms.sendEmail({ to: 'a@x.test', subject: 'Contact', text: 'Hi' })
    await cms.flushEmails()
    expect(sent).toEqual([])
    // Not due yet: the first retry is a minute later.
    expect((await cms.runJobs()).emails).toEqual({ sent: 0, failed: 0 })
    fail = false
    const later = new Date(Date.now() + 2 * 60_000)
    expect((await cms.runJobs(later)).emails).toEqual({ sent: 1, failed: 0 })
    expect(sent).toEqual(['Contact'])
    expect((await cms.runJobs(new Date(Date.now() + 3_600_000))).emails.sent).toBe(0)
    await cms.destroy()
  })

  it('skips emails without an adapter, and adds no queue', async () => {
    const cms = await open(base())
    await expect(
      cms.sendEmail({ to: 'a@x.test', subject: 'Lost', text: '' }),
    ).resolves.toBeUndefined()
    expect(cms.config.collections.some((c) => c.slug === 'email-deliveries')).toBe(false)
    await cms.destroy()
  })
})

describe('CSRF and CORS', () => {
  const config = defineConfig({
    secret: SECRET,
    db: db(),
    cors: ['http://frontend.test'],
    collections: [
      { slug: 'notes', access: { create: () => true }, fields: [{ name: 'text', type: 'text' }] },
    ],
  })

  it('lets cors origins write without a session cookie, but not with one', async () => {
    const cms = await open(config)
    const handle = createRestHandler(cms)
    const post = (origin: string, cookie?: string) =>
      handle(
        new Request('http://cms.test/api/cms/notes', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin,
            ...(cookie ? { cookie } : {}),
          },
          body: JSON.stringify({ text: 'hi' }),
        }),
      )
    expect((await post('http://frontend.test')).status).toBe(201)
    expect((await post('http://evil.test')).status).toBe(403)
    await cms.create('users', { email: 'a@x.co', password: 'password123', role: 'admin' })
    const session = await cms.auth.login({ email: 'a@x.co', password: 'password123' })
    const withCookie = await post('http://frontend.test', `ecms-session=${session.token}`)
    expect(withCookie.status).toBe(403)
    await cms.destroy()
  })
})
