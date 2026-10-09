import { expect, type Page, test } from '@playwright/test'

/** Two brands in one CMS (examples/multi-tenant): the switcher, members and their roles. */

const ROOT = { email: 'root@e2e.test', password: 'root-password-1' }
const ED = { email: 'ed@e2e.test', password: 'ed-password-1' }

test.describe.configure({ mode: 'serial' })

let pageErrors: string[] = []
test.beforeEach(async ({ page }) => {
  pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.addInitScript(() => localStorage.setItem('easy-cms-locale', 'en'))
})
test.afterEach(() => {
  expect(pageErrors, 'uncaught errors in the page').toEqual([])
})

async function login(page: Page, user: { email: string; password: string }) {
  await page.goto('/admin/login')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('heading', { level: 1, name: /^Good / })).toBeVisible()
}

/** A write to the API with the page's session (its CSRF token). */
async function write(page: Page, method: 'POST' | 'PATCH', path: string, data: object) {
  const me = await (await page.request.get('/api/cms/users/me')).json()
  const response = await page.request.fetch(`/api/cms${path}`, {
    method,
    data,
    headers: { 'x-csrf-token': me.csrfToken, origin: new URL(page.url()).origin },
  })
  expect(response.ok(), await response.text()).toBe(true)
  return response.json()
}

const tenant = (page: Page) => page.getByRole('combobox', { name: 'Tenant' })

/** Chooses a tenant in the switcher, which reloads the page, and waits for that. */
async function choose(page: Page, label: string, value: string) {
  const reloaded = page.waitForEvent('load')
  await tenant(page).selectOption({ label })
  await reloaded
  await expect(tenant(page)).toHaveValue(value)
}

test('sets up the first admin and two tenants', async ({ page }) => {
  // Retries start again from here: set up once.
  const init = await (await page.request.get('/api/cms/users/init')).json()
  if (init.hasUsers) return
  const created = await page.request.post('/api/cms/users/first-register', {
    data: { ...ROOT, name: 'Root' },
    headers: { origin: 'http://localhost:3104' },
  })
  expect(created.status()).toBe(201)
  await page.goto('/admin/')
  for (const [name, slug] of [
    ['Brand A', 'brand-a'],
    ['Brand B', 'brand-b'],
  ])
    await write(page, 'POST', '/tenants', { name, slug })
})

test('switches between tenants; each has its own posts', async ({ page }) => {
  await login(page, ROOT)
  // Users with access to all tenants start with all of them.
  await expect(tenant(page)).toHaveValue('*')
  await choose(page, 'Brand A', 'brand-a')

  await page.goto('/admin/collections/posts/new')
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Hello from Brand A')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Created')
  // The tenant was set from the switcher.
  await expect(page.getByText('Brand A', { exact: true }).last()).toBeVisible()

  await choose(page, 'Brand B', 'brand-b')
  await page.goto('/admin/collections/posts')
  await expect(page.getByRole('link', { name: 'Create the first one' })).toBeVisible()
  await choose(page, 'Brand A', 'brand-a')
  await page.goto('/admin/collections/posts')
  await expect(page.getByRole('link', { name: 'Hello from Brand A' })).toBeVisible()
})

test('lets the admins of a tenant add its members', async ({ page }) => {
  await login(page, ROOT)
  // Members are per tenant: choose one first.
  await choose(page, 'Brand A', 'brand-a')
  await page.goto('/admin/p/tenant-members')
  await expect(page.getByRole('heading', { level: 1, name: 'Members' })).toBeVisible()
  await page.getByLabel('Email').fill(ED.email)
  await page.getByRole('button', { name: 'Add member' }).click()
  // No email in this example: the admin is told to send a link another way.
  await expect(page.getByRole('status').filter({ hasText: 'ed@e2e.test was added' })).toBeVisible()
  await expect(page.getByRole('cell', { name: ED.email })).toBeVisible()

  // A password for the test, as an admin of the system could set one.
  const users = await (await page.request.get('/api/cms/users?depth=0')).json()
  const ed = users.docs.find((u: { email: string }) => u.email === ED.email)
  await write(page, 'PATCH', `/users/${ed.id}`, { password: ED.password })
})

test('gives members their tenant only, with their role there', async ({ page }) => {
  await login(page, ED)
  // One tenant: nothing to switch, and nothing of the system's.
  await expect(tenant(page)).toHaveCount(0)
  const menu = page.getByRole('navigation', { name: 'Main' })
  await expect(menu.getByRole('link', { name: 'Backups' })).toHaveCount(0)
  await expect(menu.getByRole('link', { name: 'Members' })).toHaveCount(0)
  await page.goto('/admin/collections/posts')
  await expect(page.getByRole('link', { name: 'Hello from Brand A' })).toBeVisible()
})

test('serves each tenant to its frontend', async ({ request }) => {
  const posts = async (slug: string) =>
    (await (await request.get('/api/cms/posts', { headers: { 'x-easy-cms-tenant': slug } })).json())
      .totalDocs
  expect(await posts('brand-a')).toBe(1)
  expect(await posts('brand-b')).toBe(0)
  // Naming no tenant finds nothing.
  expect((await (await request.get('/api/cms/posts')).json()).totalDocs).toBe(0)
})

test('asks for the name before deleting a tenant, and says what goes', async ({ page }) => {
  await login(page, ROOT)
  const brand = await write(page, 'POST', '/tenants', { name: 'Brand C', slug: 'brand-c' })
  await page.goto(`/admin/collections/tenants/${brand.id}`)
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText(/It has no content/)).toBeVisible()
  const remove = dialog.getByRole('button', { name: 'Delete', exact: true })
  await expect(remove).toBeDisabled()
  await dialog.getByRole('textbox', { name: 'Type “Brand C” to confirm' }).fill('Brand C')
  await remove.click()
  await expect(page).toHaveURL(/\/admin\/collections\/tenants$/)
  await expect(page.getByRole('link', { name: 'Brand C' })).toHaveCount(0)
})
