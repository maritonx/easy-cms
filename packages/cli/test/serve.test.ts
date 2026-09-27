import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadConfig, silentLogger } from '@easy-cms/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type RunningServer, startServer } from '../src/serve.js'

// The project lives inside the package so its config can import workspace packages.
const TMP = join(import.meta.dirname, '.tmp')
let dir: string
let server: RunningServer

beforeAll(async () => {
  mkdirSync(TMP, { recursive: true })
  dir = mkdtempSync(join(TMP, 'serve-'))
  writeFileSync(
    join(dir, 'easy-cms.config.ts'),
    `import { defineConfig } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'

export default defineConfig({
  secret: '${'s'.repeat(32)}',
  db: sqlite({ url: 'file:./cms.db' }),
  cors: ['http://frontend.test'],
  collections: [{ slug: 'posts', access: { read: () => true }, fields: [{ name: 'title', type: 'text' }] }],
})
`,
  )
  server = await startServer({
    port: 0,
    host: '127.0.0.1',
    cwd: dir,
    logger: silentLogger,
    loadConfig: () => loadConfig({ cwd: dir }),
    trustProxy: true,
  })
})

afterAll(async () => {
  await server?.close()
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  } catch {
    // leave it to the OS temp cleaner
  }
})

describe('easy-cms serve (FR-STD-01)', () => {
  it('serves the admin, the REST API and a health check', async () => {
    const root = await fetch(`${server.url}/`, { redirect: 'manual' })
    expect(root.status).toBe(302)
    expect(root.headers.get('location')).toBe('/admin/')

    const admin = await fetch(`${server.url}/admin/`)
    expect(admin.status).toBe(200)
    expect(admin.headers.get('content-security-policy')).toContain("default-src 'self'")
    expect(await admin.text()).toContain('<meta name="easy-cms"')

    expect(await (await fetch(`${server.url}/healthz`)).text()).toBe('ok')
    expect((await fetch(`${server.url}/elsewhere`)).status).toBe(404)
    expect(await (await fetch(`${server.url}/api/cms/posts`)).json()).toMatchObject({ docs: [] })
  })

  it('passes request bodies, cookies and CORS through', async () => {
    const register = await fetch(`${server.url}/api/cms/users/first-register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: server.url },
      body: JSON.stringify({ email: 'admin@example.test', password: 'password123' }),
    })
    expect(register.status).toBe(201)
    const { csrfToken } = (await register.json()) as { csrfToken: string }
    const cookies = register.headers.getSetCookie()
    expect(cookies.some((c) => c.startsWith('ecms-session='))).toBe(true)
    const cookie = cookies.map((c) => c.split(';')[0]).join('; ')

    const created = await fetch(`${server.url}/api/cms/posts`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: server.url,
        cookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ title: 'Hello standalone' }),
    })
    expect(created.status).toBe(201)

    const list = await fetch(`${server.url}/api/cms/posts`, {
      headers: { origin: 'http://frontend.test' },
    })
    expect(list.headers.get('access-control-allow-origin')).toBe('http://frontend.test')
    expect(((await list.json()) as { docs: { title: string }[] }).docs.map((d) => d.title)).toEqual(
      ['Hello standalone'],
    )
  })

  it('marks cookies Secure behind an HTTPS proxy when trusted', async () => {
    const login = await fetch(`${server.url}/api/cms/users/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // The proxy terminates TLS, so the browser's origin is https on the same host.
        origin: server.url.replace('http:', 'https:'),
        'x-forwarded-proto': 'https',
      },
      body: JSON.stringify({ email: 'admin@example.test', password: 'password123' }),
    })
    expect(login.status).toBe(200)
    expect(login.headers.getSetCookie().find((c) => c.startsWith('ecms-session='))).toContain(
      'Secure',
    )
  })
})
