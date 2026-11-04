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
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { aiPlugin } from '../src/index.js'

// A stand-in for Anthropic's, OpenAI's and Gemini's APIs: records each call; `fail` makes the
// next answers fail with a status.
type Call = { path: string; headers: Record<string, unknown>; body: Record<string, unknown> }
const calls: Call[] = []
let fail: number[] = []
let reply = 'OK'
let server: Server
let base = ''

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
    })
    req.on('end', () => {
      const path = new URL(req.url ?? '/', 'http://x').pathname
      const call = { path, headers: req.headers, body: JSON.parse(raw || '{}') }
      calls.push(call)
      const send = (status: number, body: unknown) =>
        res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
      const status = fail.shift()
      if (status) return send(status, { error: { message: `mock ${status}` } })
      if (path === '/anthropic/v1/models')
        return send(200, { data: [{ id: 'claude-mock-1', display_name: 'Claude Mock' }] })
      if (path === '/anthropic/v1/messages')
        return send(200, {
          content: [{ type: 'text', text: reply }],
          usage: { input_tokens: 11, output_tokens: 3 },
        })
      if (path.endsWith('/models') && path.startsWith('/openai'))
        return send(200, { data: [{ id: 'gpt-mock-b' }, { id: 'gpt-mock-a' }] })
      if (path.endsWith('/chat/completions'))
        return send(200, {
          choices: [{ message: { content: reply } }],
          usage: { prompt_tokens: 7, completion_tokens: 2 },
        })
      if (path === '/gemini/v1beta/models')
        return send(200, {
          models: [
            {
              name: 'models/gemini-mock',
              displayName: 'Gemini Mock',
              supportedGenerationMethods: ['generateContent'],
            },
            { name: 'models/embed', supportedGenerationMethods: ['embedContent'] },
          ],
        })
      if (path.startsWith('/gemini/v1beta/models/'))
        return send(200, {
          candidates: [{ content: { parts: [{ text: reply }] } }],
          usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 1 },
        })
      send(404, { error: { message: `Unknown ${path}` } })
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  process.env.ANTHROPIC_API_URL = `${base}/anthropic`
  process.env.OPENAI_API_URL = `${base}/openai/v1`
  process.env.GEMINI_API_URL = `${base}/gemini`
})
afterAll(() => {
  delete process.env.ANTHROPIC_API_URL
  delete process.env.OPENAI_API_URL
  delete process.env.GEMINI_API_URL
  server.close()
})

const dirs: string[] = []
beforeEach(() => {
  calls.length = 0
  fail = []
  reply = 'OK'
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

const config_ = (extra: Partial<Config> = {}, limits?: Parameters<typeof aiPlugin>[0]) =>
  defineConfig({
    secret: 'x'.repeat(32),
    db: sqlite({ url: 'file:./cms.db' }),
    auth: { rbac: true },
    audit: true,
    collections: [],
    aiFeatures: [
      { id: 'summary', label: 'Summary' },
      { id: 'later', label: 'Off until turned on', default: false },
    ],
    plugins: [aiPlugin(limits)],
    ...extra,
  })

async function open(config: Config = config_()) {
  const cwd = mkdtempSync(join(tmpdir(), 'easy-cms-ai-'))
  dirs.push(cwd)
  const cms = await createEasyCMS(config, {
    cwd,
    schema: 'push',
    logger: silentLogger,
    scheduler: false,
  })
  const admin = await cms.create('users', {
    email: 'admin@x.co',
    password: 'password123',
    role: 'admin',
  })
  const editor = await cms.create('users', {
    email: 'ed@x.co',
    password: 'password123',
    role: 'editor',
  })
  const { token } = await cms.auth.login({ email: 'admin@x.co', password: 'password123' })
  const rest = createRestHandler(cms)
  const call = async (path: string, method = 'GET', body?: unknown) => {
    const res = await rest(
      new Request(`http://cms.test/api/cms/admin${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    )
    return { status: res.status, body: (await res.json()) as Record<string, any> }
  }
  const connect = async (id: string, values: Record<string, string>, name = 'Main') => {
    await call(`/integrations/${id}/consent`, 'POST')
    return call(`/integrations/${id}/connections`, 'POST', { name, values })
  }
  const asUser = (user: Record<string, unknown>) => ({ ...user, collection: 'users' }) as never
  return { cms, call, connect, admin: asUser(admin), editor: asUser(editor) }
}

describe('aiPlugin config', () => {
  it('adds the four providers to the AI category, and `ai` for core', async () => {
    const config = await resolveConfig(config_())
    const ai = config.integrations?.filter((i) => i.category === 'ai')
    expect(ai?.map((i) => i.id)).toEqual(['anthropic', 'openai', 'gemini', 'openai-compatible'])
    expect(ai?.every((i) => i.consent)).toBe(true)
    // Logos from simple-icons and Iconify, bundled; a server of your own gets an admin icon.
    expect(ai?.map((i) => (typeof i.icon === 'object' ? i.icon.color : i.icon))).toEqual([
      '#191919',
      '#000000',
      '#8E75B2',
      'globe',
    ])
    expect(config.ai?.providers.map((p) => p.integration)).toEqual(ai?.map((i) => i.id))
    expect(config.collections.some((c) => c.slug === 'ai-usage')).toBe(true)
    expect(config.aiFeatures.map((f) => f.id)).toEqual(['alt-text', 'summary', 'later'])
  })

  it('takes a choice of providers, and refuses unknown ones', async () => {
    const config = await resolveConfig(config_({}, { providers: ['gemini'] }))
    expect(config.integrations?.map((i) => i.id)).toEqual(['gemini'])
    expect(() => aiPlugin({ providers: ['nope' as never] })).toThrow(/unknown provider "nope"/)
  })
})

describe('aiPlugin', () => {
  it('asks for consent before the first connection, and logs who gave it', async () => {
    const { call } = await open()
    const refused = await call('/integrations/anthropic/connections', 'POST', {
      name: 'Main',
      values: { apiKey: 'sk-ant-1' },
    })
    expect(refused.status).toBe(400)
    expect(JSON.stringify(refused.body)).toContain('must be accepted')
    const accepted = await call('/integrations/anthropic/consent', 'POST')
    expect(accepted.body.consented.by).toBe('admin@x.co')
    const made = await call('/integrations/anthropic/connections', 'POST', {
      name: 'Main',
      values: { apiKey: 'sk-ant-1' },
    })
    expect(made.status).toBe(201)
    const overview = await call('/integrations')
    const card = overview.body.integrations.find((i: { id: string }) => i.id === 'anthropic')
    expect(card.consented.by).toBe('admin@x.co')
    // Test: a word through cms.ai, named after the model; its tokens count on the card.
    expect(card.connections[0]).toMatchObject({
      account: 'claude-sonnet-5-5',
      usage: { requests: 1, input: 11, output: 3 },
    })
  })

  it('answers with each provider, in its own API', async () => {
    const { cms, connect, call } = await open()
    await connect('anthropic', { apiKey: 'sk-ant', model: 'claude-mock-1' })
    await connect('openai', { apiKey: 'sk-oai' })
    await connect('gemini', { apiKey: 'g-key', model: 'gemini-mock' })
    await connect('openai-compatible', { baseUrl: `${base}/local/v1`, model: 'llama' })
    const ai = cms.ai as NonNullable<typeof cms.ai>
    const answers: Record<string, unknown> = {}
    for (const id of ['anthropic:Main', 'openai:Main', 'gemini:Main', 'openai-compatible:Main']) {
      await call('/ai', 'PUT', { main: id })
      calls.length = 0
      const result = await ai.generate({ feature: 'summary', system: 'Be brief.', prompt: 'Hi' })
      answers[id] = { text: result.text, usage: result.usage, connection: result.connection }
      const sent = calls.at(-1) as Call
      if (id.startsWith('anthropic')) {
        expect(sent.path).toBe('/anthropic/v1/messages')
        expect(sent.headers['x-api-key']).toBe('sk-ant')
        expect(sent.body).toMatchObject({
          model: 'claude-mock-1',
          max_tokens: 1024,
          system: 'Be brief.',
        })
      } else if (id.startsWith('openai:')) {
        expect(sent.path).toBe('/openai/v1/chat/completions')
        expect(sent.headers.authorization).toBe('Bearer sk-oai')
        expect(sent.body).toMatchObject({ model: 'gpt-5-mini', max_completion_tokens: 1024 })
      } else if (id.startsWith('gemini')) {
        expect(sent.path).toBe('/gemini/v1beta/models/gemini-mock:generateContent')
        expect(sent.headers['x-goog-api-key']).toBe('g-key')
        expect(sent.body).toMatchObject({ systemInstruction: { parts: [{ text: 'Be brief.' }] } })
      } else {
        expect(sent.path).toBe('/local/v1/chat/completions')
        expect(sent.headers.authorization).toBeUndefined()
        expect(sent.body).toMatchObject({ model: 'llama', max_tokens: 1024 })
      }
    }
    expect(answers).toEqual({
      'anthropic:Main': {
        text: 'OK',
        usage: { input: 11, output: 3 },
        connection: 'anthropic:Main',
      },
      'openai:Main': { text: 'OK', usage: { input: 7, output: 2 }, connection: 'openai:Main' },
      'gemini:Main': { text: 'OK', usage: { input: 5, output: 1 }, connection: 'gemini:Main' },
      'openai-compatible:Main': {
        text: 'OK',
        usage: { input: 7, output: 2 },
        connection: 'openai-compatible:Main',
      },
    })
  })

  it('lists models for the Find button', async () => {
    const { call } = await open()
    const find = (id: string, values: Record<string, string>) =>
      call(`/integrations/${id}/lookup/model`, 'POST', { values })
    expect((await find('anthropic', { apiKey: 'k' })).body.choices).toEqual([
      { value: 'claude-mock-1', label: 'Claude Mock (claude-mock-1)' },
    ])
    expect(
      (await find('openai', { apiKey: 'k' })).body.choices.map((c: { value: string }) => c.value),
    ).toEqual(['gpt-mock-a', 'gpt-mock-b'])
    expect((await find('gemini', { apiKey: 'k' })).body.choices).toEqual([
      { value: 'gemini-mock', label: 'Gemini Mock (gemini-mock)' },
    ])
  })

  it('uses the main connection, or the one a feature picks; features can be off', async () => {
    const { cms, connect, call } = await open()
    await connect('anthropic', { apiKey: 'a' })
    await connect('openai', { apiKey: 'o' })
    const ai = cms.ai as NonNullable<typeof cms.ai>
    // Without a choice: the first connection.
    expect((await ai.generate({ feature: 'summary', prompt: 'x' })).connection).toBe(
      'anthropic:Main',
    )
    await call('/ai', 'PUT', { main: 'openai:Main' })
    expect((await ai.generate({ feature: 'summary', prompt: 'x' })).connection).toBe('openai:Main')
    await call('/ai', 'PUT', { features: { summary: { connection: 'anthropic:Main' } } })
    expect((await ai.generate({ feature: 'summary', prompt: 'x' })).connection).toBe(
      'anthropic:Main',
    )

    await expect(ai.generate({ feature: 'later', prompt: 'x' })).rejects.toThrow(/turned off/)
    await expect(ai.generate({ feature: 'nope', prompt: 'x' })).rejects.toThrow(
      /Unknown AI feature/,
    )
    await call('/ai', 'PUT', {
      features: { later: { enabled: true }, summary: { enabled: false } },
    })
    await expect(ai.generate({ feature: 'summary', prompt: 'x' })).rejects.toThrow(/turned off/)
    expect((await ai.generate({ feature: 'later', prompt: 'x' })).text).toBe('OK')
    expect((await call('/ai', 'PUT', { main: 'gemini:Nope' })).status).toBe(400)

    const overview = await call('/ai')
    expect(overview.body).toMatchObject({
      main: 'openai:Main',
      perUserPerDay: 100,
      features: [
        { id: 'alt-text', enabled: true, connection: null },
        { id: 'summary', enabled: false, connection: 'anthropic:Main' },
        { id: 'later', enabled: true, connection: null },
      ],
    })
    expect(overview.body.connections.map((c: { id: string }) => c.id)).toEqual([
      'anthropic:Main',
      'openai:Main',
    ])
  })

  it('refuses the 101st request of the day, and limits by role', async () => {
    const { cms, connect, call, editor, admin } = await open(
      config_({}, { limits: { roles: { editor: 2 } } }),
    )
    await connect('anthropic', { apiKey: 'a' })
    const ai = cms.ai as NonNullable<typeof cms.ai>
    for (let i = 0; i < 100; i++)
      await ai.generate({ feature: 'summary', prompt: 'x' }, { user: admin })
    await expect(
      ai.generate({ feature: 'summary', prompt: 'x' }, { user: admin }),
    ).rejects.toMatchObject({
      status: 429,
    })
    // Without a user (a script), no limit.
    await ai.generate({ feature: 'summary', prompt: 'x' })

    // The config's limit for editors, then Settings → Roles, which wins.
    await ai.generate({ feature: 'summary', prompt: 'x' }, { user: editor })
    await ai.generate({ feature: 'summary', prompt: 'x' }, { user: editor })
    await expect(
      ai.generate({ feature: 'summary', prompt: 'x' }, { user: editor }),
    ).rejects.toThrow(/2 times today/)
    const roles = await call('/roles')
    expect(roles.body.ai).toBe(true)
    const role = roles.body.roles.find((r: { key: string }) => r.key === 'editor')
    await call(`/roles/${role.id}`, 'PATCH', { permissions: { ...role.permissions, aiPerDay: 5 } })
    expect(await ai.remaining(editor)).toEqual({ used: 2, limit: 5 })
    await call(`/roles/${role.id}`, 'PATCH', { permissions: { ...role.permissions, aiPerDay: 0 } })
    await expect(
      ai.generate({ feature: 'summary', prompt: 'x' }, { user: editor }),
    ).rejects.toThrow(/may not use AI/)

    // Admins change everyone's limit.
    await call('/ai', 'PUT', { perUserPerDay: 150 })
    expect(await ai.remaining(admin)).toEqual({ used: 100, limit: 150 })
    const overview = await call('/ai')
    expect(overview.body.usage.byUser[0]).toMatchObject({ user: 'admin@x.co', requests: 100 })
    expect(overview.body.usage.byFeature[0]).toMatchObject({ feature: 'summary' })
  })

  it('retries a busy provider once, and marks a refused key', async () => {
    const { cms, connect, call } = await open()
    await connect('anthropic', { apiKey: 'a' })
    const ai = cms.ai as NonNullable<typeof cms.ai>
    fail = [529]
    expect((await ai.generate({ feature: 'summary', prompt: 'x' })).text).toBe('OK')
    fail = [500, 503]
    await expect(ai.generate({ feature: 'summary', prompt: 'x' })).rejects.toThrow('mock 503')
    const failed: unknown[] = []
    cms.on('integration.failed', ({ data }) => void failed.push(data))
    fail = [401]
    await expect(ai.generate({ feature: 'summary', prompt: 'x' })).rejects.toThrow('mock 401')
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(failed).toEqual([{ integration: 'anthropic', name: 'Main', error: 'mock 401' }])
    const card = (await call('/integrations')).body.integrations.find(
      (i: { id: string }) => i.id === 'anthropic',
    )
    expect(card.connections[0].lastError).toBe('mock 401')
  })

  it('parses JSON answers and sends images', async () => {
    const { cms, connect } = await open()
    await connect('anthropic', { apiKey: 'a' })
    const ai = cms.ai as NonNullable<typeof cms.ai>
    reply = '```json\n{"title":"Hello"}\n```'
    const schema = { type: 'object', properties: { title: { type: 'string' } } }
    const result = await ai.generate({
      feature: 'summary',
      prompt: 'Title?',
      json: schema,
      images: [{ data: 'aGk=', mediaType: 'image/png' }],
    })
    expect(result.json).toEqual({ title: 'Hello' })
    const sent = calls.at(-1)?.body as { system: string; messages: { content: unknown[] }[] }
    expect(sent.system).toContain('Answer with JSON only')
    expect(sent.messages[0]?.content[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: 'aGk=' },
    })
    reply = 'not json'
    await expect(ai.generate({ feature: 'summary', prompt: 'x', json: schema })).rejects.toThrow(
      /other than JSON/,
    )
    await expect(
      ai.generate({
        feature: 'summary',
        prompt: 'x',
        images: [{ data: 'x', mediaType: 'image/tiff' }],
      }),
    ).rejects.toThrow()
  })

  it('reads an image from the media library', async () => {
    const { cms, connect } = await open()
    await connect('anthropic', { apiKey: 'a' })
    // A 1×1 PNG.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    )
    const media = await cms.upload({ data: new Uint8Array(png), name: 'dot.png' }, { alt: 'x' })
    await (cms.ai as NonNullable<typeof cms.ai>).generate({
      feature: 'summary',
      prompt: 'Alt text?',
      images: [{ media: media.id }],
    })
    const sent = calls.at(-1)?.body as { messages: { content: { source?: unknown }[] }[] }
    expect(sent.messages[0]?.content[0]?.source).toEqual({
      type: 'base64',
      media_type: 'image/png',
      data: png.toString('base64'),
    })
  })

  it('writes alt text for an image the user may change, in the locale being edited (#358)', async () => {
    const { cms, connect, call } = await open(
      config_({ localization: { locales: ['th', 'en'], defaultLocale: 'th' } }),
    )
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    )
    const media = await cms.upload({ data: new Uint8Array(png), name: 'dot.png' })
    // Nothing connected: the buttons stay hidden.
    expect((await call('/ai/status')).body).toMatchObject({ connected: false, used: 0 })
    await connect('anthropic', { apiKey: 'a' })
    expect((await call('/ai/status')).body).toEqual({
      connected: true,
      features: ['alt-text', 'summary'],
      used: 0,
      limit: 100,
    })

    reply = '"A small black dot on a white background, centred in the frame"'
    const written = await call('/ai/alt-text', 'POST', { media: media.id, locale: 'en' })
    expect(written.body).toEqual({
      alt: 'A small black dot on a white background, centred in the frame',
    })
    const sent = calls.at(-1)?.body as {
      system: string
      max_tokens: number
      messages: { content: { type: string }[] }[]
    }
    expect(sent.system).toContain('Write it in English')
    expect(sent.messages[0]?.content.map((c) => c.type)).toEqual(['image', 'text'])
    // Without a locale: the default one.
    await call('/ai/alt-text', 'POST', { media: media.id })
    expect(String(calls.at(-1)?.body.system)).toContain('Write it in Thai')
    expect((await call('/ai/status')).body).toMatchObject({ used: 2 })

    // At most 125 characters, cut at a word.
    reply = `${'word '.repeat(40)}end`
    const long = (await call('/ai/alt-text', 'POST', { media: media.id })).body.alt as string
    expect(long.length).toBeLessThanOrEqual(125)
    expect(long.endsWith('word')).toBe(true)

    expect((await call('/ai/alt-text', 'POST', {})).status).toBe(400)
    await call('/ai', 'PUT', { features: { 'alt-text': { enabled: false } } })
    expect((await call('/ai/alt-text', 'POST', { media: media.id })).status).toBe(400)
  })

  it('refuses alt text to users who may not change the file', async () => {
    const { cms, connect, call } = await open()
    await connect('anthropic', { apiKey: 'a' })
    const media = await cms.upload({
      data: new TextEncoder().encode('%PDF-1.4\n%\n'),
      name: 'a.pdf',
    })
    const role = await call('/roles', 'POST', {
      key: 'reader',
      name: 'Reader',
      permissions: { collections: { media: ['read'] } },
    })
    expect(role.status).toBeLessThan(300)
    await cms.create('users', { email: 'reader@x.co', password: 'password123', role: 'reader' })
    const { token } = await cms.auth.login({ email: 'reader@x.co', password: 'password123' })
    const res = await createRestHandler(cms)(
      new Request('http://cms.test/api/cms/admin/ai/alt-text', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ media: media.id }),
      }),
    )
    expect(res.status).toBe(403)
    // Nothing was asked.
    expect(calls.filter((c) => c.path === '/anthropic/v1/messages')).toHaveLength(1)
  })

  it('reads an environment key, and says when nothing is connected', async () => {
    const { cms } = await open()
    const ai = cms.ai as NonNullable<typeof cms.ai>
    await expect(ai.generate({ feature: 'summary', prompt: 'x' })).rejects.toThrow(/No AI provider/)
    process.env.GEMINI_API_KEY = 'from-env'
    try {
      const result = await ai.generate({ feature: 'summary', prompt: 'x' })
      expect(result.connection).toBe('gemini:Environment')
      expect(calls.at(-1)?.path).toBe('/gemini/v1beta/models/gemini-flash-latest:generateContent')
      expect(calls.at(-1)?.headers['x-goog-api-key']).toBe('from-env')
    } finally {
      delete process.env.GEMINI_API_KEY
    }
  })
})
