import { fileURLToPath } from 'node:url'
import { verifyPassword } from '@easy-cms/core/internal'
import { build } from 'esbuild'
import { type Browser, chromium } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DIALECT } from './helpers.js'

// Core and drizzle bundled for a browser with the `easy-cms-browser` condition, as Studio does
// (ADR-0074), then run in headless Chromium. A database in the browser comes with the in-memory
// adapter (directions/issues/7); until then this covers what runs without one.
// Chrome first (installed on dev machines and GitHub's runners), then Playwright's own Chromium.

const ENTRY = `
  import { defineConfig, resolveConfig, createRestHandler } from '@easy-cms/core'
  import { createContext, hash, hashPassword, verifyPassword } from '@easy-cms/core/internal'
  import { buildSchema, Migrator } from '@easy-cms/drizzle'

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

describe.runIf(once)('the browser build in Chromium', () => {
  it('bundles with no Node modules', () => {
    expect(code.length).toBeGreaterThan(0)
    expect(warnings).toEqual([])
  })

  it('resolves a config, hashes, keeps context, and shares password hashes with Node', async () => {
    const { hashPassword } = await import('@easy-cms/core/internal')
    const stored = await hashPassword('correct horse')
    const page = await (browser as Browser).newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.addScriptTag({ content: code, type: 'module' })
    await page.waitForFunction(() => 'run' in globalThis)
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
})
