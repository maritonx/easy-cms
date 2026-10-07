import { createHash, createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, type Page, test } from '@playwright/test'
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
const E2E_SECRET = 'e2e-secret-e2e-secret-e2e-secret-e2e'

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true })
}

test('shows Thai by default and asks for the first admin (FR-ADM-02, FR-ADM-11)', async ({
  page,
}) => {
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
    await page.getByRole('button', { name: 'Log out' }).click()
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

  test('shows collections and globals in the sidebar (FR-ADM-03)', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Main' })
    for (const name of ['Users', 'Media', 'Categories', 'Posts', 'Site']) {
      await expect(nav.getByRole('link', { name, exact: true })).toBeVisible()
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
    await expect(page.getByText('is required')).toBeVisible()
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('x')
    await expect(page.getByText('is required')).toHaveCount(0)

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

    // Relationship picker: search and choose.
    await page.getByLabel('Category').fill('Gui')
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
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Media' })
      .click()
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
    await page.getByRole('button', { name: 'Choose from media library' }).first().click()
    const picker = page.getByRole('dialog', { name: 'Choose a file' })
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
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Site' }).click()
    await page.getByLabel('Tagline').fill('Tested end to end')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status')).toHaveText('Saved')
    await publicSite(page)
    await expect(page.getByText('Tested end to end')).toBeVisible()
  })

  test('fills SEO fields with the SEO plugin (admin modules, endpoints)', async ({ page }) => {
    await page.goto('/admin/collections/posts/new')
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Plugins work')
    await page.getByLabel('Excerpt').fill('Web Components from the SEO plugin, end to end.')

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
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'API keys', exact: true })
      .click()
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
  })

  test('redirects old addresses, and renamed posts (redirects plugin)', async ({ page }) => {
    // Under Settings in the menu, edited in a drawer.
    await page.goto('/admin/')
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Redirects', exact: true })
      .click()
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
    const me = (await (await page.request.get('/api/cms/users/me')).json()) as { csrfToken: string }
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
    const me = (await (await page.request.get('/api/cms/users/me')).json()) as { csrfToken: string }
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
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Backups' })
      .click()
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
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Email', exact: true })
      .click()
    await expect(page.getByRole('heading', { level: 1, name: 'Email' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Settings in use' })).toContainText('console')
    await page.getByRole('button', { name: 'Send test email' }).click()
    await expect(page.getByRole('status').filter({ hasText: /^Sent to / })).toBeVisible()

    // Saved emails and webhook deliveries, under Settings (email is set up in the examples).
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Deliveries' })
      .click()
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
    // Next.js runs as a production build without serverURL: links could point anywhere, so
    // the admin doesn't offer them. The other examples run in development.
    const links = test.info().project.name !== 'next'
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
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Roles' })
      .click()
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
    const me = (await (await page.request.get('/api/cms/users/me')).json()) as {
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
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Audit log' })
      .click()
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
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
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
    await page.getByRole('link', { name: /Account/ }).click()
    await page.getByLabel('Change password').fill('a-brand-new-password')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('status')).toHaveText('Password changed')
    // Still logged in with the new cookie.
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Account', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Log out' }).click()
    await login(page, { email: EDITOR.email, password: 'a-brand-new-password' })
  })
})

test.describe('single sign-on', () => {
  // The Next app runs from migrations, without a provider; Nuxt and standalone have one (OIDC).
  test.skip(() => test.info().project.name === 'next', 'no provider in the Next app')
  test.beforeEach(async ({ page }) => {
    await english(page)
  })

  test('signs an existing user in with the provider, and lists the account', async ({ page }) => {
    await page.goto('/admin/collections/posts')
    await expect(page).toHaveURL(/\/admin\/login/)
    await page.getByRole('link', { name: 'Sign in with SSO' }).click()
    // The provider's own page: who signs in.
    await page.getByLabel('Email').fill(EDITOR.email)
    await page.getByRole('button', { name: 'Continue' }).click()
    // Back where they were going, signed in as the editor matched by email.
    await expect(page).toHaveURL(/\/admin\/collections\/posts$/)
    await expect(page.getByRole('heading', { name: 'Posts' })).toBeVisible()

    await page.getByRole('link', { name: /Account/ }).click()
    const accounts = page.getByRole('region', { name: 'Sign-in accounts' })
    await expect(accounts.getByRole('listitem')).toContainText(['SSO'])
    await expect(accounts).toContainText(EDITOR.email)
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
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Single sign-on' })
      .click()
    const origin = new URL(page.url()).origin
    await expect(page.getByRole('region', { name: /SSO/ })).toContainText(
      `${origin}/api/cms/auth/sso/callback`,
    )
  })
})
