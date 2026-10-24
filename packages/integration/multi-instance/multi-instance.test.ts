// Two `easy-cms serve` instances on one Postgres and one S3 bucket, behind a round-robin proxy:
// the reference architecture (ADR-0051). Assertions that need a request to reach a given
// instance call it directly; the rest go through the proxy, alternating between them.
import { type ChildProcess, execFile, spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, request as httpRequest, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { createEasyCMS, type EasyCMS, silentLogger } from '@easy-cms/core'
import { AwsClient } from 'aws4fetch'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import config from './easy-cms.config.js'

const configFile = fileURLToPath(new URL('./easy-cms.config.ts', import.meta.url))
const bin = fileURLToPath(new URL('../bin/easy-cms.js', import.meta.resolve('easy-cms')))
const PASSWORD = 'password123'
const cwd = mkdtempSync(join(tmpdir(), 'easy-cms-multi-'))
// The instances run as in production; the secrets and bucket come from vitest.config.ts.
const env = { ...process.env, NODE_ENV: 'production' }

const instances: ChildProcess[] = []
let a: string
let b: string
let proxy: Server
let lb: string
/** The Local API on the same database, to set up and check what the instances did. */
let cms: EasyCMS<typeof config>

async function freePort() {
  const server = createServer().listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  const { port } = server.address() as AddressInfo
  await new Promise((resolve) => server.close(resolve))
  return port
}

async function cli(...args: string[]) {
  await promisify(execFile)(
    process.execPath,
    [bin, ...args, '--config', configFile, '--cwd', cwd],
    {
      env,
    },
  )
}

async function serve() {
  const port = await freePort()
  const child = spawn(
    process.execPath,
    [bin, 'serve', '--port', String(port), '--trust-proxy', '--config', configFile, '--cwd', cwd],
    { env, stdio: ['ignore', 'inherit', 'inherit'] },
  )
  instances.push(child)
  const url = `http://127.0.0.1:${port}`
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw new Error(`serve exited with ${child.exitCode}`)
    if (
      await fetch(`${url}/healthz`).then(
        (r) => r.ok,
        () => false,
      )
    )
      return url
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('serve did not start')
}

/** Round robin, as a load balancer without sticky sessions; passes the client IP on. */
function roundRobin(targets: string[]) {
  let next = 0
  return createServer((req, res) => {
    const target = new URL(targets[next++ % targets.length] as string)
    const upstream = httpRequest(
      {
        host: target.hostname,
        port: target.port,
        method: req.method,
        path: req.url,
        headers: {
          ...req.headers,
          'x-forwarded-for': (req.headers['x-test-ip'] as string) ?? '203.0.113.1',
          'x-forwarded-proto': 'http',
        },
      },
      (response) => {
        res.writeHead(response.statusCode ?? 502, response.headers)
        response.pipe(res)
      },
    )
    upstream.on('error', () => res.writeHead(502).end())
    req.pipe(upstream)
  }).listen(0)
}

// Same origin as the instance called: in production both answer on one hostname.
const api = (base: string, path: string, init: RequestInit = {}) =>
  fetch(`${base}/api/cms${path}`, {
    ...init,
    headers: { origin: base, ...(init.headers as Record<string, string>) },
  })
const json = (body: unknown, headers: Record<string, string> = {}) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body),
})

/** Logs in on one instance and returns headers that authenticate like a browser. */
async function browser(base: string, email: string) {
  const login = await api(base, '/auth/login', json({ email, password: PASSWORD }))
  expect(login.status).toBe(200)
  const cookie = login.headers
    .getSetCookie()
    // `__Host-` in production
    .find((c) => /^(__Host-)?ecms-session=/.test(c))
    ?.split(';')[0] as string
  const { csrfToken } = (await login.json()) as { csrfToken: string }
  return { cookie, 'x-csrf-token': csrfToken }
}

beforeAll(async () => {
  const s3 = new AwsClient({
    accessKeyId: process.env.S3_TEST_ACCESS_KEY as string,
    secretAccessKey: process.env.S3_TEST_SECRET_KEY as string,
    service: 's3',
    region: 'us-east-1',
  })
  expect(
    (
      await s3.fetch(`${process.env.S3_TEST_ENDPOINT}/${process.env.S3_TEST_BUCKET}`, {
        method: 'PUT',
      })
    ).ok,
  ).toBe(true)
  // As in production: migrate once, then start the instances (which refuse pending migrations).
  await cli('migrate:create', 'init')
  await cli('migrate')
  ;[a, b] = await Promise.all([serve(), serve()])
  proxy = roundRobin([a as string, b as string])
  await new Promise((resolve) => proxy.once('listening', resolve))
  lb = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`
  cms = await createEasyCMS(config, {
    cwd,
    schema: 'verify',
    scheduler: false,
    logger: silentLogger,
  })
  await cms.create('users', { email: 'admin@x.co', password: PASSWORD, role: 'admin' })
}, 120_000)

afterAll(async () => {
  for (const child of instances) child.kill('SIGTERM')
  proxy?.close()
  await cms?.destroy()
  rmSync(cwd, { recursive: true, force: true })
})

describe('two instances behind a load balancer', () => {
  it('serves REST writes and reads from either instance', async () => {
    const admin = await browser(a, 'admin@x.co')
    const created = await api(b, '/posts', json({ title: 'From B', status: 'published' }, admin))
    expect(created.status).toBe(201)
    const { id } = (await created.json()) as { id: number }
    expect(await (await api(a, `/posts/${id}`)).json()).toMatchObject({ title: 'From B' })

    const updated = await api(a, `/posts/${id}`, {
      ...json({ title: 'Edited on A', status: 'published' }, admin),
      method: 'PATCH',
    })
    expect(updated.status).toBe(200)
    expect(await (await api(b, `/posts/${id}`)).json()).toMatchObject({ title: 'Edited on A' })

    // Through the balancer: every request lands on the other instance than the one before.
    for (let i = 0; i < 6; i++) {
      expect(await (await api(lb, `/posts/${id}`)).json()).toMatchObject({ title: 'Edited on A' })
    }
    expect((await api(b, `/posts/${id}`, { method: 'DELETE', headers: admin })).status).toBe(200)
    expect((await api(a, `/posts/${id}`)).status).toBe(404)
  })

  it('keeps a session made on one instance on the other, and ends it everywhere', async () => {
    const onA = await browser(a, 'admin@x.co')
    const me = (await (await api(b, '/auth/me', { headers: { cookie: onA.cookie } })).json()) as {
      user: { email: string } | null
      csrfToken: string
    }
    expect(me.user?.email).toBe('admin@x.co')
    // The CSRF token from A is accepted by B.
    expect(me.csrfToken).toBe(onA['x-csrf-token'])
    expect((await api(b, '/posts', json({ title: 'csrf' }, onA))).status).toBe(201)
    expect(
      (await api(b, '/posts', json({ title: 'csrf' }, { ...onA, 'x-csrf-token': 'wrong' }))).status,
    ).toBe(403)

    expect((await api(b, '/auth/logout', { method: 'POST', headers: onA })).status).toBe(200)
    const after = await (await api(a, '/auth/me', { headers: { cookie: onA.cookie } })).json()
    expect(after).toMatchObject({ user: null })
  })

  it('counts failed logins from one client across instances', async () => {
    const attempt = (password: string) =>
      api(
        lb,
        '/auth/login',
        json({ email: 'admin@x.co', password }, { 'x-test-ip': '198.51.100.9' }),
      )
    for (let i = 0; i < 5; i++) expect((await attempt('wrong-password')).status).toBe(401)
    // Locked out on both instances, even with the right password.
    expect((await attempt(PASSWORD)).status).toBe(429)
    expect((await attempt(PASSWORD)).status).toBe(429)
  })

  it('serves a file uploaded through one instance from the other', async () => {
    const admin = await browser(a, 'admin@x.co')
    const form = new FormData()
    const png = await sharp({
      create: { width: 4, height: 4, channels: 3, background: '#c00' },
    })
      .png()
      .toBuffer()
    form.set('file', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'red.png')
    const uploaded = await api(a, '/media', { method: 'POST', headers: admin, body: form })
    expect(uploaded.status).toBe(201)
    const media = (await uploaded.json()) as { id: number; url: string }
    const file = await fetch(`${b}${media.url}`)
    expect(file.status).toBe(200)
    expect(Buffer.from(await file.arrayBuffer()).equals(png)).toBe(true)
    expect((await api(b, `/media/${media.id}`, { method: 'DELETE', headers: admin })).status).toBe(
      200,
    )
    expect((await fetch(`${a}${media.url}`)).status).toBe(404)
  })

  it('runs each scheduled publish and each job once when both instances run jobs', async () => {
    const posts = await Promise.all(
      Array.from({ length: 20 }, (_, i) => cms.create('posts', { title: `Scheduled ${i}` })),
    )
    const at = new Date(Date.now() - 1000)
    for (const post of posts) await cms.schedule('posts', post.id, { action: 'publish', at })

    // A cron service and both instances' schedulers, all at once.
    const runs = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        api(i % 2 ? a : b, '/jobs/run', {
          headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
        }).then((r) => r.json() as Promise<{ scheduled: { ran: number }; jobs: { ran: number } }>),
      ),
    )
    expect(runs.reduce((sum, run) => sum + run.scheduled.ran, 0)).toBe(20)
    expect(runs.reduce((sum, run) => sum + run.jobs.ran, 0)).toBe(1)
    expect(await cms.count('runs')).toBe(1)
    for (const post of posts) {
      expect(await cms.findById('posts', post.id)).toMatchObject({ status: 'published' })
    }
  })
})
