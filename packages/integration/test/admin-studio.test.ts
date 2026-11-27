import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, extname, join } from 'node:path'
import { renderShell } from '@easy-cms/admin/shell'
import { type Config, createEasyCMS, createRestHandler, silentLogger } from '@easy-cms/core'
import { dropMemoryDatabase, memory } from '@easy-cms/db-memory'
import { type Browser, chromium, type Frame, type Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DIALECT, SECRET } from './helpers.js'

// The admin in Studio mode (ADR-0074), laid out as Studio will be: a page at studio.test frames
// the static admin at sandbox.test, whose API (Studio's Service Worker, here Playwright's routes)
// answers from a CMS on the in-memory database and signs every request in with a bearer token.
// When the config changes, the CMS starts again on the same database and the page posts a reload.

const STUDIO = 'https://studio.test'
const SANDBOX = 'https://sandbox.test'
const APP_DIR = dirname(createRequire(import.meta.url).resolve('@easy-cms/admin/app/shell.html'))
const TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
}
const ADMIN = { email: 'admin@studio.test', password: 'password123' }

const configWith = (fields: NonNullable<Config['collections']>[number]['fields']): Config => ({
  secret: SECRET,
  db: memory({ name: 'admin-studio' }),
  collections: [{ slug: 'posts', fields }],
})

type Cms = Awaited<ReturnType<typeof createEasyCMS>>
let cms: Cms
let token = ''
let browser: Browser | undefined
// Not about the database: once, in the SQLite project.
const once = DIALECT === 'sqlite'

/** Starts the CMS on the shared in-memory database, as Studio does after each edit. */
async function start(config: Config) {
  await cms?.destroy()
  cms = await createEasyCMS(config, { logger: silentLogger })
  if (!token) {
    await cms.create('users', { ...ADMIN, role: 'admin' })
    token = (await cms.auth.login(ADMIN)).token
  }
}

beforeAll(async () => {
  if (!once) return
  await start(configWith([{ name: 'title', type: 'text', required: true }]))
  browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
})

afterAll(async () => {
  await browser?.close()
  await cms?.destroy()
  await dropMemoryDatabase('admin-studio')
})

/** Studio's page with the admin framed at `path`; messages from the admin are kept in `seen`. */
async function studio(path: string): Promise<{ page: Page; frame: () => Frame }> {
  const page = await (browser as Browser).newPage()
  await page.route(`${STUDIO}/**`, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><title>Studio</title>
        <script>
          window.seen = []
          addEventListener('message', (e) => { if (e.origin === '${SANDBOX}') seen.push(e.data.type) })
        </script>
        <iframe src="${SANDBOX}/admin${path}" style="width:1200px;height:800px"></iframe>`,
    }),
  )
  await page.route(`${SANDBOX}/admin/**`, async (route) => {
    const { pathname } = new URL(route.request().url())
    const file = pathname.slice('/admin/'.length)
    if (extname(file) && !file.endsWith('.html')) {
      const body = await readFile(join(APP_DIR, file)).catch(() => undefined)
      if (body) return route.fulfill({ body, contentType: TYPES[extname(file)] ?? '' })
      return route.fulfill({ status: 404 })
    }
    const shell = await readFile(join(APP_DIR, 'shell.html'), 'utf8')
    return route.fulfill({
      contentType: 'text/html',
      body: renderShell(shell, { studio: { origin: STUDIO } }),
    })
  })
  await page.route(`${SANDBOX}/api/cms/**`, async (route) => {
    const request = route.request()
    const headers = new Headers(await request.allHeaders())
    headers.delete('cookie')
    headers.set('authorization', `Bearer ${token}`)
    const body = request.postDataBuffer()
    const response = await createRestHandler(cms)(
      new Request(request.url(), {
        method: request.method(),
        headers,
        ...(body && request.method() !== 'GET' ? { body: new Uint8Array(body) } : {}),
      }),
    )
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: Buffer.from(await response.arrayBuffer()),
    })
  })
  await page.goto(`${STUDIO}/`)
  return { page, frame: () => page.frames().find((f) => f.url().startsWith(SANDBOX)) as Frame }
}

/** The page's globals, typed (this package's types have no DOM). */
interface PageGlobals {
  seen: string[]
  kept?: boolean
  postMessage(message: unknown, origin: string): void
  document: {
    querySelector(selector: string): { contentWindow: PageGlobals | null } | null
  }
}
const seen = (page: Page) => page.evaluate(() => (globalThis as unknown as PageGlobals).seen)
const reload = (page: Page) =>
  page.evaluate((origin) => {
    const { document } = globalThis as unknown as PageGlobals
    document
      .querySelector('iframe')
      ?.contentWindow?.postMessage({ type: 'easy-cms:reload' }, origin)
  }, SANDBOX)

describe.runIf(once)('the admin in Studio mode', () => {
  it('opens signed in, and shows a new field after a reload, without reloading the page', async () => {
    const { page, frame } = await studio('/collections/posts/new')
    await expect.poll(() => seen(page)).toContain('easy-cms:ready')
    await frame().getByLabel('Title').waitFor()
    expect(await frame().getByLabel('Subtitle').count()).toBe(0)
    // Gone if the frame loads again.
    await frame().evaluate(() => {
      ;(globalThis as unknown as PageGlobals).kept = true
    })

    await start(
      configWith([
        { name: 'title', type: 'text', required: true },
        { name: 'subtitle', type: 'text' },
      ]),
    )
    await reload(page)
    await frame().getByLabel('Subtitle').waitFor()
    await expect.poll(() => seen(page)).toContain('easy-cms:reloaded')
    expect(frame().url()).toBe(`${SANDBOX}/admin/collections/posts/new`)
    expect(await frame().evaluate(() => (globalThis as unknown as PageGlobals).kept)).toBe(true)
    await page.close()
  })

  it('takes reloads only from the framing page', async () => {
    const { page, frame } = await studio('/collections/posts')
    await expect.poll(() => seen(page)).toContain('easy-cms:ready')
    // From the admin's own window, not its parent: ignored.
    await frame().evaluate(() =>
      (globalThis as unknown as PageGlobals).postMessage({ type: 'easy-cms:reload' }, '*'),
    )
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(await seen(page)).not.toContain('easy-cms:reloaded')
    await page.close()
  })
})
