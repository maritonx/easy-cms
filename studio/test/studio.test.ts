import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { run } from 'create-easy-cms'
import { decodeStudioLink } from 'create-easy-cms/studio-link'
import { type Browser, chromium, type Frame, type Page } from 'playwright-core'
import { build, type PreviewServer, preview } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Studio, built here (CI runs tests without the build task), in headless Chrome: the editor frames
// the sandbox, which runs the CMS on the in-memory database and frames the admin (ADR-0074).

let server: PreviewServer
let browser: Browser
let base = ''

beforeAll(async () => {
  const root = resolve(import.meta.dirname, '..')
  const outDir = join(root, 'test/.tmp/studio')
  await build({ root, logLevel: 'error', build: { outDir, emptyOutDir: true } })
  server = await preview({ root, build: { outDir }, preview: { port: 0 } })
  base = server.resolvedUrls?.local[0]?.replace(/\/$/, '') ?? ''
  browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
})

afterAll(async () => {
  await browser?.close()
  await new Promise<void>((done) => server?.httpServer.close(() => done()))
})

/** The page's globals this test uses (its types have no DOM). */
interface Studio {
  studio: {
    getCode(): string
    setCode(code: string): void
    shareLink(): Promise<string>
    createCommand(): Promise<string>
  }
}

const admin = (page: Page): Frame | undefined =>
  page.frames().find((frame) => new URL(frame.url()).pathname.startsWith('/admin'))
async function adminFrame(page: Page): Promise<Frame> {
  await expect.poll(() => admin(page), { timeout: 60_000 }).toBeDefined()
  return admin(page) as Frame
}
const status = (page: Page) => page.locator('#status')
const setCode = (page: Page, code: string) =>
  page.evaluate((c) => (globalThis as unknown as Studio).studio.setCode(c), code)
const getCode = (page: Page) =>
  page.evaluate(() => (globalThis as unknown as Studio).studio.getCode())

describe('Studio', () => {
  let page: Page

  it('opens the Blog template with its admin signed in and sample posts', async () => {
    page = await browser.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`${base}/`)
    await expect.poll(() => status(page).textContent(), { timeout: 60_000 }).toBe('Up to date')
    const frame = await adminFrame(page)
    await frame.goto(`${new URL(frame.url()).origin}/admin/collections/posts`)
    await frame.getByText('Getting started with Easy CMS').first().waitFor({ timeout: 30_000 })
    expect(errors).toEqual([])
  })

  it('shows a field added in the code, and saves a document with it', async () => {
    const code = await getCode(page)
    await setCode(
      page,
      code.replace(
        "{ name: 'excerpt', type: 'textarea' },",
        "{ name: 'excerpt', type: 'textarea' },\n        { name: 'subtitle', type: 'text' },",
      ),
    )
    await expect.poll(() => status(page).textContent(), { timeout: 60_000 }).toBe('Up to date')
    const frame = await adminFrame(page)
    await frame.goto(`${new URL(frame.url()).origin}/admin/collections/posts/new`)
    await frame.getByLabel('Subtitle', { exact: true }).waitFor({ timeout: 30_000 })
    await frame.getByLabel('Title', { exact: true }).first().fill('Made in Studio')
    await frame.getByLabel('Subtitle', { exact: true }).fill('With a new field')
    await frame
      .getByRole('button', { name: /^(Save|Save draft|Publish)/ })
      .first()
      .click()
    await frame.waitForURL(/\/admin\/collections\/posts\/\d+/, { timeout: 30_000 })
    await frame.goto(`${new URL(frame.url()).origin}/admin/collections/posts`)
    await frame.getByText('Made in Studio').first().waitFor({ timeout: 30_000 })
  })

  it('shares a link that opens the same config, and create-easy-cms writes it', async () => {
    const code = await getCode(page)
    const link = await page.evaluate(() => (globalThis as unknown as Studio).studio.shareLink())
    expect((await decodeStudioLink(link)).code).toBe(code)
    // The address holds the link too, once the pause after the edit is over.
    await expect.poll(() => page.url()).toBe(link)
    const command = await page.evaluate(() =>
      (globalThis as unknown as Studio).studio.createCommand(),
    )
    expect(command).toBe(`npm create easy-cms@latest -- --from "${link}"`)

    // Opened elsewhere (another browser has no draft of it): the same config, running.
    const other = await browser.newContext()
    const shared = await other.newPage()
    await shared.goto(link)
    await expect.poll(() => status(shared).textContent(), { timeout: 60_000 }).toBe('Up to date')
    expect(await getCode(shared)).toBe(code)
    await other.close()

    // And into a project.
    const dir = mkdtempSync(join(tmpdir(), 'studio-export-'))
    try {
      const out: string[] = []
      const exit = await run([dir, '--standalone', '--skip-install', '--from', link], {
        out: (line) => out.push(line),
        err: (line) => out.push(line),
        interactive: false,
      })
      expect(exit, out.join('\n')).toBe(0)
      expect(readFileSync(join(dir, 'easy-cms.config.ts'), 'utf8')).toBe(
        code.endsWith('\n') ? code : `${code}\n`,
      )
      expect(out.join('\n')).toContain('@easy-cms/plugin-seo')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('shows an error and keeps the last admin when the config is wrong', async () => {
    const before = admin(page)?.url()
    await setCode(page, `${await getCode(page)}\nconst broken = ;\n`)
    await expect.poll(() => page.locator('#error').isVisible(), { timeout: 30_000 }).toBe(true)
    expect(await page.locator('#error').textContent()).toMatch(/Line \d+/)
    expect(await status(page).textContent()).toMatch(/^Error/)
    expect(admin(page)?.url()).toBe(before)
    await (await adminFrame(page)).getByText('Made in Studio').first().waitFor()
  })
})
