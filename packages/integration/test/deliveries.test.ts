import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  type AdminDeliveries,
  consoleEmail,
  createRestHandler,
  defineConfig,
  type EmailAdapter,
  type RestHandler,
} from '@easy-cms/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, open, SECRET } from './helpers.js'

/** Saved webhook deliveries and emails in the admin: list, retry now, delete (admins only). */
let server: Server
let hookUrl: string
let receiverUp = false
const received: { delivery: string; signature: string }[] = []
beforeAll(async () => {
  server = createServer((req, res) => {
    received.push({
      delivery: String(req.headers['x-easy-cms-delivery']),
      signature: String(req.headers['x-easy-cms-signature']),
    })
    res.writeHead(receiverUp ? 200 : 503)
    res.end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  hookUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`
})
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

let mailUp = false
const mail = consoleEmail({ log: () => {} })
const flaky: EmailAdapter = {
  name: 'flaky',
  from: 'Site <site@x.test>',
  async send(message) {
    if (!mailUp) throw new Error('SMTP server is down')
    await mail.send(message)
  },
}

type CMS = Awaited<ReturnType<typeof open>>
let cms: CMS
let handle: RestHandler
let admin: Record<string, string>
let editor: Record<string, string>

const now = () => new Date().toISOString()
async function setup() {
  cms = await open(
    defineConfig({
      secret: SECRET,
      db: db(),
      email: flaky,
      webhooks: [{ url: hookUrl, secret: 'hook-secret', collections: ['posts'] }],
      collections: [{ slug: 'posts', fields: [{ name: 'title', type: 'text' }] }],
    }),
  )
  handle = createRestHandler(cms)
  await cms.create('users', { email: 'admin@x.co', password: 'password123', role: 'admin' })
  await cms.create('users', { email: 'editor@x.co', password: 'password123', role: 'editor' })
  const bearer = async (email: string) => ({
    authorization: `Bearer ${(await cms.auth.login({ email, password: 'password123' })).token}`,
  })
  admin = await bearer('admin@x.co')
  editor = await bearer('editor@x.co')
}

const call = async (path: string, method = 'GET', headers = admin) => {
  const response = await handle(
    new Request(`http://cms.test/api/cms/admin/deliveries${path}`, { method, headers }),
  )
  const text = await response.text()
  return { status: response.status, json: text ? JSON.parse(text) : undefined }
}

const failedWebhook = (title: string) =>
  cms.db.create({
    collection: 'webhook-deliveries',
    data: {
      url: hookUrl,
      event: 'create',
      body: JSON.stringify({ event: 'create', collection: 'posts', id: 7, doc: { title } }),
      delivery: crypto.randomUUID(),
      attempts: 8,
      nextAttemptAt: now(),
      state: 'failed',
      error: 'status 503',
      createdAt: now(),
      updatedAt: now(),
    },
  })
const failedEmail = (subject: string) =>
  cms.db.create({
    collection: 'email-deliveries',
    data: {
      message: JSON.stringify({ to: 'ann@x.co', subject, text: 'private text' }),
      attempts: 7,
      nextAttemptAt: now(),
      state: 'failed',
      error: 'SMTP server is down',
      createdAt: now(),
      updatedAt: now(),
    },
  })

describe('deliveries in the admin', () => {
  beforeAll(setup)
  afterAll(() => cms.destroy())

  it('lists failed webhook deliveries with what changed and the body', async () => {
    await failedWebhook('First')
    await failedWebhook('Second')
    const { status, json } = await call('?kind=webhook&state=failed')
    expect(status).toBe(200)
    const list = json as AdminDeliveries
    expect(list.counts).toEqual({ failed: 2, pending: 0 })
    expect(list.docs[0]).toMatchObject({
      kind: 'webhook',
      state: 'failed',
      url: hookUrl,
      event: 'create',
      collection: 'posts',
      doc: 7,
      attempts: 8,
      error: 'status 503',
    })
    expect(list.docs[0]?.kind === 'webhook' && JSON.parse(list.docs[0].body).doc.title).toBe(
      'Second',
    )
  })

  it('retries one now: kept with the new error while the receiver is down, gone once sent', async () => {
    const [first] = (await call('?kind=webhook')).json.docs as { id: number }[]
    const down = await call(`/webhook/${first?.id}/retry`, 'POST')
    expect(down.json).toEqual({ ok: false, error: 'status 503' })
    expect((await call('?kind=webhook')).json.docs[0]).toMatchObject({ attempts: 9 })
    // Same delivery id and a signature, as on the first attempt.
    expect(received.at(-1)?.signature).toMatch(/^sha256=/)

    receiverUp = true
    expect((await call(`/webhook/${first?.id}/retry`, 'POST')).json).toEqual({ ok: true })
    expect((await call('?kind=webhook')).json.counts.failed).toBe(1)
  })

  it('retries every failed one, and deletes', async () => {
    await failedWebhook('Third')
    expect((await call('/webhook/retry', 'POST')).json).toEqual({ sent: 2, failed: 0 })
    receiverUp = false
    const kept = await failedWebhook('Fourth')
    expect((await call(`/webhook/${kept.id}`, 'DELETE')).json).toEqual({ deleted: 1 })
    expect((await call(`/webhook/${kept.id}`, 'DELETE')).status).toBe(404)
    await failedWebhook('Fifth')
    await failedWebhook('Sixth')
    expect((await call('/webhook', 'DELETE')).json).toEqual({ deleted: 2 })
  })

  it('shows emails without their content, and retries them', async () => {
    const saved = await failedEmail('Welcome')
    const list = (await call('?kind=email')).json as AdminDeliveries
    expect(list.docs[0]).toMatchObject({ kind: 'email', to: ['ann@x.co'], subject: 'Welcome' })
    expect(JSON.stringify(list.docs[0])).not.toContain('private text')
    expect((await call(`/email/${saved.id}/retry`, 'POST')).json).toEqual({
      ok: false,
      error: 'SMTP server is down',
    })
    mailUp = true
    expect((await call(`/email/${saved.id}/retry`, 'POST')).json).toEqual({ ok: true })
    expect(mail.sent.at(-1)?.subject).toBe('Welcome')
  })

  it('removes failures older than 30 days when jobs run', async () => {
    const old = await failedWebhook('Old')
    await cms.db.update({
      collection: 'webhook-deliveries',
      id: old.id,
      data: {
        ...old,
        id: undefined,
        updatedAt: new Date(Date.now() - 31 * 86_400_000).toISOString(),
      } as never,
    })
    const recent = await failedWebhook('Recent')
    await cms.runJobs()
    const ids = ((await call('?kind=webhook')).json.docs as { id: number }[]).map((d) => d.id)
    expect(ids).toEqual([recent.id])
  })

  it('is for admins only', async () => {
    expect((await call('?kind=webhook', 'GET', editor)).status).toBe(403)
    expect((await call('/webhook/retry', 'POST', editor)).status).toBe(403)
    expect((await call('?kind=webhook', 'GET', {})).status).toBe(401)
  })
})
