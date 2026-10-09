import {
  consoleEmail,
  createRestHandler,
  defineConfig,
  isSignedIn,
  type RestHandler,
} from '@easy-cms/core'
import { formToken } from '@easy-cms/core/internal'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, open, SECRET } from './helpers.js'

/** Site members (customers): signing up, confirming the email, and staying out of the admin. */
const mail = consoleEmail({ log: () => {} })
const config = defineConfig({
  secret: SECRET,
  db: db(),
  serverURL: 'https://cms.example.com',
  email: mail,
  admin: { siteURL: 'https://shop.example.com' },
  auth: {
    roles: ['admin', 'editor', 'customer'],
    members: {
      roles: ['customer'],
      signUp: { role: 'customer' },
      pages: { verifyEmail: '/account/verify', resetPassword: '/account/reset' },
    },
  },
  collections: [
    // No access rules: logged-in staff only.
    { slug: 'products', fields: [{ name: 'title', type: 'text' }] },
    {
      slug: 'wishlists',
      fields: [{ name: 'note', type: 'text' }],
      access: { read: isSignedIn, create: isSignedIn },
    },
  ],
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
  return { status: response.status, json: text ? JSON.parse(text) : undefined }
}

/** A sign-up form loaded a few seconds ago. */
const oldToken = () => formToken(SECRET, 'easy-cms-signup', Date.now() - 5_000)

async function linkTo(to: string) {
  await cms.flushEmails()
  const email = [...mail.sent].reverse().find((m) => m.to === to)
  const url = email?.text?.match(/https:\/\/\S+/)?.[0]
  return { email, url, token: url ? (new URL(url).searchParams.get('token') ?? '') : '' }
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` })

describe('signing up', () => {
  it('gives the form a token', async () => {
    const form = await call('/users/signup')
    expect(form.status).toBe(200)
    expect(form.json).toMatchObject({ turnstile: null, verifyEmail: true })
    expect(typeof form.json.token).toBe('string')
  })

  it('refuses forms sent at once, without a token, or with the hidden field filled', async () => {
    const body = { email: 'bot@example.com', password: 'bot-password-1' }
    const fresh = (await call('/users/signup')).json.token
    for (const extra of [{ token: fresh }, {}, { token: oldToken(), website: 'http://x' }])
      expect(
        (
          await call('/users/signup', {
            method: 'POST',
            body: { ...body, ...extra },
            headers: { 'x-test-ip': '10.0.0.9' },
          })
        ).status,
      ).toBe(400)
    expect(await cms.count('users', { where: { email: { equals: 'bot@example.com' } } })).toBe(0)
  })

  it('emails a link to the site that confirms the email and signs in', async () => {
    const signed = await call('/users/signup', {
      method: 'POST',
      body: {
        email: 'Cat@Example.com',
        password: 'cat-password-1',
        name: 'Cat',
        token: oldToken(),
      },
    })
    expect(signed.status).toBe(202)
    expect(signed.json.verify).toBe(true)

    // Not before confirming.
    await expect(
      cms.auth.login({ email: 'cat@example.com', password: 'cat-password-1' }),
    ).rejects.toThrow(/Confirm your email/)

    const { url, token } = await linkTo('cat@example.com')
    expect(url?.startsWith('https://shop.example.com/account/verify?token=')).toBe(true)
    const verified = await call('/users/verify-email', { method: 'POST', body: { token } })
    expect(verified.status).toBe(200)
    expect(verified.json.user).toMatchObject({
      email: 'cat@example.com',
      role: 'customer',
      member: true,
    })
    const session = await cms.auth.login({ email: 'cat@example.com', password: 'cat-password-1' })
    expect(session.user.member).toBe(true)
  })

  it('answers the same for an email that has an account', async () => {
    const sent = mail.sent.length
    const again = await call('/users/signup', {
      method: 'POST',
      body: { email: 'admin@example.com', password: 'whatever-123', token: oldToken() },
    })
    expect(again.status).toBe(202)
    await cms.flushEmails()
    expect(mail.sent.length).toBe(sent)
    // The admin's account is untouched.
    expect(
      (await cms.auth.login({ email: 'admin@example.com', password: 'admin-password' })).user.role,
    ).toBe('admin')
  })

  it('signs in once with a link, not again', async () => {
    await call('/users/signup', {
      method: 'POST',
      body: { email: 'dot@example.com', password: 'dot-password-1', token: oldToken() },
      headers: { 'x-test-ip': '10.0.0.21' },
    })
    const { token } = await linkTo('dot@example.com')
    expect((await call('/users/verify-email', { method: 'POST', body: { token } })).status).toBe(
      200,
    )
    expect((await call('/users/verify-email', { method: 'POST', body: { token } })).status).toBe(
      400,
    )
  })

  it('leaves the password to whoever confirms the email', async () => {
    const signUp = (password: string, ip: string) =>
      call('/users/signup', {
        method: 'POST',
        body: { email: 'eve@example.com', password, token: oldToken() },
        headers: { 'x-test-ip': ip },
      })
    // Someone signs up with another person's email and a password of their own.
    await signUp('mallory-pass-1', '10.0.0.31')
    const first = await linkTo('eve@example.com')
    // The owner signs up too: their password replaces it, and the first link stops working.
    await signUp('eve-own-pass-1', '10.0.0.32')
    const second = await linkTo('eve@example.com')
    expect(second.token).not.toBe(first.token)
    expect(
      (await call('/users/verify-email', { method: 'POST', body: { token: first.token } })).status,
    ).toBe(400)
    expect(
      (await call('/users/verify-email', { method: 'POST', body: { token: second.token } })).status,
    ).toBe(200)
    await expect(
      cms.auth.login({ email: 'eve@example.com', password: 'mallory-pass-1' }),
    ).rejects.toThrow()
    expect(
      (await cms.auth.login({ email: 'eve@example.com', password: 'eve-own-pass-1' })).user.email,
    ).toBe('eve@example.com')
  })

  it("sends members' password links to the site", async () => {
    await call('/users/forgot-password', { method: 'POST', body: { email: 'cat@example.com' } })
    const { url } = await linkTo('cat@example.com')
    expect(url?.startsWith('https://shop.example.com/account/reset?token=')).toBe(true)
  })
})

describe('members', () => {
  it('are not let into the admin, nor count as logged in by default', async () => {
    const { token } = await cms.auth.login({ email: 'cat@example.com', password: 'cat-password-1' })
    expect((await call('/admin/ui/schema', { headers: bearer(token) })).status).toBe(403)
    expect(
      (
        await call('/products', {
          method: 'POST',
          body: { title: 'Free' },
          headers: bearer(token),
        })
      ).status,
    ).toBe(403)
    expect((await call('/products', { headers: bearer(token) })).status).toBe(403)
    // Collections that let them in do.
    expect(
      (await call('/wishlists', { method: 'POST', body: { note: 'hi' }, headers: bearer(token) }))
        .status,
    ).toBe(201)
  })

  it('see only themselves among users and cannot change their role', async () => {
    const { token, user } = await cms.auth.login({
      email: 'cat@example.com',
      password: 'cat-password-1',
    })
    const list = await call('/users', { headers: bearer(token) })
    expect(list.json.docs.map((u: { email: string }) => u.email)).toEqual(['cat@example.com'])
    await call(`/users/${user.id}`, {
      method: 'PATCH',
      body: { role: 'admin', name: 'Cat B' },
      headers: bearer(token),
    })
    const saved = await cms.findById('users', user.id)
    expect(saved).toMatchObject({ role: 'customer', name: 'Cat B' })
  })
})

describe('signing up without confirming the email', () => {
  it('starts a session at once', async () => {
    const quick = await open(
      defineConfig({
        ...config,
        db: db(),
        auth: {
          ...config.auth,
          members: { roles: ['customer'], signUp: { role: 'customer', verifyEmail: false } },
        },
      }),
    )
    try {
      const result = await quick.auth.signup({
        email: 'dan@example.com',
        password: 'dan-password-1',
        token: oldToken(),
      })
      expect(result.verify).toBe(false)
      if (!result.verify) expect(result.user).toMatchObject({ role: 'customer', member: true })
    } finally {
      await quick.destroy()
    }
  })
})

describe('drafts', () => {
  it('are never read by site members, whatever they ask, as for visitors', async () => {
    const withDrafts = await open(
      defineConfig({
        ...config,
        db: db(),
        collections: [
          ...config.collections,
          {
            slug: 'articles',
            drafts: true,
            access: { read: () => true },
            fields: [{ name: 'title', type: 'text' }],
          },
        ],
      }),
    )
    try {
      await withDrafts.create('articles', { title: 'Out', status: 'published' } as never)
      await withDrafts.create('articles', { title: 'Coming', status: 'draft' } as never)
      const member = { id: 1, email: 'carol@example.com', role: 'customer', member: true }
      const staff = { id: 2, email: 'ed@example.com', role: 'editor' }
      const titles = async (user: object) =>
        (
          await withDrafts.find('articles', {
            draft: true,
            overrideAccess: false,
            user: user as never,
          })
        ).docs
          .map((d) => (d as { title: string }).title)
          .sort()
      expect(await titles(member)).toEqual(['Out'])
      expect(await titles(staff)).toEqual(['Coming', 'Out'])
      expect(
        await withDrafts.count('articles', {
          draft: true,
          overrideAccess: false,
          user: member as never,
        }),
      ).toBe(1)
    } finally {
      await withDrafts.destroy()
    }
  })
})
