import { consoleEmail, createRestHandler, defineConfig, type RestHandler } from '@easy-cms/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, open, SECRET } from './helpers.js'

/** Forgot password and invitations: links by email to set a password. */
const mail = consoleEmail({ log: () => {} })
const config = defineConfig({
  secret: SECRET,
  db: db(),
  serverURL: 'https://cms.example.com',
  email: mail,
  admin: { locale: 'th' },
  collections: [],
})

const BASE = 'https://cms.example.com/api/cms'
type CMS = Awaited<ReturnType<typeof open<typeof config>>>
let cms: CMS
let handle: RestHandler
beforeAll(async () => {
  cms = await open(config)
  handle = createRestHandler(cms, { getClientIp: (r) => r.headers.get('x-test-ip') ?? undefined })
  await cms.create('users', {
    email: 'admin@example.com',
    password: 'admin-password',
    role: 'admin',
  })
  await cms.create('users', { email: 'ann@example.com', password: 'old-password', role: 'editor' })
})
afterAll(() => cms.destroy())

async function call(
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
) {
  const response = await handle(
    new Request(`${BASE}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        'content-type': 'application/json',
        origin: 'https://cms.example.com',
        ...init.headers,
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    }),
  )
  const text = await response.text()
  return {
    status: response.status,
    headers: response.headers,
    json: text ? JSON.parse(text) : undefined,
  }
}

/** The link in the last email to `to`, after the queue sent it. */
async function linkTo(to: string) {
  await cms.flushEmails()
  const email = [...mail.sent].reverse().find((m) => m.to === to)
  const url = email?.text?.match(/https:\/\/\S+/)?.[0]
  return { email, url, token: url ? (new URL(url).searchParams.get('token') ?? '') : '' }
}

describe('forgot password', () => {
  it('is offered when email and serverURL are set', async () => {
    expect((await call('/users/init')).json).toEqual({ hasUsers: true, passwordReset: true })
  })

  it('emails a one-time link that sets a new password and signs out everywhere', async () => {
    const old = await cms.auth.login({ email: 'ann@example.com', password: 'old-password' })
    const sent = mail.sent.length
    const asked = await call('/users/forgot-password', {
      method: 'POST',
      body: { email: ' ANN@example.com ', locale: 'en' },
    })
    expect(asked).toMatchObject({ status: 200, json: { message: expect.any(String) } })
    const { email, url, token } = await linkTo('ann@example.com')
    expect(mail.sent.length).toBe(sent + 1)
    expect(email?.subject).toBe('Reset your password')
    expect(url).toMatch(/^https:\/\/cms\.example\.com\/admin\/reset-password\?token=/)

    expect((await call(`/users/reset-password?token=${encodeURIComponent(token)}`)).json).toEqual({
      email: 'ann@example.com',
      purpose: 'reset',
    })
    const short = await call('/users/reset-password', {
      method: 'POST',
      body: { token, password: 'short' },
    })
    expect(short.status).toBe(400)

    const reset = await call('/users/reset-password', {
      method: 'POST',
      body: { token, password: 'new-password', locale: 'en' },
    })
    expect(reset.status).toBe(200)
    expect(reset.json.user.email).toBe('ann@example.com')
    expect(reset.headers.getSetCookie().some((c) => c.startsWith('ecms-session='))).toBe(true)
    // The old session is gone; the new password works, the old one doesn't.
    expect(await cms.auth.verify(old.token)).toBeNull()
    await expect(
      cms.auth.login({ email: 'ann@example.com', password: 'old-password' }),
    ).rejects.toThrow()
    await cms.auth.login({ email: 'ann@example.com', password: 'new-password' })
    // A "password changed" notice.
    expect((await linkTo('ann@example.com')).email?.subject).toBe('Your password was changed')

    // The link works once.
    const again = await call('/users/reset-password', {
      method: 'POST',
      body: { token, password: 'another-password' },
    })
    expect(again).toMatchObject({
      status: 400,
      json: { errors: [{ field: 'token', message: 'This link has expired or was already used' }] },
    })
  })

  it("doesn't tell whether an email has an account, and limits requests", async () => {
    const sent = mail.sent.length
    const unknown = await call('/users/forgot-password', {
      method: 'POST',
      body: { email: 'nobody@example.com' },
    })
    expect(unknown).toMatchObject({ status: 200, json: { message: expect.any(String) } })
    await cms.flushEmails()
    expect(mail.sent.length).toBe(sent)

    // Three requests per email and IP within the window; later ones are ignored quietly.
    for (let i = 0; i < 5; i++)
      expect(
        (
          await call('/users/forgot-password', {
            method: 'POST',
            body: { email: 'admin@example.com' },
            headers: { 'x-test-ip': '10.0.0.9' },
          })
        ).status,
      ).toBe(200)
    await cms.flushEmails()
    expect(mail.sent.filter((m) => m.to === 'admin@example.com')).toHaveLength(3)
  })

  it('refuses forged and expired tokens', async () => {
    const { token } = await linkTo('admin@example.com')
    const [payload, signature] = token.split('.') as [string, string]
    const forged = `${Buffer.from(JSON.stringify({ u: '1', p: 'reset', e: Date.now() + 1e9 })).toString('base64url')}.${signature}`
    for (const bad of [forged, `${payload}.x`, 'nonsense'])
      expect((await call(`/users/reset-password?token=${encodeURIComponent(bad)}`)).status).toBe(
        400,
      )
  })
})

describe('invitations', () => {
  it('lets an admin invite a user without a password', async () => {
    const admin = await cms.auth.login({ email: 'admin@example.com', password: 'admin-password' })
    const bearer = { authorization: `Bearer ${admin.token}` }
    const bob = await cms.create('users', { email: 'bob@example.com', role: 'editor' })
    const sent = await call(`/users/${bob.id}/password-link`, {
      method: 'POST',
      body: {},
      headers: bearer,
    })
    expect(sent).toMatchObject({ status: 200, json: { sent: 'invite' } })
    const { email, token } = await linkTo('bob@example.com')
    // In the admin's default language (Thai here).
    expect(email?.subject).toBe('คุณได้รับเชิญให้ใช้งานระบบจัดการเนื้อหา')
    expect(
      (await call(`/users/reset-password?token=${encodeURIComponent(token)}`)).json.purpose,
    ).toBe('invite')
    const set = await call('/users/reset-password', {
      method: 'POST',
      body: { token, password: 'bobs-password' },
    })
    expect(set.status).toBe(200)
    await cms.auth.login({ email: 'bob@example.com', password: 'bobs-password' })
    // No "password changed" notice for a first password.
    expect((await linkTo('bob@example.com')).email?.subject).not.toBe('รหัสผ่านของคุณถูกเปลี่ยนแล้ว')

    // Only admins send links.
    const editor = await cms.auth.login({ email: 'bob@example.com', password: 'bobs-password' })
    const denied = await call(`/users/${bob.id}/password-link`, {
      method: 'POST',
      body: {},
      headers: { authorization: `Bearer ${editor.token}` },
    })
    expect(denied.status).toBe(403)
  })
})

describe('without email or serverURL', () => {
  it('is not offered', async () => {
    const plain = await open(defineConfig({ secret: SECRET, db: db(), collections: [] }))
    try {
      expect(plain.auth.canSendPasswordLinks('https://cms.example.com')).toBe(false)
      const production = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'
      try {
        const noUrl = await open(
          defineConfig({ secret: SECRET, db: db(), email: consoleEmail(), collections: [] }),
        )
        // In production the request's Host could be forged: links need serverURL.
        expect(noUrl.auth.canSendPasswordLinks('https://evil.example')).toBe(false)
        await noUrl.destroy()
      } finally {
        process.env.NODE_ENV = production
      }
    } finally {
      await plain.destroy()
    }
  })
})
