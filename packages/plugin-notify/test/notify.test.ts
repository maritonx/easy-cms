import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type Config,
  createEasyCMS,
  createRestHandler,
  defineConfig,
  resolveConfig,
  silentLogger,
} from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { notifyPlugin } from '../src/index.js'

// A stand-in for Telegram's Bot API: records each call; `answer` decides the reply.
type Call = { token: string; method: string; body: Record<string, unknown> }
const calls: Call[] = []
let answer: (call: Call) => { status: number; body: unknown } = () => ({
  status: 200,
  body: { ok: true, result: { message_id: 1 } },
})
let server: Server

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
    })
    req.on('end', () => {
      const [, bot = '', method = ''] = req.url?.split('/') ?? []
      const call = { token: bot.replace(/^bot/, ''), method, body: JSON.parse(raw || '{}') }
      calls.push(call)
      const { status, body } =
        method === 'getMe'
          ? { status: 200, body: { ok: true, result: { username: 'site_bot' } } }
          : method === 'getUpdates'
            ? {
                status: 200,
                body: {
                  ok: true,
                  result: [
                    { message: { chat: { id: 11, type: 'private', first_name: 'Ann' } } },
                    { message: { chat: { id: -22, type: 'group', title: 'Shop team' } } },
                    { message: { chat: { id: 11, type: 'private', first_name: 'Ann' } } },
                  ],
                },
              }
            : answer(call)
      res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  process.env.TELEGRAM_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => {
  delete process.env.TELEGRAM_API_URL
  server.close()
})

const dirs: string[] = []
beforeEach(() => {
  calls.length = 0
  answer = () => ({ status: 200, body: { ok: true, result: { message_id: 1 } } })
})
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    } catch {
      // Windows may still hold the SQLite file; the OS cleans temp.
    }
  }
})

const base = (extra: Partial<Config> = {}, limit?: number) =>
  defineConfig({
    secret: 'x'.repeat(32),
    db: sqlite({ url: 'file:./cms.db' }),
    serverURL: 'https://site.test',
    // Sent by the form builder and the shop.
    events: ['form.submitted', 'order.created'],
    collections: [],
    plugins: [notifyPlugin(limit ? { limit } : {})],
    ...extra,
  })

async function open(config: Config = base()) {
  const cwd = mkdtempSync(join(tmpdir(), 'easy-cms-notify-'))
  dirs.push(cwd)
  const cms = await createEasyCMS(config, {
    cwd,
    schema: 'push',
    logger: silentLogger,
    scheduler: false,
  })
  await cms.create('users', { email: 'admin@x.co', password: 'password123', role: 'admin' })
  const { token } = await cms.auth.login({ email: 'admin@x.co', password: 'password123' })
  const rest = createRestHandler(cms)
  const call = async (path: string, method = 'GET', body?: unknown) => {
    const res = await rest(
      new Request(`http://cms.test/api/cms/admin/integrations${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    )
    return { status: res.status, body: (await res.json()) as Record<string, unknown> }
  }
  const connect = (values: Record<string, string>, name = 'Team') =>
    call('/telegram/connections', 'POST', { name, values: { token: 'T0K', ...values } })
  return { cms, call, connect }
}

/** Easy CMS's own failure events (internal to core). */
const systemEvent = (cms: unknown, event: string, data: Record<string, unknown>) =>
  (cms as { systemEvent(event: string, data: Record<string, unknown>): void }).systemEvent(
    event,
    data,
  )

const sent = () => calls.filter((c) => c.method === 'sendMessage')
const rows = async (cms: Awaited<ReturnType<typeof open>>['cms']) =>
  (await cms.db.find({ collection: 'notify-messages', sort: ['id'], limit: 0, page: 1 }))
    .docs as Record<string, unknown>[]

describe('notifyPlugin config', () => {
  it('adds the Telegram integration, a queue kept out of the admin, a job and a listener', async () => {
    const config = await resolveConfig(base())
    const telegram = config.integrations?.find((i) => i.id === 'telegram')
    expect(telegram?.category).toBe('notifications')
    expect(telegram?.fields?.map((f) => [f.name, f.type ?? 'text'])).toEqual([
      ['token', 'text'],
      ['chatId', 'text'],
      ['language', 'select'],
      ['events', 'multiselect'],
    ])
    expect(telegram?.env).toEqual({ token: 'TELEGRAM_BOT_TOKEN' })
    expect(telegram?.icon).toMatchObject({
      color: '#26A5E4',
      paths: [{ d: expect.stringMatching(/^M/) }],
    })
    const queue = config.collections.find((c) => c.slug === 'notify-messages')
    expect(queue?.access?.read?.({} as never)).toBe(false)
    expect(config.jobs?.map((j) => j.name)).toContain('notify:send')
    expect(config.listeners?.[0]?.events).toContain('form.submitted')
  })

  it('refuses a slug that is taken and a limit below 1', async () => {
    expect(() => notifyPlugin({ limit: 0 })).toThrow(/limit/)
    await expect(
      resolveConfig(base({ collections: [{ slug: 'notify-messages', fields: [] }] })),
    ).rejects.toThrow(/already a collection/)
  })
})

describe('notifyPlugin', () => {
  it('tests a connection with a real message and finds chats', async () => {
    const { connect, call } = await open()
    const found = await call('/telegram/lookup/chatId', 'POST', { values: { token: 'T0K' } })
    expect(found.body.choices).toEqual([
      { value: '11', label: 'Ann (private)' },
      { value: '-22', label: 'Shop team (group)' },
    ])
    const made = await connect({ chatId: '-22', language: 'th' })
    expect(made.status).toBeLessThan(300)
    expect(calls.map((c) => c.method)).toEqual(['getUpdates', 'getMe', 'sendMessage'])
    expect(sent()[0]?.body).toMatchObject({ chat_id: '-22', parse_mode: 'HTML' })
    expect(String(sent()[0]?.body.text)).toContain('ข้อความทดสอบ')
    const overview = await call('')
    expect(JSON.stringify(overview.body)).toContain('@site_bot')

    answer = () => ({
      status: 401,
      body: { ok: false, error_code: 401, description: 'Unauthorized' },
    })
    const bad = await connect({ chatId: '-22' }, 'Bad')
    expect(bad.status).toBe(400)
    expect(JSON.stringify(bad.body)).toContain('Unauthorized')
  })

  it('tells each connection about the events it wants, escaped and linked', async () => {
    const { cms, connect } = await open()
    await connect({ chatId: '1' }, 'All')
    await connect({ chatId: '2', events: 'backup.failed' }, 'Backups only')
    calls.length = 0
    cms.emit(
      'form.submitted',
      { form: { id: 3, title: 'Q&A <beta>' }, email: 'a@x.co', submission: { secret: 'no' } },
      { collection: 'form-submissions', id: 9 },
    )
    await vi.waitFor(() => expect(sent()).toHaveLength(1))
    const text = String(sent()[0]?.body.text)
    expect(sent()[0]?.body.chat_id).toBe('1')
    expect(text).toContain('<b>A form was sent</b>')
    expect(text).toContain('Form: Q&amp;A &lt;beta&gt;')
    expect(text).toContain('From: a@x.co')
    expect(text).not.toContain('secret')
    expect(text).toContain('href="https://site.test/admin/collections/form-submissions/9"')

    systemEvent(cms, 'backup.failed', { backup: 1, error: 'disk full' })
    await vi.waitFor(() => expect(sent()).toHaveLength(3))
    expect(
      sent()
        .map((c) => c.body.chat_id)
        .sort(),
    ).toEqual(['1', '1', '2'].slice(1).concat('1').sort())
    expect((await rows(cms)).every((r) => r.state === 'sent')).toBe(true)
  })

  it('retries after 1, 5 and 30 minutes, then marks the connection broken', async () => {
    const { cms, connect, call } = await open()
    await connect({ chatId: '1' })
    answer = () => ({ status: 502, body: { ok: false, description: 'Bad Gateway' } })
    systemEvent(cms, 'backup.failed', { backup: 1, error: 'disk full' })
    await vi.waitFor(async () => expect((await rows(cms))[0]?.attempts).toBe(1))
    const start = Date.now()
    for (const [minutes, attempts] of [
      [2, 2],
      [8, 3],
      [40, 4],
    ] as const) {
      await cms.runJobs(new Date(start + minutes * 60_000))
      expect((await rows(cms))[0]?.attempts).toBe(attempts)
    }
    const [row] = await rows(cms)
    expect(row?.state).toBe('failed')
    expect(row?.error).toContain('Bad Gateway')
    expect(JSON.stringify((await call('')).body)).toContain('Bad Gateway')
    // Telegram failing isn't told through Telegram.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(await rows(cms)).toHaveLength(1)
  })

  it('sends a failed try again when Telegram is back', async () => {
    const { cms, connect } = await open()
    await connect({ chatId: '1' })
    answer = () => ({ status: 429, body: { ok: false, description: 'Too Many Requests' } })
    cms.emit(
      'order.created',
      { id: 5, orderNumber: '1005', total: 123450, currency: 'THB', email: 'b@x.co' },
      { collection: 'orders', id: 5 },
    )
    await vi.waitFor(async () => expect((await rows(cms))[0]?.attempts).toBe(1))
    answer = () => ({ status: 200, body: { ok: true, result: {} } })
    await cms.runJobs(new Date(Date.now() + 2 * 60_000))
    const [row] = await rows(cms)
    expect(row?.state).toBe('sent')
    expect(String(sent().at(-1)?.body.text)).toMatch(/Order: #1005\nTotal: THB\s?1,234\.50/)
  })

  it('holds back what is over the limit and tells how many the next hour', async () => {
    const { cms, connect } = await open(base({}, 2))
    await connect({ chatId: '1', language: 'th' })
    calls.length = 0
    for (let i = 0; i < 4; i++) {
      systemEvent(cms, 'backup.failed', { backup: i, error: 'x' })
      await vi.waitFor(async () => expect(await rows(cms)).toHaveLength(i + 1))
    }
    expect(sent()).toHaveLength(2)
    expect((await rows(cms)).map((r) => r.state)).toEqual(['sent', 'sent', 'dropped', 'dropped'])
    await cms.runJobs(new Date())
    expect(sent()).toHaveLength(2)
    await cms.runJobs(new Date(Date.now() + 61 * 60_000))
    expect(sent()).toHaveLength(3)
    expect(String(sent()[2]?.body.text)).toContain('อีก 2 รายการ')
  })
})
