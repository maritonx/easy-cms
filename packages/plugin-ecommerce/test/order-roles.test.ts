import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEasyCMS, createRestHandler, defineConfig, silentLogger } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ecommercePlugin, manualAdapter } from '../src/index.js'

/** The actions on an order (paid, sent, cancelled, refunded) take update access to it. */
const config = defineConfig({
  secret: 'x'.repeat(32),
  db: sqlite({ url: 'file:./cms.db' }),
  auth: { rbac: true, roles: ['admin', 'support'] },
  plugins: [
    ecommercePlugin({
      currencies: { supported: ['THB'] },
      payments: { methods: [manualAdapter({ instructions: 'Pay to KBank 123-4-56789-0' })] },
    }),
  ],
})

let dir: string
let cms: Awaited<ReturnType<typeof createEasyCMS<typeof config>>>
let handle: (request: Request) => Promise<Response>
const token: Record<string, string> = {}

async function call(method: string, path: string, as: string, body?: unknown) {
  const response = await handle(
    new Request(`http://shop.test/api/cms${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token[as]}`,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  )
  const text = await response.text()
  // biome-ignore lint/suspicious/noExplicitAny: response bodies, checked by the assertions
  return { status: response.status, body: (text ? JSON.parse(text) : {}) as any }
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'easy-cms-order-roles-'))
  cms = await createEasyCMS(config, { cwd: dir, schema: 'push', logger: silentLogger })
  handle = createRestHandler(cms)
  for (const [email, role] of [
    ['admin@x.co', 'admin'],
    ['sam@x.co', 'support'],
  ] as const) {
    await cms.create('users', { email, role, password: 'password123' } as never)
    token[role] = (await cms.auth.login({ email, password: 'password123' })).token
  }
  // Support may look at orders, not change them.
  const roles = await call('GET', '/admin/roles', 'admin')
  const support = (roles.body.roles ?? roles.body).find((r: { key: string }) => r.key === 'support')
  const set = await call('PATCH', `/admin/roles/${support.id}`, 'admin', {
    permissions: { collections: { orders: ['read'] } },
  })
  expect(set.status).toBe(200)
})

afterAll(async () => {
  await cms.destroy()
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  } catch {
    // Windows may still hold the SQLite file; the OS cleans temp.
  }
})

describe('order actions', () => {
  it('need update access to the order, not just read', async () => {
    const order = await cms.create(
      'orders',
      { status: 'pending', currency: 'THB', email: 'buyer@x.co', items: [], total: 0 } as never,
      { context: {} },
    )
    expect((await call('GET', `/orders/${order.id}`, 'support')).status).toBe(200)
    const paid = await call('POST', `/shop/orders/${order.id}/paid`, 'support', {})
    expect(paid.status).toBe(403)
    expect((await cms.findById('orders', order.id))?.status).toBe('pending')
    const byAdmin = await call('POST', `/shop/orders/${order.id}/paid`, 'admin', {})
    expect(byAdmin.status).toBe(200)
    expect(byAdmin.body.order.status).toBe('paid')
  })
})
