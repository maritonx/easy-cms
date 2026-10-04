import {
  type AdminEmail,
  createRestHandler,
  defineConfig,
  type EmailAdapter,
  type EmailMessage,
  type RestHandler,
} from '@easy-cms/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, open, SECRET } from './helpers.js'

/** Settings → Email: what the adapter tells, a connection check and a test email (admins). */
let serverUp = false
const sent: EmailMessage[] = []
const adapter: EmailAdapter = {
  name: 'test-smtp',
  from: 'Site <site@x.test>',
  async send(message) {
    if (!serverUp) throw new Error('535 Authentication failed')
    sent.push(message)
  },
  describe: () => [
    { key: 'host', value: 'smtp.x.test', source: 'SMTP_HOST' },
    { key: 'password', value: 'set', source: 'SMTP_PASSWORD' },
  ],
  async verify() {
    if (!serverUp) throw new Error('connect ECONNREFUSED 127.0.0.1:587')
  },
}

type CMS = Awaited<ReturnType<typeof open>>
let cms: CMS
let handle: RestHandler
let admin: Record<string, string>
let editor: Record<string, string>
beforeAll(async () => {
  cms = await open(
    defineConfig({
      secret: SECRET,
      db: db(),
      email: adapter,
      admin: { brand: { name: 'My Site' } },
      collections: [],
    }),
  )
  handle = createRestHandler(cms)
  await cms.create('users', { email: 'admin@x.co', password: 'password123', role: 'admin' })
  await cms.create('users', { email: 'editor@x.co', password: 'password123', role: 'editor' })
  const bearer = async (email: string) => ({
    authorization: `Bearer ${(await cms.auth.login({ email, password: 'password123' })).token}`,
    'content-type': 'application/json',
  })
  admin = await bearer('admin@x.co')
  editor = await bearer('editor@x.co')
})
afterAll(() => cms.destroy())

const call = async (path: string, method = 'GET', body?: unknown, headers = admin) => {
  const response = await handle(
    new Request(`http://cms.test/api/cms/admin/email${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  )
  return { status: response.status, json: await response.json() }
}

describe('email settings in the admin', () => {
  it('shows the adapter and what it tells about itself', async () => {
    const { status, json } = await call('')
    expect(status).toBe(200)
    expect(json as AdminEmail).toEqual({
      configured: true,
      name: 'test-smtp',
      from: 'Site <site@x.test>',
      settings: [
        { key: 'host', value: 'smtp.x.test', source: 'SMTP_HOST' },
        { key: 'password', value: 'set', source: 'SMTP_PASSWORD' },
      ],
      canVerify: true,
    })
  })

  it('checks the connection and sends a test email, with the server’s answer', async () => {
    expect((await call('/verify', 'POST')).json).toEqual({
      ok: false,
      error: 'connect ECONNREFUSED 127.0.0.1:587',
    })
    expect((await call('/test', 'POST', {})).json).toEqual({
      ok: false,
      error: '535 Authentication failed',
    })
    serverUp = true
    expect((await call('/verify', 'POST')).json).toEqual({ ok: true })
    // To the admin by default; in the admin's language; not through the queue.
    expect((await call('/test', 'POST', { locale: 'th' })).json).toEqual({ ok: true })
    expect(sent.at(-1)).toMatchObject({ to: 'admin@x.co', subject: 'อีเมลทดสอบจาก My Site' })
    expect((await call('/test', 'POST', { to: 'other@x.co', locale: 'en' })).json).toEqual({
      ok: true,
    })
    expect(sent.at(-1)).toMatchObject({ to: 'other@x.co', subject: 'Test email from My Site' })
  })

  it('checks the address and limits test emails', async () => {
    expect((await call('/test', 'POST', { to: 'not an email' })).status).toBe(400)
    // Three tries above (failed ones count too): two more in ten minutes, then no more.
    expect((await call('/test', 'POST', {})).status).toBe(200)
    expect((await call('/test', 'POST', {})).status).toBe(200)
    expect((await call('/test', 'POST', {})).status).toBe(429)
  })

  it('is for admins only', async () => {
    expect((await call('', 'GET', undefined, editor)).status).toBe(403)
    expect((await call('/test', 'POST', {}, editor)).status).toBe(403)
  })

  it('says when email is not set up', async () => {
    const plain = await open(defineConfig({ secret: SECRET, db: db(), collections: [] }))
    try {
      await plain.create('users', { email: 'a@x.co', password: 'password123', role: 'admin' })
      const { token } = await plain.auth.login({ email: 'a@x.co', password: 'password123' })
      const response = await createRestHandler(plain)(
        new Request('http://cms.test/api/cms/admin/email', {
          headers: { authorization: `Bearer ${token}` },
        }),
      )
      expect(await response.json()).toEqual({
        configured: false,
        name: null,
        from: null,
        settings: [],
        canVerify: false,
      })
    } finally {
      await plain.destroy()
    }
  })
})
