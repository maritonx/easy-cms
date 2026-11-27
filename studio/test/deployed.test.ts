import { readFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname, join, normalize, resolve } from 'node:path'
import { type Browser, chromium, type Frame, type Page } from 'playwright-core'
import { build } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cacheControl, editorHeaders, type Origins, sandboxHeaders } from '../deploy/headers.ts'

// Studio as it is deployed: the editor and the sandbox on origins of their own, each with the
// headers the server sends (deploy/headers.ts, as in deploy/caddy.ts). Chrome takes
// *.localhost as this machine, and as a secure context, so the Service Worker runs.

const root = resolve(import.meta.dirname, '..')
const outDir = join(root, 'test/.tmp/deployed')
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
}

let server: Server
let browser: Browser
let origins: Origins
/** What the stand-in for Umami was sent. */
const events: string[] = []
/** Umami's script, standing in: counts each event with a request to its own origin. */
const UMAMI_SCRIPT = `const base = document.currentScript.src
window.umami = { track: (name) => fetch(new URL('/api/send', base).href, { method: 'POST', body: name }) }`

beforeAll(async () => {
  server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://x')
    const host = request.headers.host ?? ''
    if (host.startsWith('stats.')) {
      let body = ''
      for await (const chunk of request) body += chunk
      if (request.method === 'POST') events.push(body)
      response.writeHead(200, {
        'content-type': 'text/javascript',
        'access-control-allow-origin': '*',
      })
      response.end(request.method === 'POST' ? '' : UMAMI_SCRIPT)
      return
    }
    const headers = host.startsWith('sandbox.') ? sandboxHeaders(origins) : editorHeaders(origins)
    const path = url.pathname === '/' ? '/index.html' : url.pathname
    const file = normalize(join(outDir, path))
    const body = file.startsWith(outDir) ? await readFile(file).catch(() => undefined) : undefined
    response.writeHead(body ? 200 : 404, {
      ...headers,
      'cache-control': cacheControl(path),
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    })
    response.end(body)
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const { port } = server.address() as AddressInfo
  const stats = `http://stats.localhost:${port}`
  origins = {
    studio: `http://studio.localhost:${port}`,
    sandbox: `http://sandbox.localhost:${port}`,
    analytics: [stats],
  }
  process.env.VITE_STUDIO_ORIGIN = origins.studio
  process.env.VITE_SANDBOX_ORIGIN = origins.sandbox
  process.env.VITE_UMAMI_SRC = `${stats}/script.js`
  process.env.VITE_UMAMI_WEBSITE_ID = 'test'
  await build({ root, logLevel: 'error', build: { outDir, emptyOutDir: true } })
  browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
})

afterAll(async () => {
  await browser?.close()
  await new Promise<void>((done) => server?.close(() => done()))
})

const frameAt = (page: Page, path: string): Frame | undefined =>
  page.frames().find((frame) => new URL(frame.url()).pathname.startsWith(path))

describe('Studio on two origins, with its headers', () => {
  it('runs with nothing refused, the sandbox on its own origin', async () => {
    const page = await browser.newPage()
    const refused: string[] = []
    page.on('console', (message) => {
      if (/Content Security Policy|Refused to/i.test(message.text())) refused.push(message.text())
    })
    page.on('pageerror', (error) => refused.push(error.message))
    await page.goto(`${origins.studio}/`)
    await expect
      .poll(() => page.locator('#status').textContent(), { timeout: 60_000 })
      .toBe('Up to date')
    await expect.poll(() => frameAt(page, '/admin'), { timeout: 30_000 }).toBeDefined()
    const sandbox = frameAt(page, '/sandbox.html') as Frame
    const admin = frameAt(page, '/admin') as Frame
    expect(new URL(sandbox.url()).origin).toBe(origins.sandbox)
    expect(new URL(admin.url()).origin).toBe(origins.sandbox)
    await admin.goto(`${origins.sandbox}/admin/collections/posts`)
    await admin.getByText('Getting started with Easy CMS').first().waitFor({ timeout: 30_000 })
    expect(refused).toEqual([])
  })

  it('counts taking a config into a project, and sends nothing of the config', async () => {
    const page = await browser.newPage()
    await page.goto(`${origins.studio}/`)
    await expect
      .poll(() => page.locator('#status').textContent(), { timeout: 60_000 })
      .toBe('Up to date')
    await page.locator('#export').click()
    await page.locator('#copy-command').click()
    await expect.poll(() => events, { timeout: 10_000 }).toContain('studio-copy-command')
    expect(events.every((event) => /^studio-[a-z-]+$/.test(event))).toBe(true)
  })

  it('refuses to be framed by anyone else', async () => {
    const page = await browser.newPage()
    // A page on another origin framing the sandbox directly: the browser shows an error page.
    await page.route('http://elsewhere.localhost/', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<iframe src="${origins.sandbox}/sandbox.html"></iframe>`,
      }),
    )
    await page.goto('http://elsewhere.localhost/')
    await expect
      .poll(() => page.frames()[1]?.url(), { timeout: 10_000 })
      .toBe('chrome-error://chromewebdata/')
  })
})
