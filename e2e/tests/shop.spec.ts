import { createHmac } from 'node:crypto'
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
  const me = await (await page.request.get('/api/cms/auth/me')).json()
  const response = await page.request.post(`/api/cms${path}`, {
    data,
    headers: { 'x-csrf-token': me.csrfToken, origin: new URL(page.url()).origin },
  })
  expect(response.ok(), await response.text()).toBe(true)
  return response.json()
}

test('sets up the owner, a product and a customer', async ({ page, baseURL }) => {
  // Retries start again from here: set up once.
  const init = await (await page.request.get('/api/cms/auth/init')).json()
  if (init.hasUsers) return
  const created = await page.request.post('/api/cms/auth/first-register', {
    data: { ...ADMIN, name: 'Owner' },
    headers: { origin: baseURL as string },
  })
  expect(created.status()).toBe(200)
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
  await page.getByLabel('โอนเงิน').check()
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
  await page.getByLabel('โอนเงิน').check()
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

/** What Stripe sends: the event, signed with the endpoint's secret (`STRIPE_WEBHOOK_SECRET`). */
function stripeEvent(type: string, intent: string) {
  const body = JSON.stringify({
    id: `evt_${intent}`,
    object: 'event',
    type,
    data: { object: { id: intent, object: 'payment_intent' } },
  })
  const t = Math.floor(Date.now() / 1000)
  const v1 = createHmac('sha256', 'whsec_e2e').update(`${t}.${body}`).digest('hex')
  return {
    data: body,
    headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${v1}` },
  }
}

test('a card payment arrives by Stripe webhook, once', async ({ page, request, baseURL }) => {
  const api = (path: string) => `/api/cms${path}`
  const origin = { origin: baseURL as string }
  const stock = async () =>
    (await (await page.request.get(api('/products?where[slug][equals]=jasmine-tea'))).json())
      .docs[0]
  // Staff read the stock; the guest and Stripe use their own requests, without that session.
  await login(page)
  const product = await stock()

  // A guest checks out with Stripe (the page would then show Stripe's Payment Element).
  const added = await (
    await request.post(api('/shop/cart/add'), {
      data: { product: product.id },
      headers: origin,
    })
  ).json()
  const started = await request.post(api('/shop/checkout'), {
    headers: origin,
    data: {
      cart: { id: added.cart.id, secret: added.secret },
      method: 'stripe',
      email: 'card@e2e.test',
      shippingAddress: { name: 'Card Buyer', line1: '5 Sathorn', country: 'TH' },
    },
  })
  expect(started.ok(), await started.text()).toBe(true)
  const { transaction, payment } = await started.json()
  expect(payment).toMatchObject({ publishableKey: 'pk_test_e2e' })
  const intent = String(payment.clientSecret).split('_secret_')[0] as string

  // A forged event is refused; Stripe's signed one makes the order.
  const forged = stripeEvent('payment_intent.succeeded', intent)
  const refused = await request.post(api('/shop/payments/stripe/webhook'), {
    data: forged.data,
    headers: { ...forged.headers, 'stripe-signature': 't=1,v1=forged' },
  })
  expect(refused.status()).toBe(400)
  for (let attempt = 0; attempt < 2; attempt++) {
    // Stripe retries a webhook it isn't sure arrived: the second changes nothing.
    const event = stripeEvent('payment_intent.succeeded', intent)
    const received = await request.post(api('/shop/payments/stripe/webhook'), event)
    expect(await received.json()).toEqual({ received: true })
  }

  const tx = await (await page.request.get(api(`/transactions/${transaction}`))).json()
  expect(tx.status).toBe('succeeded')
  const orders = await (
    await page.request.get(api(`/orders?where[email][equals]=card@e2e.test`))
  ).json()
  expect(orders.totalDocs).toBe(1)
  expect(orders.docs[0].status).toBe('paid')
  // The stock is taken once.
  expect((await stock()).inventory).toBe(product.inventory - 1)
})

test("Settings → Jobs shows the shop's jobs; an admin runs, pauses and resumes them (#185)", async ({
  page,
}) => {
  await login(page)
  const menu = page.getByRole('navigation', { name: 'Main menu' })
  await menu.getByRole('button', { name: 'Settings', exact: true }).click()
  await menu.getByRole('link', { name: 'Jobs' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Jobs' })).toBeVisible()
  const payments = page.locator('li.job').filter({ hasText: 'shop:payments' })
  await expect(payments).toContainText('Every 5 min')
  await expect(page.locator('li.job').filter({ hasText: 'shop:carts' })).toContainText('Every day')

  await page.getByRole('button', { name: 'Run due jobs now' }).click()
  await expect(page.getByRole('status').filter({ hasText: /^Ran / })).toBeVisible()
  await expect(payments).toContainText('OK')

  // Pausing asks first, then the job shows as paused (and on the dashboard).
  await payments.getByRole('button', { name: 'Pause' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Pause job' }).click()
  await expect(payments).toContainText('Paused')
  await page.goto('/admin/')
  await expect(page.getByText('Paused jobs: 1')).toBeVisible()
  await page.goto('/admin/jobs')
  await payments.getByRole('button', { name: 'Resume' }).click()
  await expect(payments.getByText('Paused', { exact: true })).toHaveCount(0)
  // The shop's jobs keep the plugin's schedule: no "Change schedule".
  await expect(payments.getByRole('button', { name: 'Change schedule' })).toHaveCount(0)
})
