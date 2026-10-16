import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  consoleEmail,
  createEasyCMS,
  createRestHandler,
  defineConfig,
  silentLogger,
} from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { ecommercePlugin, manualAdapter } from '../src/index.js'

export const ORIGIN = 'http://shop.test'

const config = defineConfig({
  secret: 'x'.repeat(32),
  db: sqlite({ url: 'file:./cms.db' }),
  serverURL: ORIGIN,
  email: consoleEmail({ log: () => {} }),
  plugins: [ecommercePlugin({ payments: { methods: [manualAdapter()] } })],
})

/** A shop with a ฿250 mug and a customer (cust@example.com / customer-1), served in memory. */
export async function openShop() {
  const dir = mkdtempSync(join(tmpdir(), 'easy-cms-shop-client-'))
  const cms = await createEasyCMS(config, { cwd: dir, schema: 'push', logger: silentLogger })
  const handle = createRestHandler(cms)
  const mug = (
    await cms.create('products', { title: 'Mug', priceInTHB: 25_000, status: 'published' })
  ).id as number
  await cms.create('users', {
    email: 'cust@example.com',
    password: 'customer-1',
    role: 'customer',
    emailVerified: true,
  })

  /** A browser: requests to the handler, with its cookies, and its localStorage. */
  function browser() {
    const jar = new Map<string, string>()
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      headers.set('origin', ORIGIN)
      if (jar.size > 0) headers.set('cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '))
      const response = await handle(
        new Request(new URL(String(input), ORIGIN), { ...init, headers }),
      )
      for (const line of response.headers.getSetCookie()) {
        const [pair = ''] = line.split(';')
        const eq = pair.indexOf('=')
        const value = pair.slice(eq + 1)
        if (/max-age=0/i.test(line) || value === '') jar.delete(pair.slice(0, eq))
        else jar.set(pair.slice(0, eq), value)
      }
      return response
    }
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    }
    return { fetch: fetcher as typeof fetch, storage, store }
  }

  async function close() {
    await cms.destroy()
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    } catch {
      // Windows may still hold the SQLite file; the OS cleans temp.
    }
  }
  return { cms, mug, browser, close }
}
