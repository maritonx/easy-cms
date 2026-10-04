import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type Config,
  consoleEmail,
  createEasyCMS,
  createRestHandler,
  defineConfig,
  resolveConfig,
  silentLogger,
} from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { formBuilderPlugin, type PublicForm } from '../src/index.js'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    } catch {
      // Windows may still hold the SQLite file; the OS cleans temp.
    }
  }
})

const BASE = 'http://cms.test/api/cms'

async function setup(
  options: Parameters<typeof formBuilderPlugin>[0] = {},
  extra: Partial<Config> = {},
) {
  const email = consoleEmail({ from: 'Site <site@x.test>', log: () => {} })
  const config = defineConfig({
    secret: 'x'.repeat(32),
    db: sqlite({ url: 'file:./cms.db' }),
    email,
    plugins: [formBuilderPlugin({ minSubmitTime: 0, defaultTo: 'owner@x.test', ...options })],
    ...extra,
  })
  const cwd = mkdtempSync(join(tmpdir(), 'easy-cms-forms-'))
  dirs.push(cwd)
  const cms = await createEasyCMS(config, {
    cwd,
    schema: 'push',
    logger: silentLogger,
    scheduler: false,
  })
  const handle = createRestHandler(cms, { getClientIp: () => '203.0.113.9' })
  const form = await cms.create('forms', {
    title: 'Contact',
    status: 'published',
    submitLabel: 'Send it',
    fields: [
      { blockType: 'text', name: 'name', label: 'Name', required: true, width: 'half' },
      { blockType: 'email', name: 'email', label: 'Email', required: true, width: 'half' },
      {
        blockType: 'select',
        name: 'topic',
        label: 'Topic',
        options: [
          { label: 'Sales', value: 'sales' },
          { label: 'Support', value: 'support' },
        ],
      },
      { blockType: 'textarea', name: 'message', label: 'Message' },
      { blockType: 'checkbox', name: 'agree', label: 'I agree', required: true },
    ],
    confirmationMessage: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Thanks!' }] }],
    },
    emails: [
      { subject: 'New message from {{name}}', replyTo: '{{email}}' },
      {
        to: '{{email}}',
        subject: 'We got it, {{name}}',
        message: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Hi {{name}}: {{message}} {{*}}' }],
            },
          ],
        },
      },
    ],
  })
  const call = (path: string, init: RequestInit = {}) => handle(new Request(`${BASE}${path}`, init))
  const load = async () => (await (await call('/form/contact')).json()) as PublicForm
  const submit = (body: Record<string, unknown>, origin = 'http://cms.test') =>
    call('/form/contact/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify(body),
    })
  const good = {
    name: 'Somchai',
    email: 'somchai@x.test',
    topic: 'sales',
    message: 'Hello there',
    agree: true,
  }
  return { cms, email, form, call, load, submit, good }
}

describe('formBuilderPlugin config', () => {
  it('adds forms and submissions, the admin module and the endpoints', async () => {
    const config = await resolveConfig(
      defineConfig({
        secret: 'x'.repeat(32),
        db: sqlite({ url: 'file:./cms.db' }),
        plugins: [formBuilderPlugin()],
      }),
    )
    expect(config.collections.map((c) => c.slug)).toEqual(
      expect.arrayContaining(['forms', 'form-submissions']),
    )
    expect(config.admin.modules).toContain('@easy-cms/plugin-form-builder/admin')
    expect(config.endpoints.map((e) => `${e.method} ${e.path}`)).toEqual([
      'get /form/:slug',
      'post /form/:slug/submit',
      'get /form/:slug/submissions.csv',
      'get /form/stats.json',
      'get /form/element.js',
    ])
    // The overview page under Content, and a dashboard panel.
    expect(config.admin.pages).toEqual([
      expect.objectContaining({
        path: 'forms-overview',
        component: {
          tag: 'ecms-forms-overview',
          props: { forms: 'forms', submissions: 'form-submissions', adminPath: '/admin' },
        },
      }),
    ])
    expect(config.admin.dashboard).toEqual([
      expect.objectContaining({ component: expect.objectContaining({ tag: 'ecms-forms-widget' }) }),
    ])
  })
})

describe('forms', () => {
  it('serves published forms without their email settings', async () => {
    const { cms, form, call, load } = await setup()
    try {
      const pub = await load()
      expect(pub).toMatchObject({
        slug: 'contact',
        title: 'Contact',
        submitLabel: 'Send it',
        honeypot: 'website',
        turnstile: null,
      })
      expect(pub.fields.map((f) => [f.kind, f.name, f.required, f.width])).toEqual([
        ['text', 'name', true, 'half'],
        ['email', 'email', true, 'half'],
        ['select', 'topic', false, 'full'],
        ['textarea', 'message', false, 'full'],
        ['checkbox', 'agree', true, 'full'],
      ])
      expect(JSON.stringify(pub)).not.toContain('emails')
      await cms.unpublish('forms', form.id)
      expect((await call('/form/contact')).status).toBe(404)
      // Duplicate field names are refused.
      await expect(
        cms.create('forms', {
          title: 'Twice',
          fields: [
            { blockType: 'text', name: 'a' },
            { blockType: 'text', name: 'a' },
          ],
        }),
      ).rejects.toThrow('used twice')
    } finally {
      await cms.destroy()
    }
  })

  it('stores valid submissions and sends the emails', async () => {
    const { cms, email, load, submit, good } = await setup()
    try {
      const { token } = await load()
      const response = await submit({
        data: { ...good, extra: 'dropped' },
        token,
        page: '/contact',
      })
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        confirmation: { type: 'message', html: '<p>Thanks!</p>' },
      })
      const { docs } = await cms.find('form-submissions', {})
      expect(docs[0]).toMatchObject({
        data: { ...good },
        page: '/contact',
        summary: 'Somchai · somchai@x.test · sales',
      })
      await cms.flushEmails()
      const [owner, reply] = email.sent
      expect(owner).toMatchObject({
        to: ['owner@x.test'],
        replyTo: 'somchai@x.test',
        subject: 'New message from Somchai',
      })
      expect(owner?.html).toContain('<th align="left"')
      expect(owner?.html).toContain('Hello there')
      // To the submitter: short fields only, no free text, no table.
      expect(reply).toMatchObject({ to: ['somchai@x.test'], subject: 'We got it, Somchai' })
      expect(reply?.text).toBe('Hi Somchai:')
    } finally {
      await cms.destroy()
    }
  })

  it('refuses invalid data, per field', async () => {
    const { load, submit } = await setup()
    const { token } = await load()
    const response = await submit({ data: { name: '', email: 'nope', topic: 'other' }, token })
    expect(response.status).toBe(400)
    expect(
      ((await response.json()) as { errors: { field: string }[] }).errors.map((e) => e.field),
    ).toEqual(['name', 'email', 'topic', 'agree'])
  })

  it('catches bots without telling them, and limits submissions per visitor', async () => {
    const { cms, load, submit, good } = await setup({ rateLimit: { max: 2, window: 600 } })
    try {
      const { token, honeypot } = await load()
      // The honeypot: success for the bot, nothing stored.
      expect((await submit({ data: good, token, [honeypot]: 'http://spam.test' })).status).toBe(200)
      // A bad token.
      expect((await submit({ data: good, token: '1.x' })).status).toBe(400)
      expect(await cms.count('form-submissions')).toBe(0)
      expect((await submit({ data: good, token })).status).toBe(200)
      expect((await submit({ data: good, token })).status).toBe(200)
      expect((await submit({ data: good, token })).status).toBe(429)
      expect(await cms.count('form-submissions')).toBe(2)
      // The rate-limit key never leaves the server.
      const [doc] = (
        await cms.find('form-submissions', {
          overrideAccess: false,
          user: { id: 1, role: 'admin' } as never,
        })
      ).docs
      expect(doc && 'rateKey' in doc).toBe(false)
    } finally {
      await cms.destroy()
    }
  })

  it('treats a form sent too fast as a bot', async () => {
    const { cms, load, submit, good } = await setup({ minSubmitTime: 60_000 })
    try {
      const { token } = await load()
      expect((await submit({ data: good, token })).status).toBe(200)
      expect(await cms.count('form-submissions')).toBe(0)
    } finally {
      await cms.destroy()
    }
  })

  it('checks Cloudflare Turnstile when it is on', async () => {
    const checked: string[] = []
    const fake = (async (_url: string, init: RequestInit) => {
      const body = new URLSearchParams(String(init.body))
      checked.push(`${body.get('response')}@${body.get('remoteip')}`)
      return Response.json({ success: body.get('response') === 'human' })
    }) as typeof fetch
    const { cms, load, submit, good } = await setup({
      turnstile: { siteKey: 'site-key', secretKey: 'secret-key' },
      fetch: fake,
    })
    try {
      const { token, turnstile } = await load()
      expect(turnstile).toBe('site-key')
      expect((await submit({ data: good, token, turnstile: 'robot' })).status).toBe(400)
      expect((await submit({ data: good, token, turnstile: 'human' })).status).toBe(200)
      expect(checked).toEqual(['robot@203.0.113.9', 'human@203.0.113.9'])
      expect(await cms.count('form-submissions')).toBe(1)
    } finally {
      await cms.destroy()
    }
  })

  it('takes submissions from frontends allowed by cors, without cookies', async () => {
    const { cms, load, submit, good } = await setup({}, { cors: ['http://frontend.test'] })
    try {
      const { token } = await load()
      expect((await submit({ data: good, token }, 'http://frontend.test')).status).toBe(200)
      expect((await submit({ data: good, token }, 'http://evil.test')).status).toBe(403)
    } finally {
      await cms.destroy()
    }
  })

  it('exports submissions as CSV for logged-in users', async () => {
    const { cms, call, load, submit, good } = await setup()
    try {
      const { token } = await load()
      await submit({ data: { ...good, message: '=cmd|x, "quoted"' }, token })
      expect((await call('/form/contact/submissions.csv')).status).toBe(401)
      await cms.create('users', { email: 'a@x.test', password: 'password123', role: 'admin' })
      const session = await cms.auth.login({ email: 'a@x.test', password: 'password123' })
      const csv = await call('/form/contact/submissions.csv', {
        headers: { authorization: `Bearer ${session.token}` },
      })
      expect(csv.headers.get('content-disposition')).toContain('contact-submissions.csv')
      const bytes = new Uint8Array(await csv.arrayBuffer())
      // A byte-order mark first, so Excel reads Thai as UTF-8 (text() drops it when decoding).
      expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
      const text = new TextDecoder().decode(bytes)
      expect(text.startsWith('createdAt,locale,page,name,email,topic,message,agree\r\n')).toBe(true)
      // Formulas are escaped, quotes doubled.
      expect(text).toContain(`"'=cmd|x, ""quoted"""`)
    } finally {
      await cms.destroy()
    }
  })

  it('counts submissions per form and day for logged-in users', async () => {
    const { cms, call, load, submit, good, form } = await setup()
    try {
      const other = await cms.create('forms', {
        title: 'Newsletter',
        status: 'published',
        fields: [],
      })
      const { token } = await load()
      for (let i = 0; i < 3; i++) await submit({ data: good, token })
      await cms.create('form-submissions', { form: other.id, summary: 'x', data: {} })
      // Older than the range: not counted.
      const old = await cms.create('form-submissions', { form: form.id, summary: 'old', data: {} })
      await cms.db.update({
        collection: 'form-submissions',
        id: old.id,
        data: { createdAt: new Date(Date.now() - 40 * 86_400_000).toISOString() },
      })

      expect((await call('/form/stats.json')).status).toBe(401)
      await cms.create('users', { email: 'a@x.test', password: 'password123', role: 'editor' })
      const session = await cms.auth.login({ email: 'a@x.test', password: 'password123' })
      const headers = { authorization: `Bearer ${session.token}` }
      const stats = await (await call('/form/stats.json?tz=Asia/Bangkok', { headers })).json()
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(
        new Date(),
      )
      expect(stats).toMatchObject({ days: 7, timeZone: 'Asia/Bangkok', total: 4 })
      expect(stats.dates).toHaveLength(7)
      expect(stats.dates.at(-1)).toBe(today)
      expect(stats.perDay.at(-1)).toBe(4)
      // Most submissions first.
      expect(stats.forms.map((f: { title: string; total: number }) => [f.title, f.total])).toEqual([
        ['Contact', 3],
        ['Newsletter', 1],
      ])
      const month = await (
        await call('/form/stats.json?days=30&tz=Nowhere/Else', { headers })
      ).json()
      expect(month).toMatchObject({ days: 30, timeZone: 'UTC', total: 4 })
    } finally {
      await cms.destroy()
    }
  })
})
