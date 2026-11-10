import { createHmac } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  consoleEmail,
  createEasyCMS,
  createRestHandler,
  defineConfig,
  type EasyCMS,
  silentLogger,
} from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { brevo, emailPlugin, postmark, resend } from '../src/index.js'

// Resend's, Postmark's and Brevo's APIs, as far as the providers use them (#404).
type Hit = { method: string; path: string; headers: Record<string, unknown>; body: any }
const hits: Hit[] = []
let failSend = false
let server: Server
let base = ''

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString()
      const path = new URL(req.url ?? '/', 'http://x').pathname
      hits.push({
        method: req.method ?? 'GET',
        path,
        headers: req.headers,
        body: text ? JSON.parse(text) : null,
      })
      const send = (status: number, data: unknown) =>
        res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(data))
      const n = hits.length
      if (path === '/resend/domains')
        return req.headers.authorization === 'Bearer re_good'
          ? send(200, { data: [{ name: 'example.com' }] })
          : send(401, { name: 'validation_error', message: 'API key is invalid' })
      if (path === '/resend/emails')
        return failSend
          ? send(403, { message: 'The example.com domain is not verified' })
          : send(200, { id: `re-${n}` })
      if (path === '/postmark/email') return send(200, { ErrorCode: 0, MessageID: `pm-${n}` })
      if (path === '/postmark/server') return send(200, { Name: 'My server' })
      if (path === '/brevo/smtp/email') return send(201, { messageId: `<br-${n}@relay>` })
      if (path === '/brevo/account') return send(200, { companyName: 'My company' })
      send(404, { message: `Unknown ${path}` })
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  Object.assign(process.env, {
    RESEND_API_URL: `${base}/resend`,
    POSTMARK_API_URL: `${base}/postmark`,
    BREVO_API_URL: `${base}/brevo`,
  })
})
afterAll(() => {
  for (const key of ['RESEND_API_URL', 'POSTMARK_API_URL', 'BREVO_API_URL']) delete process.env[key]
  server.close()
})

const dirs: string[] = []
const opened: { destroy(): Promise<void> }[] = []
afterEach(async () => {
  // Closed first: Windows won't delete a folder whose SQLite file is open.
  for (const cms of opened.splice(0)) await cms.destroy().catch(() => {})
  for (const dir of dirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    } catch {
      // Windows may still hold the file; the OS cleans temp.
    }
  }
})
beforeEach(() => {
  hits.length = 0
  failSend = false
})

const SECRET = `whsec_${Buffer.from('signing-secret-for-tests').toString('base64')}`
const sign = (body: string, secret = SECRET, at = Math.floor(Date.now() / 1000)) => {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const signature = createHmac('sha256', key).update(`msg_1.${at}.${body}`).digest('base64')
  return { 'svix-id': 'msg_1', 'svix-timestamp': String(at), 'svix-signature': `v1,${signature}` }
}

async function open(options: { code?: boolean } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'easy-cms-email-'))
  dirs.push(cwd)
  const code = consoleEmail({ from: 'Code <code@example.com>', log: () => {} })
  const events: { event: string; data: Record<string, unknown> }[] = []
  const cms = await createEasyCMS(
    defineConfig({
      secret: 'x'.repeat(32),
      serverURL: 'http://cms.test',
      db: sqlite({ url: 'file:./cms.db' }),
      collections: [{ slug: 'posts', fields: [{ name: 'title', type: 'text' }] }],
      ...(options.code ? { email: code } : {}),
      plugins: [emailPlugin()],
      listeners: [
        {
          events: ['email.bounced', 'email.complained'],
          handler: (message) => {
            events.push({ event: message.event, data: message.data as Record<string, unknown> })
          },
        },
      ],
    }),
    { cwd, schema: 'push', logger: silentLogger, scheduler: false },
  )
  opened.push(cms)
  await cms.create('users', { email: 'admin@x.co', password: 'password123', role: 'admin' })
  const { token } = await cms.auth.login({ email: 'admin@x.co', password: 'password123' })
  const handle = createRestHandler(cms)
  const call = async (
    path: string,
    method = 'GET',
    body?: unknown,
    headers: Record<string, string> = { authorization: `Bearer ${token}` },
  ) => {
    const raw = typeof body === 'string' ? body : body ? JSON.stringify(body) : undefined
    const res = await handle(
      new Request(`http://cms.test/api/cms${path}`, {
        method,
        headers: { ...headers, ...(raw ? { 'content-type': 'application/json' } : {}) },
        ...(raw ? { body: raw } : {}),
      }),
    )
    const text = await res.text()
    let parsed: Record<string, any> = {}
    try {
      parsed = text ? JSON.parse(text) : {}
    } catch {}
    return { status: res.status, body: parsed }
  }
  const connect = async (integration: string, values: Record<string, string>, name = 'Main') => {
    const res = await call(`/admin/integrations/${integration}/connections`, 'POST', {
      name,
      values,
    })
    return res
  }
  const card = async (integration: string) =>
    ((await call('/admin/integrations')).body.integrations as any[]).find(
      (i) => i.id === integration,
    )
  const log = async (query = '') => (await call(`/admin/email/log${query}`)).body.docs as any[]
  return { cms, call, connect, card, log, code, events }
}

describe('choosing a provider in the admin', () => {
  it('sends with a connection after a test email to the admin, then follows its webhook', async () => {
    const { cms, call, connect, card, log, events } = await open()
    // No `email` in the config: nothing sends until an admin chooses.
    expect((await call('/admin/email')).body).toMatchObject({
      configured: false,
      providers: { active: null, code: null },
      suppressions: true,
    })
    // The key is checked when connecting.
    expect(
      (await connect('resend', { apiKey: 're_bad', from: 'Site <hi@example.com>' })).status,
    ).toBe(400)
    const connected = await connect('resend', {
      apiKey: 're_good',
      webhookSecret: SECRET,
      from: 'Site <hi@example.com>',
    })
    expect(connected.status).toBe(201)
    const id = connected.body.id
    // Not verified at Resend: the test email fails, and nothing changes.
    failSend = true
    const refused = await call('/admin/email/provider', 'PUT', {
      integration: 'resend',
      connection: id,
    })
    expect(refused.status).toBe(400)
    expect(refused.body.errors[0].message).toMatch(/not verified/)
    expect((await call('/admin/email')).body.providers.active).toBeNull()

    failSend = false
    const used = await call('/admin/email/provider', 'PUT', {
      integration: 'resend',
      connection: id,
    })
    expect(used.status).toBe(200)
    expect(used.body).toMatchObject({
      active: { integration: 'resend', connection: id },
      sentTo: 'admin@x.co',
    })
    const test = hits.find((h) => h.path === '/resend/emails')
    expect(test?.body).toMatchObject({ from: 'Site <hi@example.com>', to: ['admin@x.co'] })
    expect(test?.headers.authorization).toBe('Bearer re_good')
    expect((await call('/admin/email')).body).toMatchObject({
      configured: true,
      name: 'resend',
      from: 'Site <hi@example.com>',
      providers: { active: { integration: 'resend', label: 'Resend · Main' } },
    })
    // It can't be removed or turned off while it sends.
    expect((await call(`/admin/integrations/resend/connections/${id}`, 'DELETE')).status).toBe(400)
    expect((await call('/admin/integrations/resend', 'PUT', { enabled: false })).status).toBe(400)

    // The site's email goes through it, the log keeping Resend's id.
    hits.length = 0
    await cms.sendEmail({ to: 'Reader <reader@x.co>', subject: 'Hello', text: 'Hi', tag: 'news' })
    await cms.flushEmails()
    const sent = hits.find((h) => h.path === '/resend/emails')
    expect(sent?.body).toMatchObject({ to: ['Reader <reader@x.co>'], subject: 'Hello' })
    const [entry] = await log()
    expect(entry).toMatchObject({ to: 'Reader <reader@x.co>', state: 'sent', adapter: 'resend' })
    expect(entry.providerId).toMatch(/^re-\d+$/)

    // Resend posts to the connection's webhook, signed.
    const resendCard = await card('resend')
    expect(resendCard.email).toMatchObject({ webhook: true })
    const url = new URL(resendCard.connections[0].webhookUrl)
    expect(resendCard.connections[0].active).toBe(true)
    const path = url.pathname.replace('/api/cms', '')
    const delivered = JSON.stringify({
      type: 'email.delivered',
      created_at: '2026-11-10T03:00:00.000Z',
      data: { email_id: entry.providerId, to: ['reader@x.co'] },
    })
    expect((await call(path, 'POST', delivered, sign(delivered))).status).toBe(200)
    expect((await log())[0]).toMatchObject({ delivery: 'delivered' })
    // Not Resend's: a wrong token, a wrong signature.
    expect((await call(`${path}x`, 'POST', delivered, sign(delivered))).status).toBe(403)
    expect(
      (
        await call(
          path,
          'POST',
          delivered,
          sign(delivered, `whsec_${Buffer.from('other').toString('base64')}`),
        )
      ).status,
    ).toBe(400)

    const bounced = JSON.stringify({
      type: 'email.bounced',
      data: {
        email_id: entry.providerId,
        to: ['reader@x.co'],
        bounce: { type: 'Permanent', message: 'Mailbox does not exist' },
      },
    })
    expect((await call(path, 'POST', bounced, sign(bounced))).body).toEqual({
      received: 1,
      recorded: 1,
    })
    expect((await log())[0]).toMatchObject({ delivery: 'bounced', error: 'Mailbox does not exist' })
    expect(events).toEqual([
      {
        event: 'email.bounced',
        data: {
          to: 'reader@x.co',
          subject: 'Hello',
          reason: 'Mailbox does not exist',
          integration: 'resend',
        },
      },
    ])
    const list = (await call('/admin/email/suppressions')).body
    expect(list.docs).toMatchObject([
      { address: 'reader@x.co', reason: 'bounced', source: 'resend' },
    ])

    // The address gets nothing more, not even a password reset.
    hits.length = 0
    await cms.sendEmail({ to: 'reader@x.co', subject: 'Again', text: 'Hi' })
    await cms.sendEmail({ to: 'reader@x.co', subject: 'Reset', text: 'Hi', tag: 'password-reset' })
    await cms.flushEmails()
    expect(hits.filter((h) => h.path === '/resend/emails')).toHaveLength(0)
    expect((await log('?state=skipped')).map((e) => e.subject).sort()).toEqual(['Again', 'Reset'])

    // An admin takes it off the list; it gets email again.
    expect((await call(`/admin/email/suppressions/${list.docs[0].id}`, 'DELETE')).status).toBe(200)
    await cms.sendEmail({ to: 'reader@x.co', subject: 'Back', text: 'Hi' })
    await cms.flushEmails()
    expect(hits.filter((h) => h.path === '/resend/emails')).toHaveLength(1)
  })

  it('keeps the config’s email as the default, and goes back to it', async () => {
    const { cms, call, connect, code } = await open({ code: true })
    expect((await call('/admin/email')).body).toMatchObject({
      configured: true,
      name: 'console',
      providers: { active: null, code: 'console' },
    })
    // The code's isn't among "Set in the code" any more: the email providers show it.
    expect((await call('/admin/integrations')).body.configured).not.toContainEqual(
      expect.objectContaining({ id: 'email' }),
    )
    const { body } = await connect('postmark', { serverToken: 'pm', from: 'hi@example.com' })
    await call('/admin/email/provider', 'PUT', { integration: 'postmark', connection: body.id })
    await cms.sendEmail({ to: 'a@x.co', subject: 'Via Postmark', text: 'Hi' })
    await cms.flushEmails()
    expect(code.sent.map((m) => m.subject)).toEqual([])
    expect(hits.filter((h) => h.path === '/postmark/email').at(-1)?.body).toMatchObject({
      From: 'hi@example.com',
      To: 'a@x.co',
      Subject: 'Via Postmark',
      MessageStream: 'outbound',
    })
    // Back to the code's.
    expect((await call('/admin/email/provider', 'PUT', {})).body).toEqual({ active: null })
    await cms.sendEmail({ to: 'a@x.co', subject: 'Via the code', text: 'Hi' })
    await cms.flushEmails()
    expect(code.sent.map((m) => m.subject)).toEqual(['Via the code'])
    // Now it can go.
    expect(
      (await call(`/admin/integrations/postmark/connections/${body.id}`, 'DELETE')).status,
    ).toBe(200)
  })

  it('lets only admins of the whole site choose, and keeps who did', async () => {
    const { cms, call } = await open({ code: true })
    await cms.create('users', { email: 'ed@x.co', password: 'password123', role: 'editor' })
    const { token } = await cms.auth.login({ email: 'ed@x.co', password: 'password123' })
    const as = { authorization: `Bearer ${token}` }
    expect((await call('/admin/email/provider', 'PUT', {}, as)).status).toBe(403)
    expect((await call('/admin/email/suppressions', 'GET', undefined, as)).status).toBe(403)
  })
})

describe('the suppression list', () => {
  it('is kept by admins too, and spares the emails people ask for from a spam report', async () => {
    const { cms, call, log } = await open({ code: true })
    expect((await call('/admin/email/suppressions', 'POST', { address: 'nope' })).status).toBe(400)
    expect(
      (await call('/admin/email/suppressions', 'POST', { address: 'Some One <Some@X.co>' })).body,
    ).toEqual({ address: 'some@x.co' })
    await cms.emailProviders.suppress('spam@x.co', 'complained', null, 'resend')
    await cms.sendEmail({ to: 'some@x.co', cc: 'ok@x.co', subject: 'Manual', text: 'Hi' })
    await cms.sendEmail({ to: ['spam@x.co', 'ok@x.co'], subject: 'Some left', text: 'Hi' })
    await cms.sendEmail({ to: 'spam@x.co', subject: 'Reset', text: 'Hi', tag: 'password-reset' })
    await cms.flushEmails()
    const entries = await log()
    const by = (subject: string) => entries.find((e) => e.subject === subject)
    expect(by('Manual')).toMatchObject({
      state: 'skipped',
      error: 'some@x.co is on the suppression list (manual)',
    })
    expect(by('Some left')).toMatchObject({ state: 'sent' })
    expect(by('Reset')).toMatchObject({ state: 'sent' })
    expect((await call('/admin/email/suppressions?q=spam')).body.docs).toHaveLength(1)
  })
})

describe('providers', () => {
  const message = {
    from: 'Site <hi@example.com>',
    to: ['A <a@x.co>', 'b@x.co'],
    cc: 'c@x.co',
    replyTo: 'r@x.co',
    subject: 'S',
    html: '<p>H</p>',
    text: 'T',
  }
  const cms = {} as EasyCMS

  it('Brevo sends people as objects, and reads its events', async () => {
    const adapter = brevo.email?.create({ apiKey: 'k', from: 'Site <hi@example.com>' }, { cms })
    expect(await adapter?.send(message)).toEqual({ id: expect.stringMatching(/^<br-\d+@relay>$/) })
    const hit = hits.find((h) => h.path === '/brevo/smtp/email')
    expect(hit?.headers['api-key']).toBe('k')
    expect(hit?.body).toEqual({
      sender: { email: 'hi@example.com', name: 'Site' },
      to: [{ email: 'a@x.co', name: 'A' }, { email: 'b@x.co' }],
      cc: [{ email: 'c@x.co' }],
      replyTo: { email: 'r@x.co' },
      subject: 'S',
      htmlContent: '<p>H</p>',
      textContent: 'T',
    })
    const events = brevo.email?.events
    const read = (body: unknown) =>
      events?.({ headers: new Headers(), body: JSON.stringify(body) }, {})
    expect(
      await read({ event: 'hard_bounce', email: 'a@x.co', 'message-id': '<m>', reason: 'no' }),
    ).toEqual([{ id: '<m>', type: 'bounced', address: 'a@x.co', permanent: true, detail: 'no' }])
    expect(await read({ event: 'soft_bounce', email: 'a@x.co', 'message-id': '<m>' })).toEqual([
      { id: '<m>', type: 'bounced', address: 'a@x.co', permanent: false },
    ])
    expect(await read({ event: 'opened', email: 'a@x.co', 'message-id': '<m>' })).toEqual([])
  })

  it('Postmark reads deliveries, bounces and spam complaints', async () => {
    const events = postmark.email?.events
    const read = (body: unknown) =>
      events?.({ headers: new Headers(), body: JSON.stringify(body) }, {})
    expect(await read({ RecordType: 'Delivery', MessageID: 'm', Recipient: 'a@x.co' })).toEqual([
      { id: 'm', type: 'delivered', address: 'a@x.co' },
    ])
    expect(
      await read({
        RecordType: 'Bounce',
        MessageID: 'm',
        Email: 'a@x.co',
        Type: 'SoftBounce',
        Inactive: false,
      }),
    ).toEqual([{ id: 'm', type: 'bounced', address: 'a@x.co', permanent: false }])
    expect(await read({ RecordType: 'SpamComplaint', MessageID: 'm', Email: 'a@x.co' })).toEqual([
      { id: 'm', type: 'complained', address: 'a@x.co' },
    ])
  })

  it('Resend refuses unsigned and old requests when it has a signing secret', async () => {
    const events = resend.email?.events
    const body = JSON.stringify({
      type: 'email.delivered',
      data: { email_id: 'm', to: ['a@x.co'] },
    })
    const values = { webhookSecret: SECRET }
    await expect(async () => events?.({ headers: new Headers(), body }, values)).rejects.toThrow(
      /not signed/,
    )
    const old = sign(body, SECRET, Math.floor(Date.now() / 1000) - 3600)
    await expect(async () => events?.({ headers: new Headers(old), body }, values)).rejects.toThrow(
      /too old/,
    )
    expect(await events?.({ headers: new Headers(sign(body)), body }, values)).toEqual([
      { id: 'm', type: 'delivered', address: 'a@x.co' },
    ])
    // Without a secret, the URL's token is the check.
    expect(await events?.({ headers: new Headers(), body }, {})).toHaveLength(1)
  })

  it('refuses an integration that sends no email', () => {
    expect(() =>
      emailPlugin({ providers: [{ id: 'x', label: 'X', category: 'email', kind: 'fields' }] }),
    ).toThrow(/doesn't send email/)
  })
})
