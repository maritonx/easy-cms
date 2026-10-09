import { expect, type Page, test } from '@playwright/test'

/** A shop (examples/shop, @easy-cms/plugin-ecommerce): a guest buys, staff take the payment. */

const ADMIN = { email: 'owner@e2e.test', password: 'owner-password-1' }
const CUSTOMER = { email: 'buyer@e2e.test', password: 'buyer-password-1' }

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

async function login(page: Page) {
  await page.goto('/admin/login')
  await page.getByLabel('Email').fill(ADMIN.email)
  await page.getByLabel('Password').fill(ADMIN.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('heading', { level: 1, name: /^Good / })).toBeVisible()
}

/** A write to the API with the page's session (its CSRF token). */
async function write(page: Page, path: string, data: object) {
  const me = await (await page.request.get('/api/cms/users/me')).json()
  const response = await page.request.post(`/api/cms${path}`, {
    data,
    headers: { 'x-csrf-token': me.csrfToken, origin: new URL(page.url()).origin },
  })
  expect(response.ok(), await response.text()).toBe(true)
  return response.json()
}

test('sets up the owner, a product and a customer', async ({ page, baseURL }) => {
  // Retries start again from here: set up once.
  const init = await (await page.request.get('/api/cms/users/init')).json()
  if (init.hasUsers) return
  const created = await page.request.post('/api/cms/users/first-register', {
    data: { ...ADMIN, name: 'Owner' },
    headers: { origin: baseURL as string },
  })
  expect(created.status()).toBe(201)
  await page.goto('/admin/')
  await write(page, '/products', {
    title: 'Jasmine tea',
    slug: 'jasmine-tea',
    priceInTHB: 25_000,
    inventory: 5,
    status: 'published',
  })
  await write(page, '/users', { ...CUSTOMER, role: 'customer', emailVerified: true })
})

test('a guest buys by bank transfer', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: /Jasmine tea/ }).click()
  await page.getByRole('button', { name: 'ใส่ตะกร้า' }).click()
  await expect(page.getByTestId('cart-link')).toHaveText('ตะกร้า (1)')
  await page.getByTestId('cart-link').click()
  // ฿250 + ฿50 shipping.
  await expect(page.getByTestId('cart-total')).toHaveText('฿300.00')
  await page.getByRole('button', { name: 'เพิ่ม' }).click()
  await expect(page.getByTestId('cart-total')).toHaveText('฿550.00')
  await page.getByRole('link', { name: 'ชำระเงิน' }).click()

  await page.getByLabel('อีเมล').fill('guest@e2e.test')
  await page.getByLabel('ชื่อผู้รับ').fill('Somchai')
  await page.getByLabel('ที่อยู่', { exact: true }).fill('99 Sukhumvit')
  await page.getByLabel('Bank transfer').check()
  await page.getByRole('button', { name: 'สั่งซื้อ' }).click()
  await expect(page.getByTestId('order-number')).toHaveText('1001')
  await expect(page.getByText('กสิกรไทย 123-4-56789-0')).toBeVisible()
  await expect(page.getByTestId('cart-link')).toHaveText('ตะกร้า (0)')
})

test('staff mark the payment received, and the stock is taken', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: 'Orders', exact: true }).click()
  await page.getByRole('link', { name: '1001' }).click()
  const actions = page.locator('ecms-order-actions')
  await expect(actions.getByText('Awaiting payment')).toBeVisible()
  page.once('dialog', (dialog) => void dialog.accept())
  await actions.getByRole('button', { name: 'Payment received' }).click()
  await expect(actions.getByText('Paid', { exact: true })).toBeVisible()
  await expect(actions.getByRole('button', { name: 'Mark as sent' })).toBeVisible()

  await page.getByRole('link', { name: 'Products', exact: true }).click()
  await page.getByRole('link', { name: 'Jasmine tea' }).click()
  await expect(page.getByLabel(/In stock/)).toHaveValue('3')
})

test('a customer signs in, keeps the cart, and sees their own orders', async ({ page }) => {
  await page.goto('/products/jasmine-tea')
  await page.getByRole('button', { name: 'ใส่ตะกร้า' }).click()
  await expect(page.getByTestId('cart-link')).toHaveText('ตะกร้า (1)')
  await page.getByRole('link', { name: 'บัญชีของฉัน' }).click()
  await page.getByLabel('อีเมล').fill(CUSTOMER.email)
  await page.getByLabel('รหัสผ่าน').fill(CUSTOMER.password)
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await expect(page.getByText(CUSTOMER.email)).toBeVisible()
  // The guest's cart is theirs now.
  await expect(page.getByTestId('cart-link')).toHaveText('ตะกร้า (1)')
  await expect(page.getByText('ยังไม่มีคำสั่งซื้อ')).toBeVisible()

  await page.getByTestId('cart-link').click()
  await page.getByRole('link', { name: 'ชำระเงิน' }).click()
  await page.getByLabel('ชื่อผู้รับ').fill('Buyer')
  await page.getByLabel('ที่อยู่', { exact: true }).fill('1 Silom')
  await page.getByRole('button', { name: 'สั่งซื้อ' }).click()
  await expect(page.getByTestId('order-number')).toHaveText('1002')
  await page.getByRole('link', { name: 'ดูคำสั่งซื้อของฉัน' }).click()
  // Only their own: not the guest's 1001.
  await expect(page.getByTestId('orders')).toContainText('1002')
  await expect(page.getByTestId('orders')).not.toContainText('1001')

  // Their account is for the shop, not the admin.
  await page.goto('/admin/login')
  await page.getByLabel('Email').fill(CUSTOMER.email)
  await page.getByLabel('Password').fill(CUSTOMER.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByText('This account is for the website, not the admin.')).toBeVisible()
})
