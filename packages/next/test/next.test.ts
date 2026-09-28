import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import type { NextConfig } from 'next'
import { afterAll, describe, expect, it } from 'vitest'
import { SERVER_EXTERNAL_PACKAGES, withEasyCMS } from '../src/config.js'
import { createAdminRouteHandlers, createRouteHandlers, getEasyCMS } from '../src/index.js'

/** Temp cleanup: Windows may still hold SQLite files for a moment after close; retry, then give up quietly. */
function removeTemp(path: string) {
  try {
    rmSync(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  } catch {
    // leave it to the OS temp cleaner
  }
}

const dir = mkdtempSync(join(tmpdir(), 'easy-cms-next-'))
afterAll(() => removeTemp(dir))

const config = defineConfig({
  secret: 's'.repeat(32),
  db: sqlite({ url: `file:${join(dir, 'cms.db')}` }),
  collections: [
    { slug: 'notes', access: { read: () => true }, fields: [{ name: 'text', type: 'text' }] },
  ],
})

describe('getEasyCMS', () => {
  it('returns one typed instance per config', async () => {
    const a = await getEasyCMS(config)
    const b = await getEasyCMS(config)
    expect(a).toBe(b)
    const note = await a.create('notes', { text: 'hi' })
    expect(note.text).toBe('hi')
  })

  it('shares the instance between copies of the same config, as Next.js server layers load it', async () => {
    const a = await getEasyCMS(config)
    // Another layer's copy: equal content, other objects, functions compiled anew.
    const copy = {
      ...config,
      collections: [{ ...config.collections[0], access: { read: () => true } }],
    } as typeof config
    const b = await getEasyCMS(copy)
    expect(b).toBe(a)
    // Still open: the first layer's instance was not closed under it.
    expect((await a.find('notes')).totalDocs).toBe(1)
  })

  it('makes a new instance when the structure changes (a development edit)', async () => {
    const a = await getEasyCMS(config)
    const edited = defineConfig({
      ...config,
      collections: [{ ...config.collections[0], fields: [{ name: 'text', type: 'textarea' }] }],
    })
    const b = await getEasyCMS(edited)
    expect(b).not.toBe(a)
    expect((await b.find('notes')).totalDocs).toBe(1)
  })
})

describe('createRouteHandlers', () => {
  it('serves the REST API for every method', async () => {
    const handlers = createRouteHandlers(config)
    expect(Object.keys(handlers).sort()).toEqual([
      'DELETE',
      'GET',
      'HEAD',
      'OPTIONS',
      'PATCH',
      'POST',
      'PUT',
    ])
    const res = await handlers.GET(new Request('http://x.test/api/cms/notes'))
    expect(res.status).toBe(200)
    expect(((await res.json()) as { docs: unknown[] }).docs).toHaveLength(1)
  })
})

describe('createAdminRouteHandlers', () => {
  it('serves the admin shell at the bare path without redirecting', async () => {
    const { GET } = createAdminRouteHandlers(config)
    const res = await GET(new Request('http://x.test/admin'))
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('<base href="/admin/">')
  })
})

describe('withEasyCMS', () => {
  it('accepts a config typed as NextConfig', async () => {
    // create-next-app writes `const nextConfig: NextConfig = {}`; this must type-check.
    const nextConfig: NextConfig = { reactStrictMode: true }
    const config: NextConfig = await withEasyCMS(nextConfig)('phase-production-build', {
      defaultConfig: {},
    })
    expect(config.reactStrictMode).toBe(true)
    expect(config.serverExternalPackages).toContain('@easy-cms/core')
  })

  it('adds server externals and tracing includes, keeping the user config', async () => {
    const make = withEasyCMS({ reactStrictMode: true, serverExternalPackages: ['mine'] })
    const result = await make('phase-production-build', { defaultConfig: {} })
    expect(result.reactStrictMode).toBe(true)
    expect(result.serverExternalPackages).toEqual(
      expect.arrayContaining(['mine', ...SERVER_EXTERNAL_PACKAGES]),
    )
    expect(result.outputFileTracingIncludes?.['/**']).toContain('easy-cms/migrations/**')
  })

  it('traces admin modules that plugins add', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'easy-cms-next-'))
    const file = join(dir, 'easy-cms.config.mjs')
    // Any file the project can resolve stands in for a plugin's admin module.
    writeFileSync(
      file,
      `export default { plugins: [(c) => ({ ...c, admin: { modules: ['@easy-cms/admin/package.json'] } })] }`,
    )
    try {
      const result = await withEasyCMS({}, { configPath: file })('phase-production-build', {
        defaultConfig: {},
      })
      expect(result.outputFileTracingIncludes['/**']).toEqual(
        expect.arrayContaining([expect.stringMatching(/admin\/package\.json$/)]),
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('accepts a config function', async () => {
    const make = withEasyCMS(async (phase) => ({ env: { PHASE: phase } }))
    const result = await make('phase-development-server', { defaultConfig: {} })
    expect(result.env).toEqual({ PHASE: 'phase-development-server' })
  })
})
