import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { run } from 'create-easy-cms'
import { decodeStudioLink } from 'create-easy-cms/studio-link'
import { type Browser, chromium, type Frame, type Page } from 'playwright-core'
import { build, type PreviewServer, preview } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SAMPLES } from '../src/templates/samples.ts'

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

  it('shows the admin full screen and back, keeping what is in it', async () => {
    const frame = await adminFrame(page)
    await frame.goto(`${new URL(frame.url()).origin}/admin/collections/posts`)
    await frame.getByText('Made in Studio').first().waitFor({ timeout: 30_000 })
    // Gone if the frame loads again.
    await frame.evaluate(() => {
      ;(globalThis as unknown as { kept: boolean }).kept = true
    })
    const width = async () => (await page.locator('#sandbox').boundingBox())?.width ?? 0
    const before = await width()
    const button = page.locator('#full-screen')

    await button.click()
    expect(await button.getAttribute('aria-pressed')).toBe('true')
    expect(await button.textContent()).toContain('Show code')
    expect(await page.locator('.code').isVisible()).toBe(false)
    const viewport = page.viewportSize()?.width ?? 0
    await expect.poll(width).toBeGreaterThan(before)
    expect(await width()).toBeGreaterThanOrEqual(viewport - 2)
    const same = admin(page) as Frame
    expect(await same.evaluate(() => (globalThis as unknown as { kept?: boolean }).kept)).toBe(true)
    await same.getByText('Made in Studio').first().waitFor()

    // Back with the shortcut, from outside the admin.
    await page.locator('.bar').click({ position: { x: 5, y: 5 } })
    await page.keyboard.press('ControlOrMeta+Backslash')
    expect(await button.getAttribute('aria-pressed')).toBe('false')
    expect(await page.locator('.code').isVisible()).toBe(true)
    await expect.poll(width).toBeCloseTo(before, -1)
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

describe('Templates', () => {
  let page: Page

  const pick = async (id: string) => {
    await page.locator('#templates-open').click()
    await page.locator(`#templates [data-template="${id}"]`).click()
  }
  const samplesOf = (id: string) =>
    Object.values(SAMPLES[id] ?? {}).reduce((sum, docs) => sum + docs.length, 0)
  const consoleText = () => page.locator('#console-lines').textContent()

  it('picks Shop from the dialog: its code, and its sample products in the admin', async () => {
    page = await (await browser.newContext()).newPage()
    await page.goto(`${base}/`)
    await expect.poll(() => status(page).textContent(), { timeout: 60_000 }).toBe('Up to date')
    await page.locator('#templates-open').click()
    expect(await page.locator('#templates').isVisible()).toBe(true)
    expect(await page.locator('#template-list button').count()).toBe(10)
    expect(
      await page
        .locator('#template-list button[aria-current="true"]')
        .getAttribute('data-template'),
    ).toBe('blog')
    await page.locator('#templates [data-template="shop"]').click()
    expect(await page.locator('#templates').isVisible()).toBe(false)
    expect(await getCode(page)).toContain("slug: 'orders'")
    await expect
      .poll(consoleText, { timeout: 60_000 })
      .toContain(`Added ${samplesOf('shop')} sample documents.`)
    const frame = await adminFrame(page)
    await frame.goto(`${new URL(frame.url()).origin}/admin/collections/products`)
    await frame.getByText('Doi Chang single origin').first().waitFor({ timeout: 30_000 })
    // Only Shop's documents: the Blog's went with the database.
    await frame.goto(`${new URL(frame.url()).origin}/admin`)
    expect(await frame.getByText('Getting started with Easy CMS').count()).toBe(0)
    // Its link keeps the template, for the samples.
    await expect.poll(() => page.url()).toMatch(/&t=shop$/)
  })

  it('asks before replacing code that was changed, offering to copy it first', async () => {
    const changed = (await getCode(page)).replace("slug: 'orders'", "slug: 'sales'")
    await setCode(page, changed)
    const ask = page.locator('#ask')
    await pick('crm')
    expect(await ask.isVisible()).toBe(true)
    expect(await page.locator('#ask-title').textContent()).toBe('Replace your code with CRM?')
    expect(await page.locator('#ask-extra').textContent()).toBe('Copy my code first')
    // Cancel is where focus goes: Enter keeps the code.
    expect(
      await page.evaluate(
        () =>
          (globalThis as unknown as { document: { activeElement: { id: string } } }).document
            .activeElement.id,
      ),
    ).toBe('ask-cancel')
    await page.locator('#ask-cancel').click()
    expect(await ask.isVisible()).toBe(false)
    expect(await getCode(page)).toBe(changed)
    await page.keyboard.press('Escape')

    await pick('crm')
    await page.locator('#ask-confirm').click()
    await expect.poll(() => getCode(page)).toContain("slug: 'deals'")
    await expect.poll(() => status(page).textContent(), { timeout: 60_000 }).toBe('Up to date')
  })

  it('opens the template a link names (?template=crm)', async () => {
    const other = await browser.newContext()
    const named = await other.newPage()
    await named.goto(`${base}/?template=crm`)
    await expect.poll(() => status(named).textContent(), { timeout: 60_000 }).toBe('Up to date')
    expect(await getCode(named)).toContain("slug: 'deals'")
    const frame = await adminFrame(named)
    await frame.goto(`${new URL(frame.url()).origin}/admin/collections/deals`)
    await frame.getByText('Online store rebuild').first().waitFor({ timeout: 30_000 })
    await other.close()
  })

  it('starts every template with all of its sample documents', async () => {
    // Every template in the dialog has samples of its own.
    await page.locator('#templates-open').click()
    const ids = await page
      .locator('#template-list button')
      .evaluateAll((buttons) =>
        buttons.map((b) => (b as unknown as { dataset: { template: string } }).dataset.template),
      )
    await page.keyboard.press('Escape')
    expect([...ids].sort()).toEqual(Object.keys(SAMPLES).sort())
    for (const id of ids) {
      // Inside the closed console: no need to open it.
      await page.locator('#console-clear').dispatchEvent('click')
      await pick(id)
      await expect
        .poll(consoleText, { timeout: 60_000, message: id })
        .toContain(`Added ${samplesOf(id)} sample documents.`)
      expect(await consoleText(), id).not.toContain('Sample documents:')
      await expect.poll(() => status(page).textContent(), { timeout: 60_000 }).toBe('Up to date')
    }
  })
})

describe('Workspace', () => {
  let page: Page
  /** The theme a page set on its root (`data-theme`), if any. */
  const themeOf = (target: Page | Frame) =>
    target.evaluate(
      () =>
        (
          globalThis as unknown as {
            document: { documentElement: { dataset: { theme?: string } } }
          }
        ).document.documentElement.dataset.theme,
    )

  it('opens the admin without the setup notices a deployment needs', async () => {
    page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
    await page.goto(`${base}/`)
    await expect.poll(() => status(page).textContent(), { timeout: 60_000 }).toBe('Up to date')
    const frame = await adminFrame(page)
    await frame.getByText('Getting started with Easy CMS').first().waitFor({ timeout: 30_000 })
    expect(await frame.getByText('Email is not set up').count()).toBe(0)
  })

  it('switches the theme for Studio, the editor and the admin, and remembers it', async () => {
    const button = page.locator('#theme')
    expect(await button.getAttribute('aria-label')).toBe('Theme: System')
    await button.click()
    await button.click()
    expect(await button.getAttribute('aria-label')).toBe('Theme: Dark')
    expect(await themeOf(page)).toBe('dark')
    expect(await page.locator('.monaco-editor').getAttribute('class')).toContain('vs-dark')
    const frame = await adminFrame(page)
    await expect.poll(() => themeOf(frame)).toBe('dark')

    // A reload keeps it; the admin, framed afresh, gets it too.
    await page.reload()
    await expect.poll(() => status(page).textContent(), { timeout: 60_000 }).toBe('Up to date')
    expect(await page.locator('#theme').getAttribute('aria-label')).toBe('Theme: Dark')
    const again = await adminFrame(page)
    await expect.poll(() => themeOf(again), { timeout: 30_000 }).toBe('dark')

    await page.locator('#theme').click()
    expect(await page.locator('#theme').getAttribute('aria-label')).toBe('Theme: System')
    expect(await themeOf(page)).toBeUndefined()
  })

  it('counts type problems the config still runs with, and goes to the first', async () => {
    const problems = page.locator('#problems')
    expect(await problems.isHidden()).toBe(true)
    await setCode(page, `const port: number = '3000'\n${await getCode(page)}`)
    await expect
      .poll(() => problems.getAttribute('aria-label'), { timeout: 30_000 })
      .toBe('1 type problem')
    expect(await problems.getAttribute('title')).toMatch(/^1 type problem\. Line 1: /)
    await expect.poll(() => status(page).textContent(), { timeout: 60_000 }).toBe('Up to date')
    await problems.click()
    await setCode(page, (await getCode(page)).replace("const port: number = '3000'\n", ''))
    await expect.poll(() => problems.isHidden(), { timeout: 30_000 }).toBe(true)
  })

  it('resizes the code with the divider, by keyboard too, and remembers the width', async () => {
    const width = async () => (await page.locator('#code').boundingBox())?.width ?? 0
    const before = await width()
    const divider = page.locator('#divider')
    await divider.focus()
    await page.keyboard.press('Shift+ArrowRight')
    expect(await width()).toBeCloseTo(before + 96, -1)
    expect(Number(await divider.getAttribute('aria-valuenow'))).toBeCloseTo(before + 96, -1)

    const box = (await divider.boundingBox()) as { x: number; y: number; width: number }
    await page.mouse.move(box.x + box.width / 2, box.y + 200)
    await page.mouse.down()
    await page.mouse.move(400, box.y + 200, { steps: 5 })
    await page.mouse.up()
    expect(await width()).toBeCloseTo(400, -1)

    await page.reload()
    await expect.poll(() => status(page).textContent(), { timeout: 60_000 }).toBe('Up to date')
    expect(await width()).toBeCloseTo(400, -1)
    await page.locator('#divider').dblclick()
    expect(await width()).toBeCloseTo(before, -1)
  })

  it('resets the sample data, keeping the code', async () => {
    const code = await getCode(page)
    await page.locator('#console-clear').dispatchEvent('click')
    await page.locator('#reset-data').click()
    expect(await page.locator('#ask-title').textContent()).toBe('Reset the sample data?')
    await page.locator('#ask-confirm').click()
    // Samples only go into empty collections: all of them again means the data went.
    await expect
      .poll(() => page.locator('#console-lines').textContent(), { timeout: 60_000 })
      .toContain(`Added ${Object.values(SAMPLES.blog ?? {}).flat().length} sample documents.`)
    expect(await getCode(page)).toBe(code)
  })

  it('copies the share link with Cmd/Ctrl+S instead of saving the page', async () => {
    const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] })
    const other = await context.newPage()
    await other.goto(`${base}/`)
    await expect.poll(() => status(other).textContent(), { timeout: 60_000 }).toBe('Up to date')
    await other.locator('.bar').click({ position: { x: 5, y: 5 } })
    await other.keyboard.press('ControlOrMeta+KeyS')
    await expect.poll(() => other.locator('#share').textContent()).toBe('Copied')
    const link = await other.evaluate(() => (globalThis as unknown as Studio).studio.shareLink())
    const copied = await other.evaluate(() =>
      (
        globalThis as unknown as { navigator: { clipboard: { readText(): Promise<string> } } }
      ).navigator.clipboard.readText(),
    )
    expect(copied).toBe(link)
    await expect
      .poll(() => other.locator('#share').textContent(), { timeout: 5_000 })
      .toBe('Share link')
    await context.close()
  })
})

describe('First visit, phones and sharing', () => {
  it('shows a tip on the first visit, and not again once closed', async () => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto(`${base}/`)
    await expect.poll(() => status(page).textContent(), { timeout: 60_000 }).toBe('Up to date')
    expect(await page.locator('#hint').isVisible()).toBe(true)
    await page.locator('#hint-close').click()
    expect(await page.locator('#hint').isVisible()).toBe(false)
    await page.reload()
    await expect.poll(() => status(page).textContent(), { timeout: 60_000 }).toBe('Up to date')
    expect(await page.locator('#hint').isVisible()).toBe(false)
    await context.close()
  })

  it('lets a phone pick a template, without the editing buttons', async () => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
    const page = await context.newPage()
    await page.goto(`${base}/`)
    await expect.poll(() => status(page).textContent(), { timeout: 60_000 }).toBe('Up to date')
    for (const id of ['#share', '#export', '#full-screen'])
      expect(await page.locator(id).isVisible(), id).toBe(false)
    expect(await page.locator('#theme').isVisible()).toBe(true)
    await page.locator('#templates-open').click()
    await page.locator('#templates [data-template="shop"]').click()
    const frame = await adminFrame(page)
    await expect.poll(() => frame.url(), { timeout: 30_000 }).toContain('/admin')
    await frame.goto(`${new URL(frame.url()).origin}/admin/collections/products`)
    await frame.getByText('Doi Chang single origin').first().waitFor({ timeout: 60_000 })
    await context.close()
  })

  it('has an icon and a share card with its image', async () => {
    const html = await (await fetch(`${base}/`)).text()
    expect(html).toContain('<link rel="icon" href="/favicon.svg"')
    expect(html).toMatch(/<meta property="og:image" content="https:\/\/[^"]+\/og\.png">/)
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">')
    for (const [path, type] of [
      ['/og.png', 'image/png'],
      ['/favicon.svg', 'image/svg+xml'],
      ['/apple-touch-icon.png', 'image/png'],
    ] as const) {
      const response = await fetch(`${base}${path}`)
      expect(response.status, path).toBe(200)
      expect(response.headers.get('content-type'), path).toContain(type)
    }
    // The sandbox page is no one's to share.
    expect(await (await fetch(`${base}/sandbox.html`)).text()).not.toContain('og:image')
  })
})
