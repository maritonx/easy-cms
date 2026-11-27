import { fileURLToPath } from 'node:url'
import { verifyPassword } from '@easy-cms/core/internal'
import { build } from 'esbuild'
import { type Browser, chromium } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DIALECT } from './helpers.js'

// Core, drizzle and the in-memory database bundled for a browser with the `easy-cms-browser`
// condition, as Studio does (ADR-0074), then run in headless Chromium on an https page (a secure
// context, as Studio's). Chrome first (installed on dev machines and GitHub's runners), then
// Playwright's own Chromium.

const ENTRY = `
  import { createEasyCMS, defineConfig, resolveConfig, createRestHandler, silentLogger } from '@easy-cms/core'
  import { createContext, hash, hashPassword, verifyPassword } from '@easy-cms/core/internal'
  import { buildSchema, Migrator } from '@easy-cms/drizzle'
  import { memory } from '@easy-cms/db-memory'

  window.run = async (stored) => {
    const config = await resolveConfig(
      defineConfig({
        secret: '9b2e7c41d8f05a63e1c4b7d92a0f6e38',
        db: { name: 'browser-test', init: async () => ({}) },
        collections: [
          { slug: 'posts', fields: [{ name: 'title', type: 'text', required: true }, { name: 'slug', type: 'slug', from: 'title' }] },
        ],
      }),
    )
    const context = createContext()
    const seen = await context.run('request', async () => {
      await new Promise((resolve) => setTimeout(resolve, 1))
      return context.getStore()
    })
    return {
      collections: config.collections.map((c) => c.slug),
      handler: typeof createRestHandler,
      drizzle: [typeof buildSchema, typeof Migrator],
      sha256: hash('sha256', 'abc', 'hex'),
      context: [seen, context.getStore() ?? null],
      madeHere: await hashPassword('correct horse'),
      verifiesNode: await verifyPassword('correct horse', stored),
      refusesWrong: await verifyPassword('wrong horse', stored),
    }
  }

  window.studio = async () => {
    const cms = await createEasyCMS(
      defineConfig({
        secret: '9b2e7c41d8f05a63e1c4b7d92a0f6e38',
        db: memory({ name: 'studio' }),
        collections: [
          {
            slug: 'posts',
            drafts: true,
            fields: [{ name: 'title', type: 'text', required: true }, { name: 'slug', type: 'slug', from: 'title' }],
          },
        ],
      }),
      { logger: silentLogger },
    )
    const handle = createRestHandler(cms)
    const call = async (path, { method = 'GET', body, token } = {}) => {
      const headers = {}
      if (body) headers['content-type'] = 'application/json'
      if (token) headers.authorization = 'Bearer ' + token
      const response = await handle(
        new Request('https://studio.test/api/cms' + path, { method, headers, body: body && JSON.stringify(body) }),
      )
      const text = await response.text()
      return { status: response.status, json: text ? JSON.parse(text) : undefined }
    }
    await cms.create('users', { email: 'admin@studio.test', password: 'password123', role: 'admin' })
    const login = await call('/auth/login', { method: 'POST', body: { email: 'admin@studio.test', password: 'password123' } })
    // A Service Worker can't set cookies: Studio's admin sends the session token (issue 8).
    const { token } = await cms.auth.login({ email: 'admin@studio.test', password: 'password123' })
    const created = await call('/posts', { method: 'POST', token, body: { title: 'Hello Studio' } })
    const id = created.json.id
    const updated = await call('/posts/' + id, { method: 'PATCH', token, body: { title: 'Hello again' } })
    const listed = await call('/posts?draft=true', { token })
    const schema = await call('/admin/ui/schema', { token })
    const removed = await call('/posts/' + id, { method: 'DELETE', token })
    const after = await call('/posts?draft=true', { token })
    await cms.destroy()
    return {
      login: login.status,
      created: [created.status, created.json.slug],
      updated: [updated.status, updated.json.title],
      listed: listed.json.docs.map((d) => d.title),
      schema: [schema.status, schema.json.collections.map((c) => c.slug)],
      removed: removed.status,
      after: after.json.totalDocs,
    }
  }
`

// Not about the database: once, in the SQLite project.
const once = DIALECT === 'sqlite'
let browser: Browser | undefined
let code = ''
const warnings: string[] = []

beforeAll(async () => {
  if (!once) return
  const result = await build({
    stdin: { contents: ENTRY, resolveDir: fileURLToPath(new URL('.', import.meta.url)) },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    conditions: ['easy-cms-browser'],
    logLevel: 'silent',
  })
  warnings.push(...result.warnings.map((w) => w.text))
  code = result.outputFiles[0]?.text ?? ''
  browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
})

afterAll(async () => {
  await browser?.close()
})

/** A page on https://studio.test with the bundle loaded; errors it throws are collected. */
async function studioPage() {
  const page = await (browser as Browser).newPage()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('https://studio.test/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Studio</title>' }),
  )
  await page.goto('https://studio.test/')
  await page.addScriptTag({ content: code, type: 'module' })
  await page.waitForFunction(() => 'studio' in globalThis)
  return { page, errors }
}

describe.runIf(once)('the browser build in Chromium', () => {
  it('bundles with no Node modules', () => {
    expect(code.length).toBeGreaterThan(0)
    expect(warnings).toEqual([])
  })

  it('resolves a config, hashes, keeps context, and shares password hashes with Node', async () => {
    const { hashPassword } = await import('@easy-cms/core/internal')
    const stored = await hashPassword('correct horse')
    const { page, errors } = await studioPage()
    const result = await page.evaluate(
      (s) => (globalThis as unknown as { run(s: string): Promise<Record<string, unknown>> }).run(s),
      stored,
    )
    expect(errors).toEqual([])
    expect(result).toMatchObject({
      collections: expect.arrayContaining(['posts']),
      handler: 'function',
      drizzle: ['function', 'function'],
      sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      context: ['request', null],
      verifiesNode: true,
      refusesWrong: false,
    })
    expect(await verifyPassword('correct horse', result.madeHere as string)).toBe(true)
  })

  it('runs a CMS on the in-memory database: login, CRUD and the admin schema over REST', async () => {
    const { page, errors } = await studioPage()
    const result = await page.evaluate(() =>
      (globalThis as unknown as { studio(): Promise<Record<string, unknown>> }).studio(),
    )
    expect(errors).toEqual([])
    expect(result).toEqual({
      login: 200,
      created: [201, 'hello-studio'],
      updated: [200, 'Hello again'],
      listed: ['Hello again'],
      schema: [200, expect.arrayContaining(['posts'])],
      removed: 200,
      after: 0,
    })
  })
})
