import { createHash, createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, type Page, type Route, test } from '@playwright/test'
import sharp from 'sharp'

const ADMIN = { email: 'admin@e2e.test', password: 'admin-password-1' }
const EDITOR = { email: 'editor@e2e.test', password: 'editor-password-1' }
const SHOTS = process.env.E2E_SCREENSHOTS
const PHOTO = fileURLToPath(new URL('../fixtures/photo.png', import.meta.url))

// Tests build on each other: the first creates the admin, later ones use its content.
test.describe.configure({ mode: 'serial' })

// Any uncaught error in the page fails the test.
let pageErrors: string[] = []
test.beforeEach(({ page }) => {
  pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
})
test.afterEach(() => {
  expect(pageErrors, 'uncaught errors in the page').toEqual([])
})

async function english(page: Page) {
  await page.addInitScript(() => localStorage.setItem('easy-cms-locale', 'en'))
}

/** The dashboard's heading. */
const GREETING = /^Good (morning|afternoon|evening)/

async function login(page: Page, user: { email: string; password: string }) {
  await page.goto('/admin/login')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('heading', { level: 1, name: GREETING })).toBeVisible()
}

/**
 * Opens the app's public site: the example blog for Nuxt and Next, and for the standalone server
 * its frontend example on another origin, which reads the API from the browser (CORS).
 */
/** Opens a page from the menu: its group's icon in the rail, then the item in the panel. */
async function fromMenu(page: Page, group: string, name: string, exact = false) {
  const menu = page.getByRole('navigation', { name: 'Main menu' })
  await menu.getByRole('button', { name: group, exact: true }).click()
  await menu.getByRole('link', { name, exact }).click()
}

/** Opens the Account page from the account menu, at the foot of the rail. */
async function openAccount(page: Page) {
  await page.getByRole('button', { name: 'Account', exact: true }).click()
  await page.getByRole('link', { name: 'Account', exact: true }).click()
}

/** Logs out from the account menu, at the foot of the rail. */
async function logOut(page: Page) {
  await page.getByRole('button', { name: 'Account', exact: true }).click()
  await page.getByRole('button', { name: 'Log out' }).click()
}

async function publicSite(page: Page) {
  if (standalone()) {
    const api = new URL('/api/cms', test.info().project.use.baseURL).href
    await page.goto(`http://localhost:3103/?api=${encodeURIComponent(api)}`)
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('…')
  } else {
    await page.goto('/')
  }
}

const standalone = () => test.info().project.name === 'standalone'

/** A status badge in the editor header (the history panel has badges too). */
/** A status badge next to the document's title. */
const badge = (page: Page, text: string) =>
  page.locator('.editor-header .title-row').getByText(text, { exact: true })

/**
 * A password link's token, signed like the CMS does with the e2e secret: only for accounts
 * without a password (an invitation), whose fingerprint is known.
 */
/**
 * Holds the admin's API requests matching `url` until `release()`, so a test can see what a
 * screen shows while it waits for data. Later requests go straight through.
 */
async function hold(page: Page, url: RegExp) {
  let open!: () => void
  const released = new Promise<void>((resolve) => {
    open = resolve
  })
  await page.route(url, async (route: Route) => {
    await released
    await route.fallback()
  })
  return { release: () => open() }
}

function passwordToken(userId: string, purpose: 'invite' | 'reset') {
  const payload = Buffer.from(
    JSON.stringify({ u: userId, p: purpose, e: Date.now() + 3_600_000 }),
  ).toString('base64url')
  const fingerprint = createHash('sha256').update('no-password').digest('base64url').slice(0, 22)
  const signature = createHmac('sha256', E2E_SECRET)
    .update(`password:${payload}:${fingerprint}`)
    .digest('base64url')
  return `${payload}.${signature}`
}
/** The secret in playwright.config.ts. */
const E2E_SECRET = '3f9c1e7a52b84d06a1c9e3f7b25d8c4e'

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true })
}

test('shows Thai by default and asks for the first admin (FR-ADM-02, FR-ADM-11)', async ({
  page,
}, testInfo) => {
  // The suite is serial, so a retry starts here again; the admin made by the first attempt is
  // still there, and the setup page is gone. Skip, so the retry reports the test that failed.
  test.skip(testInfo.retry > 0, 'The first attempt made the admin')
  await page.goto('/admin/')
  await expect(page).toHaveURL(/\/admin\/setup$/)
  await expect(page.getByRole('heading', { name: 'สร้างผู้ดูแลระบบคนแรก' })).toBeVisible()
  await shot(page, '01-setup-th')

  await page.getByRole('button', { name: 'English' }).click()
  await expect(page.getByRole('heading', { name: 'Create the first admin' })).toBeVisible()
  await page.getByLabel('Name').fill('Ada Admin')
  await page.getByLabel('Email').fill(ADMIN.email)
  await page.getByLabel('Password').fill(ADMIN.password)
  await page.getByRole('button', { name: 'Create admin' }).click()
  // The dashboard greets the user by name.
  await expect(page.getByRole('heading', { level: 1, name: GREETING })).toHaveText(/, Ada Admin$/)
  await shot(page, '02-dashboard')
})

test.describe('logged in as admin', () => {
  test.beforeEach(async ({ page }) => {
    await english(page)
    await login(page, ADMIN)
  })

  test('redirects to login after logout and rejects a wrong password (FR-ADM-01)', async ({
    page,
  }) => {
    await logOut(page)
    await expect(page).toHaveURL(/\/admin\/login$/)
    await page.goto('/admin/collections/posts')
    await expect(page).toHaveURL(/\/admin\/login\?redirect=/)
    await page.getByLabel('Email').fill(ADMIN.email)
    await page.getByLabel('Password').fill('wrong password')
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page.getByRole('alert')).toHaveText('Invalid email or password')
    await page.getByLabel('Password').fill(ADMIN.password)
    await page.getByRole('button', { name: 'Log in' }).click()
    // Back where we were going.
    await expect(page.getByRole('heading', { name: 'Posts' })).toBeVisible()
  })

  test('asks before logging out of unsaved changes, and stays logged in on cancel', async ({
    page,
  }) => {
    const signedIn = async () =>
      Boolean((await (await page.request.get('/api/cms/auth/me')).json()).user)
    await page.goto('/admin/collections/posts/new')
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Not saved yet')
    // Cancel: still on the page, still logged in, the text still there.
    page.once('dialog', (dialog) => void dialog.dismiss())
    await logOut(page)
    await expect(page).toHaveURL(/\/collections\/posts\/new$/)
    await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue(
      'Not saved yet',
    )
    expect(await signedIn()).toBe(true)
    // Leave: logged out, on the login page.
    page.once('dialog', (dialog) => void dialog.accept())
    await logOut(page)
    await expect(page).toHaveURL(/\/admin\/login$/)
    expect(await signedIn()).toBe(false)
  })

  test('shows collections and globals in the sidebar (FR-ADM-03)', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Main' })
    const groups = {
      Home: ['Media'],
      Content: ['Categories', 'Posts'],
      Settings: ['Users', 'Site'],
    }
    for (const [group, names] of Object.entries(groups)) {
      await nav.getByRole('button', { name: group, exact: true }).click()
      for (const name of names) {
        await expect(nav.getByRole('link', { name, exact: true })).toBeVisible()
      }
    }
  })

  test('creates documents with every kind of input (FR-ADM-05/06/07/10, FR-RTX)', async ({
    page,
  }) => {
    // A category to relate to.
    await page.goto('/admin/collections/categories/new')
    await page.getByLabel('Name').fill('Guides')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status')).toHaveText('Created')

    await page.goto('/admin/collections/posts')
    await page.getByRole('link', { name: 'Create new' }).click()
    await expect(page.getByRole('heading', { name: 'Create Post' })).toBeVisible()

    // Server-side validation errors appear on the field.
    await page.getByRole('button', { name: 'Publish', exact: true }).click()
    await expect(page.getByRole('status')).toHaveText('Please fix the highlighted fields.')
    const title = page.getByRole('textbox', { name: 'Title', exact: true })
    await expect(title).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByText('is required', { exact: true })).toBeVisible()
    // The summary at the top lists it, and takes focus.
    const summary = page.getByRole('alert').filter({ hasText: 'Fix 1 field(s) before saving' })
    await expect(summary).toBeFocused()
    await expect(summary.getByRole('link', { name: 'Title' })).toBeVisible()
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('x')
    await expect(page.getByText('is required', { exact: true })).toHaveCount(0)
    await expect(summary).toHaveCount(0)

    await title.fill('Hello from Playwright')
    await page.getByLabel('Excerpt').fill('Written by an end-to-end test.')

    // Rich text: type, then bold a word with the toolbar.
    const editor = page.locator('.rte-content')
    await editor.click()
    await page.keyboard.type('Rich ')
    await page.getByRole('button', { name: 'Bold' }).click()
    await page.keyboard.type('bold')
    await page.getByRole('button', { name: 'Bold' }).click()
    await page.keyboard.type(' text.')
    await expect(editor.locator('strong')).toHaveText('bold')

    // Relationship picker: search and choose. While the search is under way it says so,
    // not "No matches" (#145).
    const categories = await hold(page, /\/categories\?/)
    await page.getByLabel('Category', { exact: true }).fill('Gui')
    await expect(page.getByRole('listbox').getByRole('status')).toHaveText('Loading…')
    await expect(page.getByRole('listbox')).not.toContainText('No matches')
    categories.release()
    await page.getByRole('option', { name: 'Guides' }).click()
    await expect(page.getByRole('link', { name: 'Guides' })).toBeVisible()

    await page.getByRole('checkbox', { name: 'nuxt' }).check()
    await page.getByRole('checkbox', { name: 'thai' }).check()
    await page.getByLabel('Published at').fill('2026-09-01T10:30')
    await shot(page, '03-post-form')

    await page.getByRole('button', { name: 'Publish', exact: true }).click()
    await expect(page.getByRole('status')).toHaveText('Created')
    await expect(page).toHaveURL(/\/admin\/collections\/posts\/\d+$/)
    await expect(badge(page, 'Published')).toBeVisible()
    await expect(page.getByLabel('Slug')).toHaveValue('hello-from-playwright')

    // Reload: everything was stored.
    await page.reload()
    await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue(
      'Hello from Playwright',
    )
    await expect(page.locator('.rte-content strong')).toHaveText('bold')
    await expect(page.getByRole('link', { name: 'Guides' })).toBeVisible()
    await expect(page.getByRole('checkbox', { name: 'thai' })).toBeChecked()

    // The public site shows it.
    await publicSite(page)
    await expect(page.getByRole('link', { name: 'Hello from Playwright' })).toBeVisible()
  })

  test('saves drafts that the public site does not show (FR-ADM-07)', async ({ page }) => {
    await page.goto('/admin/collections/posts/new')
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Secret draft')
    await page.getByRole('button', { name: 'Save draft' }).click()
    await expect(page.getByRole('status')).toHaveText('Created')
    await expect(badge(page, 'Draft')).toBeVisible()
    await publicSite(page)
    await expect(page.getByText('Secret draft')).toHaveCount(0)
  })

  test('uploads to the media library and uses a file as a cover (FR-UPL, FR-ADM-09)', async ({
    page,
  }) => {
    await fromMenu(page, 'Home', 'Media')
    await page.getByLabel('Upload files').setInputFiles(PHOTO)
    await expect(page.getByText('Uploaded 1 file(s)')).toBeVisible()
    // The library is a grid of cards.
    const row = page.locator('.media-card').filter({ hasText: /photo-[0-9a-f]{8}\.png/ })
    await expect(row.locator('img')).toBeVisible()
    await shot(page, '05-media-library')

    // From a link (upload.fromURL): the server refuses addresses on this machine or network.
    const link = page.getByRole('textbox', { name: 'From a link' })
    await link.fill('http://localhost:9/photo.png')
    await page.getByRole('button', { name: 'Import' }).click()
    await expect(page.getByRole('alert')).toContainText(
      'localhost points to a private network address',
    )
    await expect(link).toHaveValue('')

    // Alt text is editable; file metadata is not.
    await row.getByRole('link').click()
    await expect(page.locator('.thumb.large img')).toBeVisible()
    await expect(page.getByText(/640 × 360 px/)).toBeVisible()
    await page.getByLabel('Alternative text').fill('A green circle')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status')).toHaveText('Saved')

    // Pick it as the cover of the published post.
    await page.goto('/admin/collections/posts?q=Hello')
    await page.getByRole('link', { name: 'Hello from Playwright' }).click()
    // The first upload field is the cover; the SEO plugin's share image comes later.
    // While the library loads, the picker says so instead of claiming it is empty (#145).
    const library = await hold(page, /\/media\?/)
    await page.getByRole('button', { name: 'Choose from media library' }).first().click()
    const picker = page.getByRole('dialog', { name: 'Choose a file' })
    await expect(picker.getByRole('status')).toHaveText('Loading…')
    await expect(picker).not.toContainText('No files yet')
    library.release()
    await picker.getByRole('button', { name: 'A green circle' }).click()
    await expect(picker).toBeHidden()
    await expect(page.getByRole('link', { name: 'A green circle' })).toBeVisible()

    // Insert the same image into the body from the toolbar.
    await page.locator('.rte-content').click()
    await page.keyboard.press('End')
    await page.getByRole('button', { name: 'Image', exact: true }).click()
    await picker.getByRole('button', { name: 'A green circle' }).click()
    await expect(page.locator('.rte-content img')).toHaveAttribute('alt', 'A green circle')
    await shot(page, '06-post-with-media')

    // Posts keep versions: on a live post, Publish updates the site.
    await page.getByRole('button', { name: 'Publish', exact: true }).click()
    await expect(page.getByRole('status')).toHaveText('Saved')

    await publicSite(page)
    const cover = page.getByRole('img', { name: 'A green circle' })
    await expect(cover).toBeVisible()
    await expect(cover).toHaveAttribute('src', /\/api\/cms\/media\/file\/photo-[0-9a-f]{8}\.png$/)
    if (!standalone()) {
      await page.getByRole('link', { name: 'Hello from Playwright' }).click()
      await expect(page.locator('.body img')).toHaveAttribute('alt', 'A green circle')
    }
  })

  test('shows a large image whole on its own page, linking to the original', async ({ page }) => {
    const square = await sharp({
      create: { width: 2400, height: 2400, channels: 3, background: '#2f6f5e' },
    })
      .png()
      .toBuffer()
    await page.goto('/admin/collections/media')
    await page
      .getByLabel('Upload files')
      .setInputFiles({ name: 'square.png', mimeType: 'image/png', buffer: square })
    await expect(page.getByText('Uploaded 1 file(s)')).toBeVisible()
    await page
      .locator('.media-card')
      .filter({ hasText: /square-[0-9a-f]{8}\.png/ })
      .getByRole('link')
      .click()
    const frame = page.locator('.thumb.large')
    const image = frame.locator('img')
    await expect(image).toBeVisible()
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete)).toBe(true)
    // Scaled down to fit: nothing is cut off by the frame.
    const [outer, inner] = await Promise.all([frame.boundingBox(), image.boundingBox()])
    if (!outer || !inner) throw new Error('not laid out')
    expect(inner.width).toBeLessThanOrEqual(outer.width)
    expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height)
    expect(Math.round(inner.width)).toBe(Math.round(inner.height))
    await expect(frame.getByRole('link')).toHaveAttribute('href', /square-[0-9a-f]{8}\.png$/)
  })

  test('adds a gallery of several images and orders them (upload hasMany)', async ({ page }) => {
    await page.goto('/admin/collections/posts?q=Hello')
    await page.getByRole('link', { name: 'Hello from Playwright' }).click()
    await expect(page).toHaveURL(/\/admin\/collections\/posts\/\d+$/)
    const postId = page.url().split('/').pop() as string
    const gallery = page.getByRole('group', { name: 'Gallery' })
    const tiles = gallery.getByRole('listitem')

    // Two files dropped straight into the gallery.
    const photo = readFileSync(PHOTO)
    await gallery.getByLabel('Upload files').setInputFiles([
      { name: 'first.png', mimeType: 'image/png', buffer: photo },
      { name: 'second.png', mimeType: 'image/png', buffer: photo },
    ])
    await expect(tiles).toHaveCount(2)
    await expect(gallery).toContainText('2 / 12')

    // Several more from the library at once (here the one already there).
    await gallery.getByRole('button', { name: 'Choose from media library' }).click()
    const picker = page.getByRole('dialog', { name: 'Choose a file' })
    await picker.getByRole('button', { name: 'A green circle' }).click()
    await expect(picker.getByRole('button', { name: 'A green circle' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await picker.getByRole('button', { name: 'Add 1' }).click()
    await expect(picker).toBeHidden()
    await expect(tiles).toHaveCount(3)

    // Reorder from the keyboard: the green circle first.
    await gallery.getByRole('button', { name: 'Move A green circle earlier' }).click()
    await gallery.getByRole('button', { name: 'Move A green circle earlier' }).click()
    await expect(tiles.first()).toContainText('A green circle')
    await page.getByRole('button', { name: 'Publish', exact: true }).click()
    await expect(page.getByRole('status')).toHaveText('Saved')

    // The site shows the gallery in that order.
    if (standalone()) {
      const api = new URL('/api/cms', test.info().project.use.baseURL).href
      await page.goto(`http://localhost:3103/?post=${postId}&api=${encodeURIComponent(api)}`)
    } else {
      await page.goto('/posts/hello-from-playwright')
    }
    const images = page.locator('.gallery img')
    await expect(images).toHaveCount(3)
    await expect(images.first()).toHaveAttribute('alt', 'A green circle')
    await page.waitForLoadState('load')
  })

  test('unpublishes and republishes (FR-DRF-05)', async ({ page }) => {
    await page.goto('/admin/collections/posts?q=Hello')
    await page.getByRole('link', { name: 'Hello from Playwright' }).click()
    await page.getByRole('button', { name: 'Unpublish' }).click()
    await expect(page.getByRole('status')).toHaveText('Unpublished')
    await expect(badge(page, 'Draft')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeVisible()

    await publicSite(page)
    await expect(page.getByRole('link', { name: 'Hello from Playwright' })).toHaveCount(0)

    await page.goto('/admin/collections/posts?q=Hello')
    await page.getByRole('link', { name: 'Hello from Playwright' }).click()
    await page.getByRole('button', { name: 'Publish', exact: true }).click()
    await expect(badge(page, 'Published')).toBeVisible()
    await publicSite(page)
    await expect(page.getByRole('link', { name: 'Hello from Playwright' })).toBeVisible()
  })

  test('edits a draft while the published version stays live, and restores history (FR-VER)', async ({
    page,
  }) => {
    await page.goto('/admin/collections/posts?q=Hello')
    await page.getByRole('link', { name: 'Hello from Playwright' }).click()
    const title = page.getByRole('textbox', { name: 'Title', exact: true })
    await title.fill('Hello, edited in a draft')
    await page.getByRole('button', { name: 'Save draft' }).click()
    await expect(page.getByRole('status')).toHaveText(
      'Draft saved. The published version is still live.',
    )
    await expect(badge(page, 'Published')).toBeVisible()
    await expect(badge(page, 'Unpublished changes')).toBeVisible()
    await shot(page, '07-pending-draft')

    // Visitors still see the published title.
    await publicSite(page)
    await expect(page.getByRole('link', { name: 'Hello from Playwright' })).toBeVisible()
    await expect(page.getByText('Hello, edited in a draft')).toHaveCount(0)

    // The list shows the draft, still marked as published, with unpublished changes.
    await page.goto('/admin/collections/posts?q=Hello')
    const row = page.getByRole('row', { name: /Hello, edited in a draft/ })
    await expect(row.getByText('Published', { exact: true })).toBeVisible()
    await expect(row.getByText('Unpublished changes')).toBeVisible()

    // The editor sees the draft; discarding goes back to the live content.
    await row.getByRole('link').click()
    await expect(title).toHaveValue('Hello, edited in a draft')
    await page.getByRole('button', { name: 'Discard changes' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Discard changes' }).click()
    await expect(page.getByRole('status')).toHaveText('Changes discarded')
    await expect(title).toHaveValue('Hello from Playwright')
    await expect(badge(page, 'Unpublished changes')).toHaveCount(0)

    // History: open the first version and restore it as a draft.
    const history = page.getByRole('complementary', { name: 'History' })
    const versions = history.getByRole('listitem')
    await expect(versions.first()).toBeVisible()
    await versions.last().getByRole('button').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: /^Version from / })).toBeVisible()
    await shot(page, '08-version')
    await dialog.getByRole('button', { name: 'Restore as draft' }).click()
    await expect(page.getByRole('status')).toHaveText('Version restored')
    await expect(badge(page, 'Unpublished changes')).toBeVisible()
    // Keep the live post as it was for the next tests.
    await page.getByRole('button', { name: 'Discard changes' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Discard changes' }).click()
    await expect(page.getByRole('status')).toHaveText('Changes discarded')
  })

  test('previews unsaved changes on the real page (FR-PRV)', async ({ page, context }) => {
    // Standalone: the frontend is on another origin and reads the draft with a preview token.
    await page.goto('/admin/collections/posts?q=Hello')
    await page.getByRole('link', { name: 'Hello from Playwright' }).click()
    await page.getByRole('button', { name: 'Preview' }).click()
    const preview = page.frameLocator('iframe[title="Live preview"]')
    await expect(preview.getByRole('heading', { level: 1 })).toHaveText('Hello from Playwright')

    // Typing updates the page right away, without saving.
    const title = page.getByRole('textbox', { name: 'Title', exact: true })
    await title.fill('Hello, previewed live')
    await expect(preview.getByRole('heading', { level: 1 })).toHaveText('Hello, previewed live')
    await expect(preview.getByRole('img', { name: 'A green circle' }).first()).toBeVisible()
    await shot(page, '09-live-preview')

    // Visitors still see the saved post.
    const visitor = await context.newPage()
    if (standalone()) {
      await publicSite(visitor)
      await expect(visitor.getByRole('link', { name: 'Hello from Playwright' })).toBeVisible()
      await expect(visitor.getByText('Hello, previewed live')).toHaveCount(0)
    } else {
      await visitor.goto(page.url().replace(/\/admin\/.*$/, '/posts/hello-from-playwright'))
      await expect(visitor.getByRole('heading', { level: 1 })).toHaveText('Hello from Playwright')
    }
    await visitor.close()

    // Put the title back so the form is clean again.
    await title.fill('Hello from Playwright')
    await expect(preview.getByRole('heading', { level: 1 })).toHaveText('Hello from Playwright')
    await page.getByRole('button', { name: 'Close preview' }).click()
    await expect(page.getByRole('complementary', { name: 'History' })).toBeVisible()
  })

  test('previews a draft that was never published (FR-PRV-03)', async ({ page }) => {
    await page.goto('/admin/collections/posts?q=Secret')
    await page.getByRole('link', { name: 'Secret draft' }).click()
    await page.getByRole('button', { name: 'Preview' }).click()
    const preview = page.frameLocator('iframe[title="Live preview"]')
    await expect(preview.getByRole('heading', { level: 1 })).toHaveText('Secret draft')
    await expect(preview.getByText('Draft preview')).toBeVisible()
  })

  test('translates a post into another language (FR-L10N)', async ({ page }) => {
    await page.goto('/admin/collections/posts?q=Hello')
    await page.getByRole('link', { name: 'Hello from Playwright' }).click()
    const languages = page.getByRole('group', { name: 'Content language' })
    const title = page.getByRole('textbox', { name: 'Title', exact: true })
    await expect(languages.getByRole('button', { name: 'Thai' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    // Not translated yet: the English button says so.
    await expect(
      languages.getByRole('button', { name: 'English (not translated yet)' }),
    ).toBeVisible()

    // English starts empty for translated fields; shared fields keep their values.
    await languages.getByRole('button', { name: 'English' }).click()
    await expect(title).toHaveValue('')
    await expect(page.getByLabel('Slug')).toHaveValue('hello-from-playwright')
    await title.fill('Hello in English')
    await page.getByRole('button', { name: 'Publish', exact: true }).click()
    await expect(page.getByRole('status')).toHaveText('Saved')
    await shot(page, '10-english')

    // Thai is untouched.
    await languages.getByRole('button', { name: 'Thai' }).click()
    await expect(title).toHaveValue('Hello from Playwright')

    // The list shows the default language and which translations each post has.
    await page.goto('/admin/collections/posts')
    const row = page.getByRole('row', { name: /Hello from Playwright/ })
    await expect(row.getByText('Thai: translated')).toBeAttached()
    // Only the title is in English; the excerpt and body are still Thai only.
    await expect(row.getByText('English: not translated yet')).toBeAttached()
    await expect(page.getByRole('group', { name: 'Content language' })).toHaveCount(0)

    // The site shows the default language.
    await publicSite(page)
    await expect(page.getByRole('link', { name: 'Hello from Playwright' })).toBeVisible()
  })

  test('adds content blocks (FR-BLK)', async ({ page }) => {
    await page.goto('/admin/collections/posts?q=Hello')
    await page.getByRole('link', { name: 'Hello from Playwright' }).click()
    await page.getByRole('button', { name: 'Add block' }).click()
    await page.getByRole('menuitem', { name: 'Quote' }).click()
    const quote = page.getByRole('listitem', { name: 'Block 1: Quote' })
    await quote.getByRole('textbox', { name: 'Text' }).fill('Blocks let editors lay out a page.')
    await quote.getByRole('textbox', { name: 'Author' }).fill('Ann')
    await page.getByRole('button', { name: 'Add block' }).click()
    await page.getByRole('menuitem', { name: 'Callout' }).click()
    const callout = page.getByRole('listitem', { name: 'Block 2: Callout' })
    await callout.getByRole('textbox', { name: 'Text' }).fill('Heads up')
    // Reorder: the callout first.
    await callout.getByRole('button', { name: 'Move row 2 up' }).click()
    await page.getByRole('button', { name: 'Publish', exact: true }).click()
    await expect(page.getByRole('status')).toHaveText('Saved')
    await shot(page, '11-blocks')

    await page.reload()
    await expect(page.getByRole('listitem', { name: 'Block 1: Callout' })).toBeVisible()
    await expect(
      page.getByRole('listitem', { name: 'Block 2: Quote' }).getByRole('textbox', { name: 'Text' }),
    ).toHaveValue('Blocks let editors lay out a page.')

    if (!standalone()) {
      await page.goto(page.url().replace(/\/admin\/.*$/, '/posts/hello-from-playwright'))
      await expect(page.getByText('Blocks let editors lay out a page.')).toBeVisible()
      await expect(page.getByText('Heads up')).toBeVisible()
    }
  })

  test('schedules publishing (FR-SCH)', async ({ page }) => {
    await page.goto('/admin/collections/posts?q=Secret')
    await page.getByRole('link', { name: 'Secret draft' }).click()
    await page.getByRole('button', { name: 'Schedule' }).click()
    const dialog = page.getByRole('dialog', { name: 'Schedule' })
    await expect(dialog.getByLabel('Action')).toHaveValue('publish')
    await dialog.getByRole('button', { name: 'Schedule' }).click()
    const notice = page.getByText(/^Publishes on /)
    await expect(notice).toBeVisible()
    await shot(page, '12-scheduled')
    // The status says so (#303): in the header, a button back to the dialog; in the list, with
    // its own filter.
    const chip = page.getByRole('button', { name: /^Scheduled · / })
    await expect(chip).toBeVisible()
    await chip.click()
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await page.goto('/admin/collections/posts?scheduled=1')
    await expect(page.getByRole('row')).toHaveCount(2)
    await expect(page.getByRole('row').nth(1)).toContainText(/Secret draft.*Scheduled · /s)
    await page.getByRole('link', { name: 'Secret draft' }).click()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(notice).toHaveCount(0)
  })

  test('lists, searches, sorts and bulk-deletes (FR-ADM-04)', async ({ page }) => {
    for (const title of ['Alpha note', 'Beta note', 'Gamma note']) {
      await page.goto('/admin/collections/posts/new')
      await page.getByRole('textbox', { name: 'Title', exact: true }).fill(title)
      await page.getByRole('button', { name: 'Save draft' }).click()
      await expect(page.getByRole('status')).toHaveText('Created')
    }
    await page.goto('/admin/collections/posts')
    await expect(page.getByRole('row')).toHaveCount(6) // header + 5 posts
    await shot(page, '04-list')

    await page.getByPlaceholder('Search Title').fill('note')
    await expect(page.getByRole('row')).toHaveCount(4)
    await expect(page).toHaveURL(/q=note/)

    await page.getByRole('button', { name: /^Title/ }).click()
    await expect(page.getByRole('row').nth(1)).toContainText('Alpha note')
    await page.getByRole('button', { name: /^Title/ }).click()
    await expect(page.getByRole('row').nth(1)).toContainText('Gamma note')

    await page.getByRole('checkbox', { name: 'Select Alpha note' }).check()
    await page.getByRole('checkbox', { name: 'Select Beta note' }).check()
    await expect(page.getByText('2 selected')).toBeVisible()
    await page.getByRole('button', { name: 'Delete selected' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByRole('row')).toHaveCount(2)
    await expect(page.getByRole('row').nth(1)).toContainText('Gamma note')
  })

  test('filters a list by several conditions, kept in the URL (#88)', async ({ page }) => {
    await page.goto('/admin/collections/posts')
    await page.getByRole('button', { name: /^Filter/ }).click()
    const panel = page.getByRole('dialog', { name: 'Show documents where' })
    await panel.getByRole('combobox', { name: 'Field', exact: true }).first().selectOption('title')
    // A condition without a value says so, rather than being dropped.
    await panel.getByRole('button', { name: 'Apply filters' }).click()
    await expect(panel.getByRole('alert')).toHaveText('Enter a value, or remove this condition.')
    await expect(panel.getByRole('textbox', { name: 'Value', exact: true }).first()).toBeFocused()
    await panel.getByRole('textbox', { name: 'Value', exact: true }).first().fill('note')
    await panel.getByRole('button', { name: 'Add condition' }).click()
    await panel
      .getByRole('combobox', { name: 'Field', exact: true })
      .nth(1)
      .selectOption('createdAt')
    await panel
      .getByRole('combobox', { name: 'Condition', exact: true })
      .nth(1)
      .selectOption('after')
    await panel.getByRole('button', { name: 'Last 7 days' }).click()
    await panel.getByRole('button', { name: 'Apply filters' }).click()
    await expect(panel).toBeHidden()

    await expect(page.getByRole('row')).toHaveCount(2)
    await expect(page.getByRole('row').nth(1)).toContainText('Gamma note')
    const url = () => decodeURIComponent(page.url())
    expect(url()).toContain('where[and][0][title][like]=note')
    expect(url()).toMatch(/where\[and\]\[1\]\[createdAt\]\[gte\]=\d{4}-/)
    const chips = page.getByRole('list', { name: 'Filters' })
    await expect(chips.getByRole('listitem')).toHaveCount(2)
    await expect(page.getByRole('button', { name: /^Filter\s*2$/ })).toBeVisible()

    // The link keeps the list: shared or reloaded, it filters the same.
    await page.reload()
    await expect(page.getByRole('row')).toHaveCount(2)

    await page.getByRole('button', { name: 'Remove filter: Title contains “note”' }).click()
    await expect(chips.getByRole('listitem')).toHaveCount(1)
    expect(url()).not.toContain('[title]')
    await page.getByRole('button', { name: 'Clear filters' }).click()
    await expect(chips).toBeHidden()

    // Older links still work, and a chip opens the panel to change them.
    await page.goto('/admin/collections/posts?status=draft')
    await expect(chips.getByRole('listitem')).toHaveText(['Status: Draft'])
    await chips.getByRole('button', { name: 'Status: Draft', exact: true }).click()
    await expect(panel).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()

    // On a phone the panel fits the screen.
    await page.setViewportSize({ width: 375, height: 800 })
    await page.getByRole('button', { name: /^Filter/ }).click()
    const box = await panel.boundingBox()
    expect(box && box.x >= 0 && box.x + box.width <= 375).toBe(true)
  })

  test('pages through a list: links, Next by cursor, go to page, rows per page (#279)', async ({
    page,
  }) => {
    await page.goto('/admin/')
    const me = (await (await page.request.get('/api/cms/auth/me')).json()) as { csrfToken: string }
    const headers = { 'x-csrf-token': me.csrfToken, origin: new URL(page.url()).origin }
    const ids: number[] = []
    for (let n = 1; n <= 45; n++) {
      const created = await page.request.post('/api/cms/posts?depth=0', {
        headers,
        data: { title: `Pager ${String(n).padStart(2, '0')}` },
      })
      expect(created.status()).toBe(201)
      ids.push(((await created.json()) as { id: number }).id)
    }

    await page.goto('/admin/collections/posts?q=Pager&sort=title')
    const footer = page.locator('.table-footer')
    const pager = page.getByRole('navigation', { name: 'Pagination' })
    // The rows, then the total, loaded after them.
    await expect(footer.getByText('1–20 of 45')).toBeVisible()
    await expect(pager.getByRole('button', { name: 'Page 3' })).toBeVisible()
    await expect(pager.getByRole('button', { name: 'Page 1' })).toHaveAttribute(
      'aria-current',
      'page',
    )

    // Next goes by cursor; Previous comes back the same way.
    const byCursor = page.waitForRequest((r) => /\/api\/cms\/posts\?.*cursor=[^&]+/.test(r.url()))
    await pager.getByRole('button', { name: 'Next' }).click()
    await byCursor
    await expect(page).toHaveURL(/page=2/)
    await expect(page.getByRole('link', { name: 'Pager 21', exact: true })).toBeVisible()
    await expect(footer.getByText('21–40 of 45')).toBeVisible()
    await pager.getByRole('button', { name: 'Previous' }).click()
    await expect(page.getByRole('link', { name: 'Pager 01', exact: true })).toBeVisible()

    // Go to a page past the last: the last.
    await pager.getByLabel('Go to page').fill('9')
    await pager.getByLabel('Go to page').press('Enter')
    await expect(page).toHaveURL(/page=3/)
    await expect(footer.getByText('41–45 of 45')).toBeVisible()

    // 50 rows per page, remembered: one page, no page links.
    await footer.getByLabel('Rows per page').selectOption('50')
    await expect(footer.getByText('1–45 of 45')).toBeVisible()
    await expect(pager).toBeHidden()
    await page.reload()
    await expect(footer.getByText('1–45 of 45')).toBeVisible()

    // The other tests expect the posts list as it was.
    for (const id of ids)
      expect((await page.request.delete(`/api/cms/posts/${id}`, { headers })).status()).toBe(200)
  })

  test('shows posts on a calendar, and creates one from a day (#272)', async ({ page }) => {
    // The standalone app's posts: admin.calendar by publishedAt, coloured by category.
    test.skip(test.info().project.name !== 'standalone', 'admin.calendar is set in standalone')
    await page.goto('/admin/collections/posts')
    await page.getByRole('button', { name: 'Calendar', exact: true }).click()
    await expect(page).toHaveURL(/calendar=month/)
    await expect(page.getByText(/^Time zone: /)).toBeVisible()

    // Pick 15 May 2030 (its number, by keyboard too): the side card shows that day, empty; a new
    // post starting then, in a drawer.
    await page.goto('/admin/collections/posts?calendar=month&date=2030-05-01')
    await expect(page.getByRole('heading', { name: 'May 2030' })).toBeVisible()
    await page.getByRole('button', { name: /^Wednesday,? 15 May 2030$/ }).focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/day=2030-05-15/)
    const day = page.getByRole('region', { name: 'Wednesday 15 May' })
    await expect(day.getByText('Nothing on this day.')).toBeVisible()
    await day.getByRole('button', { name: 'New on this day' }).click()
    const drawer = page.getByRole('dialog', { name: 'Create Post' })
    await expect(drawer.getByLabel('Published at')).toHaveValue('2030-05-15T00:00')
    await drawer.getByRole('textbox', { name: 'Title', exact: true }).fill('Calendar post')
    await drawer.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(drawer).toBeHidden()

    // On its day, named in full for screen readers, and in the day's card; a click opens it.
    const event = page.getByRole('link', { name: /^Calendar post, Wednesday,? 15 May 2030/ })
    await expect(event).toBeVisible()
    await expect(day.getByRole('link', { name: /Calendar post/ })).toContainText('All day')

    // Move it without dragging (the keyboard way): to the next day at 09:00, then undo.
    await day.getByRole('button', { name: 'Move to… Calendar post' }).click()
    const moveDialog = page.getByRole('dialog', { name: 'Move “Calendar post”' })
    await expect(moveDialog.getByLabel('Starts')).toHaveValue('2030-05-15T00:00')
    await moveDialog.getByLabel('Starts').fill('2030-05-16T09:00')
    await moveDialog.getByRole('button', { name: 'Move', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Moved.' })).toBeVisible()
    const moved = page.getByRole('link', {
      name: /^Calendar post, Thursday,? 16 May 2030 at 09:00/,
    })
    await expect(moved).toBeVisible()
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Moved back.' })).toBeVisible()
    await expect(event).toBeVisible()
    await expect(moved).toBeHidden()

    await page.getByRole('button', { name: 'Week', exact: true }).click()
    await expect(page).toHaveURL(/calendar=week/)
    await page.getByRole('button', { name: 'Month', exact: true }).click()
    await event.click()
    await expect(page).toHaveURL(/\/admin\/collections\/posts\/\d+$/)
    await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue(
      'Calendar post',
    )

    // The Calendar page: in the menu right after Content, every source, each one hideable.
    await fromMenu(page, 'Home', 'Calendar')
    await expect(page.getByRole('heading', { name: 'Calendar', level: 1 })).toBeVisible()
    await page.goto('/admin/calendar?view=month&date=2030-05-01')
    const onPage = page.getByRole('link', { name: /^Calendar post, Wednesday,? 15 May 2030/ })
    await expect(onPage).toBeVisible()
    await page.getByRole('checkbox', { name: 'Posts' }).uncheck()
    await expect(onPage).toBeHidden()
    await page.reload()
    await expect(page.getByRole('checkbox', { name: 'Posts' })).not.toBeChecked()
    await page.getByRole('checkbox', { name: 'Posts' }).check()
    await expect(onPage).toBeVisible()
  })

  test('deletes from the edit page and warns about unsaved changes (FR-ADM-08)', async ({
    page,
  }) => {
    await page.goto('/admin/collections/posts?q=Gamma')
    await page.getByRole('link', { name: 'Gamma note' }).click()
    await expect(page.getByRole('heading', { name: 'Gamma note' })).toBeVisible()
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Gamma note (edited)')

    // Leaving with unsaved changes asks first; dismissing stays on the page.
    page.once('dialog', (dialog) => dialog.dismiss())
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Categories' })
      .click()
    await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue(
      'Gamma note (edited)',
    )

    await page.getByRole('button', { name: 'Delete' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
    await expect(page).toHaveURL(/\/admin\/collections\/posts$/)
    await expect(page.getByRole('link', { name: /Gamma note/ })).toHaveCount(0)
  })

  test('edits a global', async ({ page }) => {
    await fromMenu(page, 'Settings', 'Site')
    await page.getByLabel('Tagline').fill('Tested end to end')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status')).toHaveText('Saved')
    await publicSite(page)
    await expect(page.getByText('Tested end to end')).toBeVisible()
  })

  test('shows one group at a time, follows the page, and folds the panel away', async ({
    page,
  }) => {
    await page.goto('/admin/')
    const menu = page.getByRole('navigation', { name: 'Main menu' })
    const home = menu.getByRole('button', { name: 'Home', exact: true })
    const settings = menu.getByRole('button', { name: 'Settings', exact: true })
    const users = menu.getByRole('link', { name: 'Users', exact: true })
    // The dashboard is in Home.
    await expect(home).toHaveAttribute('aria-pressed', 'true')
    await expect(users).toHaveCount(0)
    // An icon shows its group in the panel, without leaving the page.
    await settings.click()
    await expect(settings).toHaveAttribute('aria-pressed', 'true')
    await expect(users).toBeVisible()
    await expect(page).toHaveURL(/\/admin\/$/)
    // The panel follows the page to its group.
    await page.goto('/admin/collections/posts')
    await expect(menu.getByRole('button', { name: 'Content', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    // Folded away, remembered, and back with an icon.
    const posts = menu.getByRole('link', { name: 'Posts', exact: true })
    await menu.getByRole('button', { name: 'Collapse menu' }).click()
    await expect(posts).toBeHidden()
    await page.reload()
    await expect(posts).toBeHidden()
    await settings.click()
    await expect(users).toBeVisible()
    // Pinned: in Home.
    await page.goto('/admin/collections/users')
    await page.getByRole('button', { name: 'Pin to the menu' }).click()
    await home.click()
    await expect(menu.getByRole('heading', { name: 'Pinned' })).toBeVisible()
    await page.getByRole('button', { name: 'Unpin from the menu' }).click()
    await expect(menu.getByRole('heading', { name: 'Pinned' })).toHaveCount(0)
  })

  test('finds documents and runs commands with ⌘K, and lists the shortcuts', async ({ page }) => {
    await page.goto('/admin/')
    await expect(page.getByRole('heading', { level: 1, name: GREETING })).toBeVisible()
    await page.keyboard.press('ControlOrMeta+k')
    const search = page.getByRole('combobox', { name: 'Search and commands' })
    await expect(search).toBeFocused()
    await search.fill('Hello from')
    const option = page.getByRole('option', { name: /Hello from Playwright/ })
    await expect(option).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await option.click()
    await expect(page).toHaveURL(/\/admin\/collections\/posts\/\w+/)
    await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue(
      /Hello from Playwright/,
    )
    // Opened lately: offered before typing.
    await page.keyboard.press('ControlOrMeta+k')
    await expect(page.getByRole('option', { name: /Hello from Playwright/ })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(search).toHaveCount(0)
    // Go to a place by name.
    await page.keyboard.press('ControlOrMeta+k')
    await search.fill('categ')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/admin\/collections\/categories$/)
    // ? lists the shortcuts.
    await page.locator('body').click({ position: { x: 5, y: 5 } })
    await page.keyboard.press('?')
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
    await page.keyboard.press('Escape')
  })

  test('fills SEO fields with the SEO plugin (admin modules, endpoints)', async ({ page }) => {
    await page.goto('/admin/collections/posts/new')
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Plugins work')
    await page.getByLabel('Excerpt').fill('Web Components from the SEO plugin, end to end.')
    // The SEO fields have a tab of their own (admin.layout); the others are in the first.
    await expect(page.getByRole('tab', { name: 'Content' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await page.getByRole('tab', { name: 'SEO' }).click()

    // The plugin's components: length meters with Generate buttons, and a search preview.
    const metaTitle = page.getByRole('textbox', { name: 'Meta title' })
    const generate = page.getByRole('button', { name: 'Generate', exact: true })
    await expect(generate).toHaveCount(2)
    await expect(page.getByText('0 / 60 characters')).toBeVisible()
    await generate.first().click()
    await expect(metaTitle).toHaveValue('Plugins work | Easy CMS Blog')
    await expect(page.getByText('28 / 60 characters')).toBeVisible()
    await generate.last().click()
    await expect(page.getByRole('textbox', { name: 'Meta description' })).toHaveValue(
      'Web Components from the SEO plugin, end to end.',
    )
    const preview = page.getByRole('region', { name: 'Search result preview' })
    await expect(preview).toContainText('Plugins work | Easy CMS Blog')
    await metaTitle.fill('Custom SEO title')
    await expect(preview).toContainText('Custom SEO title')
    await shot(page, '13-seo-plugin')

    await page.getByRole('button', { name: 'Publish', exact: true }).click()
    await expect(page.getByRole('status')).toHaveText('Created')
    // "Created" shows before the address becomes the new post's; reloading /new gives a blank form.
    await expect(page).toHaveURL(/\/admin\/collections\/posts\/\d+$/)
    await page.reload()
    await expect(metaTitle).toHaveValue('Custom SEO title')

    // Nuxt and Next pages use seoMeta() for their metadata.
    if (!standalone()) {
      await page.goto('/posts/plugins-work')
      await expect(page).toHaveTitle('Custom SEO title')
      await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
        'content',
        'Custom SEO title',
      )
      // Next.js streams metadata; let the response finish before the test closes the page.
      await page.waitForLoadState('load')
    }
  })

  test('publishes a sitemap, robots.txt, hreflang and JSON-LD (SEO plugin)', async ({ page }) => {
    // A post hidden from search engines.
    await page.goto('/admin/collections/posts/new')
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Hidden page')
    await page.getByRole('tab', { name: 'SEO' }).click()
    await page.getByRole('checkbox', { name: 'Hide from search engines' }).check()
    await expect(page.getByRole('region', { name: 'Search result preview' })).toContainText(
      'Hidden from search engines',
    )
    await page.getByRole('button', { name: 'Publish', exact: true }).click()
    await expect(page.getByRole('status')).toHaveText('Created')
    const hiddenId = page.url().split('/').pop()

    const origin = new URL(page.url()).origin
    const sitemap = await (await page.request.get('/sitemap.xml')).text()
    const robots = await (await page.request.get('/robots.txt')).text()
    expect(robots).toContain('Disallow: /admin/')
    expect(robots).toContain(`Sitemap: ${origin}/sitemap.xml`)

    if (standalone()) {
      // The standalone server serves both from its root; posts link to the frontend.
      expect(sitemap).toContain('<loc>http://localhost:3103/?post=')
      expect(sitemap).not.toContain(`?post=${hiddenId}<`)
      return
    }
    // Published posts in both languages, with hreflang; not the hidden one.
    expect(sitemap).toContain(`<loc>${origin}/posts/plugins-work</loc>`)
    expect(sitemap).toContain(
      `<xhtml:link rel="alternate" hreflang="en" href="${origin}/posts/plugins-work?locale=en"/>`,
    )
    expect(sitemap).not.toContain('hidden-page')

    await page.goto('/posts/plugins-work')
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute(
      'href',
      `${origin}/posts/plugins-work?locale=en`,
    )
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article')
    const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents()
    expect(jsonLd.map((text) => JSON.parse(text)['@type'] ?? 'graph')).toEqual(
      expect.arrayContaining(['BlogPosting', 'graph']),
    )
    await page.goto('/posts/hidden-page')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
    await page.waitForLoadState('load')
  })

  test('opens the site to AI assistants: llms.txt, Markdown and crawler rules', async ({
    page,
  }) => {
    const get = async (path: string) => {
      const response = await page.request.get(path)
      return { status: response.status(), text: await response.text() }
    }
    // Training crawlers are kept out; AI search crawlers are not named, so they may read.
    const robots = (await get('/robots.txt')).text
    expect(robots).toMatch(/User-agent: GPTBot\n(User-agent: .+\n)*Disallow: \/\n/)
    expect(robots).not.toContain('OAI-SearchBot')
    // The IndexNow key file.
    expect(await get('/e2e-indexnow-key.txt')).toEqual({ status: 200, text: 'e2e-indexnow-key' })

    const llms = await get('/llms.txt')
    expect(llms.status).toBe(200)
    expect(llms.text).toMatch(/^# /)
    expect(llms.text).not.toContain('Hidden page')
    const full = await get('/llms-full.txt')
    expect(full.text).toContain('# Custom SEO title')
    if (standalone()) {
      // The frontend has no Markdown pages: llms.txt links to the frontend's addresses.
      expect(llms.text).toContain('](http://localhost:3103/?post=')
      return
    }
    const origin = test.info().project.use.baseURL as string
    expect(llms.text).toContain(`- [Custom SEO title](${origin}/posts/plugins-work.md)`)
    const markdown = await get('/posts/plugins-work.md')
    expect(markdown.status).toBe(200)
    expect(markdown.text).toContain('# Custom SEO title')
    expect(markdown.text).toContain(`URL: ${origin}/posts/plugins-work`)
    expect((await get('/posts/hidden-page.md')).status).toBe(404)
  })

  test('creates an API key that scripts can use (apiKeys)', async ({ page }) => {
    await fromMenu(page, 'Settings', 'API keys', true)
    await page.getByRole('link', { name: 'Create the first one' }).click()
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('E2E importer')
    // Creating posts needs reading them: ticking Create ticks Read too.
    await page.getByRole('checkbox', { name: 'Posts: Create' }).check()
    await expect(page.getByRole('checkbox', { name: 'Posts: Read' })).toBeChecked()
    await page.getByRole('button', { name: 'Save', exact: true }).click()

    const dialog = page.getByRole('dialog', { name: 'Copy your new API key' })
    const key = await dialog.getByRole('textbox', { name: 'API key' }).inputValue()
    expect(key).toMatch(/^ecms_[0-9a-f]{8}_/)
    await dialog.getByRole('button', { name: "I've copied it" }).click()
    await expect(page).toHaveURL(/\/admin\/collections\/api-keys\/\d+$/)

    // The key works over REST, only for what it lists, without cookies.
    const api = test.info().project.use.baseURL
    const headers = { authorization: `Bearer ${key}` }
    const created = await page.request.post(`${api}/api/cms/posts`, {
      headers,
      data: { title: 'Written with an API key' },
    })
    expect(created.status()).toBe(201)
    expect((await created.json()).status).toBe('draft')
    const denied = await page.request.get(`${api}/api/cms/categories`, { headers })
    expect(denied.status()).toBe(403)

    // The same key connects AI assistants to the MCP plugin: tools for what it allows.
    const mcp = await page.request.post(`${api}/api/cms/mcp`, {
      headers: { ...headers, accept: 'application/json, text/event-stream' },
      data: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    })
    expect(mcp.status()).toBe(200)
    const { result } = await mcp.json()
    expect(result.tools.map((t: { name: string }) => t.name).sort()).toEqual([
      'create_posts',
      'find_posts',
      'get_posts',
    ])

    // And the GraphQL plugin: the same access rules, for the key and for the admin's session.
    const graphql = async (query: string) => {
      const response = await page.request.post(`${api}/api/cms/graphql`, {
        headers,
        data: { query },
      })
      expect(response.status()).toBe(200)
      return response.json()
    }
    const read = await graphql(
      '{ posts(where: { title: { like: "API key" } }, draft: true) { totalDocs } }',
    )
    expect(read).toEqual({ data: { posts: { totalDocs: 1 } } })
    const written = await graphql(
      'mutation { createPost(data: { title: "Written over GraphQL" }) { title status } }',
    )
    expect(written).toEqual({
      data: { createPost: { title: 'Written over GraphQL', status: 'draft' } },
    })
    const forbidden = await graphql('{ categories { totalDocs } }')
    expect(forbidden.errors[0].extensions.code).toBe('FORBIDDEN')
    const me = await page.request.get(
      `${api}/api/cms/graphql?query=${encodeURIComponent('{ me { email } }')}`,
    )
    expect(await me.json()).toEqual({ data: { me: { email: ADMIN.email } } })
  })

  test('lists your own API keys on Account, to revoke them', async ({ page }) => {
    await openAccount(page)
    const panel = page.getByRole('region', { name: 'Your API keys' })
    await expect(panel.getByText('E2E importer')).toBeVisible()
    await panel.getByRole('button', { name: 'Revoke', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Revoke', exact: true }).click()
    await expect(panel.getByText('You have no API keys.')).toBeVisible()
    const keys = await page.request.get('/api/cms/api-keys')
    expect((await keys.json()).totalDocs).toBe(0)
  })

  test('redirects old addresses, and renamed posts (redirects plugin)', async ({ page }) => {
    // Under Settings in the menu, edited in a drawer.
    await page.goto('/admin/')
    await fromMenu(page, 'Settings', 'Redirects', true)
    await page.getByRole('link', { name: 'Create new' }).click()
    const drawer = page.getByRole('dialog', { name: 'Create Redirect' })
    await drawer.getByRole('textbox', { name: 'From', exact: true }).fill('/old-page/')
    await drawer.getByRole('textbox', { name: 'To (address)' }).fill('/posts/plugins-work')
    await drawer.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status')).toHaveText('Created')
    // Stored without the trailing slash.
    await expect(page.getByRole('row', { name: /\/old-page/ })).toBeVisible()

    if (standalone()) {
      // Frontends on another server ask the API.
      const response = await page.request.get('/api/cms/resolve-redirect?path=/old-page')
      expect(await response.json()).toEqual({ location: '/posts/plugins-work', status: 301 })
      return
    }
    await page.goto('/old-page?ref=e2e')
    await expect(page).toHaveURL(/\/posts\/plugins-work\?ref=e2e$/)

    // A published post with a new slug keeps its old address working.
    await page.goto('/admin/collections/posts/new')
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Renamed soon')
    await page.getByRole('button', { name: 'Publish', exact: true }).click()
    await expect(page.getByRole('status')).toHaveText('Created')
    await page.getByRole('textbox', { name: 'Slug', exact: true }).fill('renamed-now')
    await page
      .getByRole('button', { name: /^Publish/ })
      .first()
      .click()
    await expect(page.getByRole('status')).toHaveText(/Published|Saved/)
    await page.goto('/posts/renamed-soon')
    await expect(page).toHaveURL(/\/posts\/renamed-now$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Renamed soon' })).toBeVisible()
    await page.waitForLoadState('load')
  })

  test('nests pages: a tree, breadcrumbs and paths that follow a move (nested docs plugin)', async ({
    page,
  }) => {
    // Pages through the REST API, as the logged-in admin.
    await page.goto('/admin/')
    const me = (await (await page.request.get('/api/cms/auth/me')).json()) as { csrfToken: string }
    const headers = { 'x-csrf-token': me.csrfToken, origin: new URL(page.url()).origin }
    const create = async (data: Record<string, unknown>) => {
      const response = await page.request.post('/api/cms/pages', {
        headers,
        data: { status: 'published', ...data },
      })
      expect(response.status()).toBe(201)
      return (await response.json()) as { id: number; path: string }
    }
    const about = await create({ title: 'About', slug: 'about' })
    const team = await create({ title: 'Team', slug: 'team', parent: about.id })
    await create({ title: 'History', slug: 'history', parent: about.id })
    await create({ title: 'Services', slug: 'services' })
    expect(team.path).toBe('/about/team')

    // The list is a tree: pages under About open below it.
    await page.goto('/admin/collections/pages')
    await expect(page.getByRole('link', { name: 'About', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Team', exact: true })).toBeHidden()
    await page.getByRole('button', { name: 'Show pages under About' }).click()
    await expect(page.getByRole('link', { name: 'Team', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'History', exact: true })).toBeVisible()
    // Searching lists the matches flat.
    await page.getByPlaceholder('Search Title').fill('Tea')
    await expect(page.getByRole('link', { name: 'About', exact: true })).toBeHidden()
    await expect(page.getByRole('link', { name: 'Team', exact: true })).toBeVisible()

    // A page shows where it sits.
    await page.goto(`/admin/collections/pages/${team.id}`)
    const trail = page.getByRole('list', { name: 'Where this page sits' })
    await expect(trail).toContainText('About')
    await expect(trail).toContainText('Team')
    await expect(page.getByRole('textbox', { name: 'Path', exact: true })).toHaveValue(
      '/about/team',
    )

    // About's parent can't be About or a page under it.
    await page.goto(`/admin/collections/pages/${about.id}`)
    await expect(page.getByText('2 pages under it')).toBeVisible()
    await page.getByLabel('Parent page').click()
    await expect(page.getByRole('option', { name: 'Services' })).toBeVisible()
    await expect(page.getByRole('option', { name: 'Team' })).toHaveCount(0)
    await expect(page.getByRole('option', { name: 'About' })).toHaveCount(0)
    await page.keyboard.press('Escape')

    // A new slug for About moves the pages under it.
    await page.getByRole('textbox', { name: 'Slug', exact: true }).fill('about-us')
    await page
      .getByRole('button', { name: /^Publish/ })
      .first()
      .click()
    await expect(page.getByRole('status')).toHaveText(/Published|Saved/)
    const moved = await page.request.get(`/api/cms/pages/${team.id}?depth=0`)
    expect(((await moved.json()) as { path: string }).path).toBe('/about-us/team')

    // Deleting a page with pages under it is refused.
    const refused = await page.request.delete(`/api/cms/pages/${about.id}`, { headers })
    expect(refused.status()).toBe(400)
    expect(await refused.text()).toContain('2 pages under it')

    // The site: the page with its breadcrumbs, the menu, and the old address redirected.
    if (standalone()) {
      const api = new URL('/api/cms', test.info().project.use.baseURL).href
      await page.goto(`http://localhost:3103/?page=/about-us/team&api=${encodeURIComponent(api)}`)
      await expect(page.getByRole('heading', { level: 1, name: 'Team' })).toBeVisible()
      await expect(
        page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'About' }),
      ).toBeVisible()
      return
    }
    await page.goto('/p/about/team')
    await expect(page).toHaveURL(/\/p\/about-us\/team$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Team' })).toBeVisible()
    const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' })
    await breadcrumb.getByRole('link', { name: 'About' }).click()
    await expect(page).toHaveURL(/\/p\/about-us$/)
    await expect(page.getByRole('heading', { level: 1, name: 'About' })).toBeVisible()
    const menu = page.getByRole('navigation', { name: 'Pages' })
    await expect(menu.getByRole('link', { name: 'History' })).toHaveAttribute(
      'href',
      '/p/about-us/history',
    )
    // BreadcrumbList JSON-LD for search results.
    const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents()
    expect(jsonLd.some((text) => text.includes('"BreadcrumbList"'))).toBe(true)
    await page.waitForLoadState('load')
  })

  test('builds a form, takes submissions on the site and exports them (form builder)', async ({
    page,
  }) => {
    // A published form through the REST API, as the logged-in admin.
    await page.goto('/admin/')
    const me = (await (await page.request.get('/api/cms/auth/me')).json()) as { csrfToken: string }
    const created = await page.request.post('/api/cms/forms', {
      headers: { 'x-csrf-token': me.csrfToken, origin: new URL(page.url()).origin },
      data: {
        title: 'Contact',
        status: 'published',
        submitLabel: 'Send message',
        fields: [
          { blockType: 'text', name: 'name', label: 'Your name', required: true, width: 'half' },
          { blockType: 'email', name: 'email', label: 'Your email', required: true, width: 'half' },
          { blockType: 'textarea', name: 'message', label: 'Message' },
        ],
        confirmationMessage: {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Thanks, we will reply soon.' }] },
          ],
        },
      },
    })
    expect(created.status()).toBe(201)
    const form = (await created.json()) as { id: number }

    // The form's side panel: no submissions yet, and the snippet for a page.
    await page.goto(`/admin/collections/forms/${form.id}`)
    const panel = page.getByRole('region', { name: 'Submissions' })
    await expect(panel).toContainText('None yet')
    await expect(panel).toContainText('<easy-form form="contact"></easy-form>')

    if (standalone()) {
      const api = new URL('/api/cms', test.info().project.use.baseURL).href
      await page.goto(`http://localhost:3103/?contact&api=${encodeURIComponent(api)}`)
    } else {
      await page.goto('/contact')
    }
    const send = page.getByRole('button', { name: 'Send message' })
    await expect(send).toBeVisible()
    await send.click()
    // The form's messages follow the page's language (the Nuxt example's default is Thai).
    await expect(
      page.getByText(/Please check the fields marked below\.|โปรดตรวจช่องที่มีเครื่องหมายด้านล่าง/),
    ).toBeVisible()
    await expect(page.getByText(/^(is required|ต้องกรอก)$/).first()).toBeVisible()
    await page.getByLabel('Your name').fill('Somchai')
    await page.getByLabel('Your email').fill('somchai@example.test')
    await page.getByLabel('Message').fill('Hello from the e2e test')
    // People take a moment: forms sent sooner than 2 seconds after loading are treated as bots.
    await page.waitForTimeout(2_100)
    await send.click()
    await expect(page.getByText('Thanks, we will reply soon.')).toBeVisible()

    // The submission in the admin, and as CSV.
    await page.goto(`/admin/collections/forms/${form.id}`)
    await expect(panel).toContainText('1 received')
    await panel.getByRole('link', { name: 'View submissions' }).click()
    await expect(page.getByRole('row', { name: /Somchai/ })).toBeVisible()
    const csv = await page.request.get('/api/cms/form/contact/submissions.csv')
    expect(await csv.text()).toContain('Somchai,somchai@example.test,Hello from the e2e test')

    // At a glance: the dashboard panel and the overview page (admin.dashboard, admin.pages).
    await page.goto('/admin/')
    const widget = page.locator('ecms-forms-widget')
    await expect(widget.getByRole('heading', { name: 'Form submissions' })).toBeVisible()
    await expect(widget.locator('.total')).toHaveText('1 submission')
    await widget.getByRole('link', { name: /Form overview/ }).click()
    await expect(page).toHaveURL(/\/admin\/p\/forms-overview$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Form overview' })).toBeVisible()
    await expect(page).toHaveTitle(/^Form overview · /)
    const overview = page.locator('ecms-forms-overview')
    await expect(overview.getByRole('row', { name: /Contact/ })).toContainText('1')
    const month = overview.getByRole('button', { name: 'Last 30 days' })
    await month.click()
    await expect(page).toHaveURL(/\?range=30$/)
    await expect(month).toHaveAttribute('aria-pressed', 'true')
    // The range is in the address: a reload keeps it.
    await page.reload()
    await expect(month).toHaveAttribute('aria-pressed', 'true')
    // Listed in the menu under Content.
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Form overview' }),
    ).toHaveClass(/active/)
  })

  test('groups the dashboard: content tiles, drafts first, plugin panels beside them', async ({
    page,
  }) => {
    await page.goto('/admin/')
    const tiles = page.getByRole('region', { name: 'Content' })
    // Content only: users and API keys are in the menu, not here.
    await expect(tiles.getByRole('link', { name: /^Posts/ })).toBeVisible()
    await expect(tiles.getByRole('link', { name: /^Users/ })).toHaveCount(0)
    // + creates; media is created by uploading, so it has none.
    await expect(tiles.getByRole('link', { name: 'Create Post' })).toBeVisible()
    await expect(tiles.getByRole('link', { name: /^Create Media/ })).toHaveCount(0)
    // Drafts to review come before what was edited recently.
    const drafts = page.getByRole('heading', { name: 'Drafts to review' })
    const recent = page.getByRole('heading', { name: 'Recently edited' })
    const [d, r] = await Promise.all([drafts.boundingBox(), recent.boundingBox()])
    expect(d && r && d.y < r.y).toBe(true)
    // A plugin's half-width panel sits in the side column, at the top of the page.
    const panel = page.locator('.side ecms-forms-widget')
    await expect(panel).toBeVisible()
    const widget = await panel.boundingBox()
    expect(widget && d && Math.abs(widget.y - d.y) < 80).toBe(true)
    // For admins: the system, with the plugins and their versions.
    const system = page.getByRole('region', { name: 'System' })
    await expect(system).toContainText('Easy CMS')
    await expect(system).toContainText(/\d+\.\d+\.\d+/)
    await expect(system.getByText('@easy-cms/plugin-seo')).toBeVisible()
    await expect(system).toContainText('color')

    // Settings → Backups: back up now, then download it.
    await fromMenu(page, 'Settings', 'Backups')
    await expect(page.getByRole('heading', { level: 1, name: 'Backups' })).toBeVisible()
    await page.getByRole('button', { name: 'Back up now' }).click()
    const latest = page.getByRole('region', { name: 'Backups' }).getByRole('listitem').first()
    await expect(latest).toContainText('Done', { timeout: 20_000 })
    await expect(latest).toContainText(/\.db\.gz/)
    const href = await latest.getByRole('link', { name: 'Download' }).getAttribute('href')
    const file = await page.request.get(href as string)
    expect(file.status()).toBe(200)
    expect(file.headers()['content-type']).toBe('application/gzip')
    expect([...(await file.body()).subarray(0, 2)]).toEqual([0x1f, 0x8b])

    // Settings → Email: the adapter in use (console in the examples) and a test email.
    await fromMenu(page, 'Settings', 'Email', true)
    await expect(page.getByRole('heading', { level: 1, name: 'Email' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Settings in use' })).toContainText('console')
    // The examples print emails to the log: the admin warns that nothing is sent.
    await expect(
      page.getByText(/^Emails are not sent: they are printed to the server log/),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Send test email' }).click()
    await expect(
      page.getByRole('status').filter({ hasText: /^Not sent to .*: printed to the server log/ }),
    ).toBeVisible()

    // Saved emails and webhook deliveries, under Settings (email is set up in the examples).
    await fromMenu(page, 'Settings', 'Deliveries')
    await expect(page.getByRole('heading', { level: 1, name: 'Deliveries' })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Failed \(\d+\)$/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await page.getByRole('button', { name: /^Waiting/ }).click()
    await expect(page).toHaveURL(/state=pending/)
    await page.goto('/admin/')

    await tiles.getByRole('link', { name: 'Create Post' }).click()
    await expect(page).toHaveURL(/\/admin\/collections\/posts\/new$/)
  })

  test('edits small collections in a drawer, and creates related documents in place', async ({
    page,
  }) => {
    // Categories open in a panel over their list (editIn: 'drawer').
    await page.goto('/admin/collections/categories')
    await page.getByRole('link', { name: 'Create new' }).click()
    const drawer = page.getByRole('dialog', { name: 'Create Category' })
    await drawer.getByLabel('Name').fill('Recipes')
    // A field type from a package (@easy-cms/fields): a color from the suggested ones.
    await drawer.getByRole('button', { name: '#e8a33d' }).click()
    await expect(drawer.getByRole('textbox', { name: 'Color: Color code' })).toHaveValue('#e8a33d')
    await drawer.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status')).toHaveText('Created')
    await expect(page).toHaveURL(/edit=\d+/)
    const row = page.getByRole('row', { name: /Recipes/ })
    await expect(row).toBeVisible()
    // Shown in the list as a swatch with its code.
    await expect(row.locator('ecms-color-cell code')).toHaveText('#e8a33d')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page).not.toHaveURL(/edit=/)

    // From a post: create the category it should belong to without leaving the page.
    await page.goto('/admin/collections/posts/new')
    await page.getByRole('button', { name: 'Create Category' }).click()
    const inline = page.getByRole('dialog', { name: 'Create Category' })
    await inline.getByLabel('Name').fill('Travel')
    await inline.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Travel' })).toBeVisible()
  })

  test('invites a user by email and resets forgotten passwords (password links)', async ({
    page,
    browser,
  }) => {
    // Nuxt and Next.js run as production builds without serverURL: links could point anywhere,
    // so the admin doesn't offer them. The standalone server has its URL.
    const links = standalone()
    await page.goto('/admin/collections/users/new')
    await page.getByLabel('Email').fill('invitee@e2e.test')
    await page.getByLabel('Role').selectOption('editor')
    if (!links) {
      await expect(page.getByText('Leave it empty to email an invitation instead.')).toBeHidden()
      return
    }
    await expect(page.getByText('Leave it empty to email an invitation instead.')).toBeVisible()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Created. Invitation sent to invitee@e2e.test')).toBeVisible()
    await expect(page).toHaveURL(/\/admin\/collections\/users\/\d+$/)
    const id = page.url().split('/').pop() as string
    await expect(
      page.getByRole('button', { name: 'Email a link to set the password' }),
    ).toBeVisible()

    // The invitation's link, as the email has it: a user without a password has no fingerprint.
    const token = passwordToken(id, 'invite')
    const guest = await browser.newContext()
    const tab = await guest.newPage()
    await english(tab)
    await tab.goto(`/admin/reset-password?token=${encodeURIComponent(token)}`)
    await expect(tab.getByRole('heading', { name: 'Set your password' })).toBeVisible()
    await expect(tab.getByText('Choose a password for invitee@e2e.test')).toBeVisible()
    await tab.getByLabel('New password').fill('invitee-password-1')
    await tab.getByLabel('Repeat the password').fill('invitee-password-1')
    await tab.getByRole('button', { name: 'Set the password and start' }).click()
    await expect(tab.getByRole('heading', { level: 1, name: GREETING })).toBeVisible()
    // The link worked once.
    await tab.goto(`/admin/reset-password?token=${encodeURIComponent(token)}`)
    await expect(tab.getByText('This link has expired or was already used.')).toBeVisible()
    await guest.close()

    // "Forgot your password?" on the login page answers the same for any email.
    const visitor = await browser.newContext()
    const login = await visitor.newPage()
    await english(login)
    await login.goto('/admin/login')
    await login.getByRole('link', { name: 'Forgot your password?' }).click()
    await expect(login.getByRole('heading', { name: 'Reset your password' })).toBeVisible()
    await login.getByLabel('Email').fill('someone@e2e.test')
    await login.getByRole('button', { name: 'Send the link' }).click()
    await expect(login.getByText(/If an account has the email someone@e2e\.test/)).toBeVisible()
    await visitor.close()
  })

  test('gives roles permissions without code in Settings → Roles (auth.rbac)', async ({ page }) => {
    await fromMenu(page, 'Settings', 'Roles')
    await expect(page.getByRole('heading', { level: 1, name: 'Roles' })).toBeVisible()
    const list = page.getByRole('list', { name: 'Roles' })
    await expect(list.getByRole('button', { name: /Admin/ })).toBeVisible()
    await expect(list.getByRole('button', { name: /Editor/ })).toBeVisible()
    // Editors start with everything they could do before roles.
    await expect(page.getByRole('checkbox', { name: 'Posts: Publish' })).toBeChecked()

    // A new role from the editor's permissions.
    await page.getByRole('button', { name: 'New role' }).click()
    const dialog = page.getByRole('dialog', { name: 'New role' })
    await dialog.getByLabel('Name').fill('Reviewer')
    await dialog.getByLabel('Key').fill('reviewer')
    await dialog.getByLabel('Start from').selectOption('editor')
    await dialog.getByRole('button', { name: 'Create role' }).click()
    await expect(page.getByRole('status')).toHaveText('Role created')
    await expect(list.getByRole('button', { name: /Reviewer/ })).toHaveAttribute(
      'aria-current',
      'true',
    )

    // Unticking Read unticks the rest; ticking Delete ticks Read again.
    await page.getByRole('checkbox', { name: 'Posts: Read' }).uncheck()
    await expect(page.getByRole('checkbox', { name: 'Posts: Publish' })).not.toBeChecked()
    await page.getByRole('checkbox', { name: 'Posts: Update' }).check()
    await expect(page.getByRole('checkbox', { name: 'Posts: Read' })).toBeChecked()
    await page.getByRole('checkbox', { name: 'System status on the dashboard' }).check()
    // Updating only their own posts; tags hidden; the title must stay editable (required).
    const ownUpdate = page.getByRole('button', { name: 'Posts: Update own documents only' })
    await ownUpdate.click()
    await expect(ownUpdate).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Fields of Posts' }).click()
    await page.getByRole('radiogroup', { name: 'Tags' }).getByText('Hidden').click()
    const titleHidden = page.getByRole('radiogroup', { name: 'Title' }).getByLabel('Hidden')
    await expect(titleHidden).toBeEnabled()
    await page.getByRole('checkbox', { name: 'Posts: Create' }).check()
    await expect(titleHidden).toBeDisabled()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByRole('status')).toHaveText('Role saved')

    await page.reload()
    await expect(page.getByRole('checkbox', { name: 'Posts: Update' })).toBeChecked()
    await expect(page.getByRole('checkbox', { name: 'Posts: Delete' })).not.toBeChecked()
    await expect(
      page.getByRole('checkbox', { name: 'System status on the dashboard' }),
    ).toBeChecked()
    await expect(
      page.getByRole('button', { name: 'Posts: Update own documents only' }),
    ).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Fields of Posts' }).click()
    await expect(page.getByRole('radiogroup', { name: 'Tags' }).getByLabel('Hidden')).toBeChecked()
    await page.getByRole('button', { name: 'History' }).click()
    await expect(page.getByRole('listitem').filter({ hasText: ADMIN.email })).toHaveCount(2)

    // Users can be given it.
    await page.goto('/admin/collections/users/new')
    await expect(page.getByLabel('Role').locator('option', { hasText: 'Reviewer' })).toHaveCount(1)

    // Roles from the config can't be deleted; others can.
    await page.goto('/admin/roles?role=editor')
    await expect(page.getByRole('button', { name: 'Delete role' })).toBeDisabled()
    await page.goto('/admin/roles?role=reviewer')
    await page.getByRole('button', { name: 'Delete role' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete role' }).click()
    await expect(page.getByRole('status')).toHaveText('Role deleted')
    await expect(list.getByRole('button', { name: /Reviewer/ })).toHaveCount(0)
  })

  test('gives the documents of a deleted user to someone else (auth.rbac)', async ({ page }) => {
    await page.goto('/admin/')
    const me = (await (await page.request.get('/api/cms/auth/me')).json()) as {
      csrfToken: string
      user: { id: number }
    }
    const headers = { 'x-csrf-token': me.csrfToken, origin: new URL(page.url()).origin }
    const leaver = (await (
      await page.request.post('/api/cms/users', {
        headers,
        data: { email: 'leaver@e2e.test', password: 'leaver-password-1', role: 'editor' },
      })
    ).json()) as { id: number }
    const post = (await (
      await page.request.post('/api/cms/posts?depth=0', {
        headers,
        data: { title: 'Left behind', author: leaver.id },
      })
    ).json()) as { id: number; createdBy: number }
    // Who created it is recorded: the admin.
    expect(post.createdBy).toBe(me.user.id)

    // Mine: what the admin owns (by author, the posts' owner field), so not this one.
    await page.goto('/admin/collections/posts')
    await page.getByRole('button', { name: 'Mine' }).click()
    await expect(page.getByRole('link', { name: 'Left behind' })).toHaveCount(0)

    await page.goto(`/admin/collections/users/${leaver.id}`)
    await page.getByRole('button', { name: 'Delete' }).click()
    const dialog = page.getByRole('dialog', { name: 'What happens to their documents?' })
    await expect(dialog).toContainText('This user owns: Posts 1.')
    await dialog.getByLabel('Give them to').selectOption(String(me.user.id))
    await dialog.getByRole('button', { name: 'Delete' }).click()
    await expect(page).toHaveURL(/\/admin\/collections\/users$/)
    const moved = (await (
      await page.request.get(`/api/cms/posts/${post.id}?depth=0&draft=true`)
    ).json()) as { author: number }
    expect(moved.author).toBe(me.user.id)
  })

  test('keeps an audit log of changes, sign-ins and admin actions (audit)', async ({ page }) => {
    await fromMenu(page, 'Settings', 'Audit log')
    await expect(page.getByRole('heading', { level: 1, name: 'Audit log' })).toBeVisible()
    const list = page.getByRole('region', { name: 'Audit log' })
    // The user deleted in the test before, and who did it.
    await page.getByLabel('Action').selectOption('delete')
    const deleted = list.getByRole('listitem').filter({ hasText: 'leaver@e2e.test' })
    await expect(deleted).toContainText('Deleted')
    await expect(deleted).toContainText(ADMIN.email)

    // A change, field by field.
    await page.getByLabel('Action').selectOption('update')
    await page.getByLabel('Where').selectOption('posts')
    await list.getByRole('listitem').first().getByRole('button').click()
    await expect(list.getByRole('columnheader', { name: 'Before' })).toBeVisible()

    // Sign-ins are logged too.
    await page.getByLabel('Where').selectOption('')
    await page.getByLabel('Action').selectOption('login')
    await expect(list.getByRole('listitem').filter({ hasText: 'Signed in' }).first()).toBeVisible()

    await page.getByRole('button', { name: 'Check integrity' }).click()
    await expect(page.getByRole('status')).toContainText('entries check out')

    // On a post's page: its activity.
    await page.goto('/admin/collections/posts')
    await page.getByRole('row').nth(1).getByRole('link').first().click()
    await expect(page.getByRole('region', { name: 'Activity' })).toContainText('Created')
  })

  test('goes back from a document to the list as it was left', async ({ page }) => {
    await page.goto('/admin/collections/posts?sort=title')
    await page.locator('tbody').getByRole('link').first().click()
    await expect(page).toHaveURL(/\/admin\/collections\/posts\/\d+$/)
    await page.locator('a.back').click()
    await expect(page).toHaveURL(/\/admin\/collections\/posts\?sort=title$/)
  })

  test('shows skeletons while slow pages load, then the content (#146)', async ({ page }) => {
    // A collection's first page: skeleton rows with a "Loading…" status, then the posts.
    const list = await hold(page, /\/api\/cms\/posts\?/)
    await page.goto('/admin/collections/posts')
    const table = page.locator('.table-wrap')
    await expect(table.locator('.skeleton-row').first()).toBeVisible()
    await expect(table).toHaveAttribute('aria-busy', 'true')
    await expect(table.getByText('Loading…')).toBeAttached()
    list.release()
    await expect(table.locator('.skeleton-row')).toHaveCount(0)
    const first = table.locator('tbody').getByRole('link').first()
    await expect(first).toBeVisible()

    // A document: a form skeleton, then the form.
    const href = String(await first.getAttribute('href'))
    const doc = await hold(page, /\/api\/cms\/posts\/\d+/)
    await page.goto(href)
    await expect(page.locator('.form-skeleton')).toBeVisible()
    doc.release()
    await expect(page.locator('.form-skeleton')).toHaveCount(0)
    await expect(page.locator('form.editor')).toBeVisible()
  })

  test('creates an editor account', async ({ page }) => {
    await page.goto('/admin/collections/users/new')
    await page.getByLabel('Email').fill(EDITOR.email)
    await page.getByLabel('Name').fill('Eddie Editor')
    await page.getByLabel('Role').selectOption('editor')
    await page.getByLabel('Password').fill(EDITOR.password)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status')).toHaveText('Created')
  })
})

test.describe('logged in as editor', () => {
  test.beforeEach(async ({ page }) => {
    await english(page)
    await login(page, EDITOR)
  })

  test('hides actions the editor may not take (FR-ACL-06)', async ({ page }) => {
    await page.goto('/admin/collections/users')
    await expect(page.getByRole('heading', { name: 'Users', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Create new' })).toHaveCount(0)

    await page.getByRole('link', { name: ADMIN.email }).click()
    await expect(page.getByText('You can view but not change this document.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0)

    // The system and its problems are for admins.
    await page.goto('/admin/')
    await expect(page.getByRole('heading', { name: 'Drafts to review' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'System' })).toHaveCount(0)
    expect((await page.request.get('/api/cms/admin/status')).status()).toBe(403)
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Deliveries' }),
    ).toHaveCount(0)
    expect((await page.request.get('/api/cms/admin/deliveries?kind=email')).status()).toBe(403)
    expect((await page.request.get('/api/cms/admin/email')).status()).toBe(403)
    expect((await page.request.get('/api/cms/admin/backups')).status()).toBe(403)
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Roles' }),
    ).toHaveCount(0)
    expect((await page.request.get('/api/cms/admin/roles')).status()).toBe(403)
    expect((await page.request.get('/api/cms/admin/audit')).status()).toBe(403)
  })

  test('changes their own password (FR-ADM-13)', async ({ page }) => {
    await openAccount(page)
    await page.getByLabel('Change password').fill('a-brand-new-password')
    // Not without the current one.
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('is required to change your password or email')).toBeVisible()
    await page.getByLabel('Current password').fill(EDITOR.password)
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('status')).toHaveText('Password changed')
    // Still logged in with the new cookie.
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Account', exact: true })).toBeVisible()
    await logOut(page)
    await login(page, { email: EDITOR.email, password: 'a-brand-new-password' })
  })
})

test.describe('single sign-on', () => {
  // Nuxt and Next.js run from the examples' migrations, made without a provider; standalone has
  // one (OIDC).
  test.skip(() => test.info().project.name !== 'standalone', 'no provider in this app')
  test.beforeEach(async ({ page }) => {
    await english(page)
  })

  test('signs an existing user in with the provider once they linked it', async ({ page }) => {
    const ssoAs = async (email: string) => {
      await page.getByRole('link', { name: 'Sign in with SSO' }).click()
      // The provider's own page: who signs in.
      await page.getByLabel('Email').fill(email)
      await page.getByRole('button', { name: 'Continue' }).click()
    }
    // Staff link the provider from their account first: an email alone doesn't open it.
    await page.goto('/admin/collections/posts')
    await expect(page).toHaveURL(/\/admin\/login/)
    await ssoAs(EDITOR.email)
    await expect(page.getByRole('alert')).toContainText('You already have an account here')

    await login(page, { email: EDITOR.email, password: 'a-brand-new-password' })
    await openAccount(page)
    const accounts = page.getByRole('region', { name: 'Sign-in accounts' })
    await accounts.getByRole('button', { name: 'Link SSO' }).click()
    await page.getByLabel('Email').fill(EDITOR.email)
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByRole('status')).toContainText('Account linked')
    await expect(accounts.getByRole('listitem')).toContainText(['SSO'])
    await expect(accounts).toContainText(EDITOR.email)

    // Now the provider signs them in, back where they were going.
    await logOut(page)
    await page.goto('/admin/collections/posts')
    await ssoAs(EDITOR.email)
    await expect(page).toHaveURL(/\/admin\/collections\/posts$/)
    await expect(page.getByRole('heading', { name: 'Posts' })).toBeVisible()
  })

  test('says when there is no account for the email', async ({ page }) => {
    await page.goto('/admin/login')
    await page.getByRole('link', { name: 'Sign in with SSO' }).click()
    await page.getByLabel('Email').fill('stranger@elsewhere.test')
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByRole('alert')).toHaveText(
      'There is no account for that email here. Ask an admin to add you.',
    )
  })

  test('shows admins the callback URL to give the provider', async ({ page }) => {
    await login(page, ADMIN)
    await fromMenu(page, 'Settings', 'Single sign-on')
    const origin = new URL(page.url()).origin
    await expect(page.getByRole('region', { name: /SSO/ })).toContainText(
      `${origin}/api/cms/auth/sso/callback`,
    )
  })
})
