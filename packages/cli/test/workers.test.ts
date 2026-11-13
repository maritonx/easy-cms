import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type StorageAdapter } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { ADMIN_ASSETS, createWorker, type WorkerEnv } from '../src/workers.js'

// The Worker's logic on Node; it runs in workerd in the smoke test (ADR-0067).

const TMP = join(import.meta.dirname, '.tmp')
const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
})

const memory = (): StorageAdapter => {
  const files = new Map<string, Uint8Array>()
  return {
    name: 'memory',
    apiVersion: 1,
    async put(key, data) {
      files.set(key, data)
    },
    async get(key) {
      const body = files.get(key)
      return body ? { body, size: body.byteLength } : null
    },
    async delete(key) {
      files.delete(key)
    },
  }
}

function config(storage?: StorageAdapter) {
  mkdirSync(TMP, { recursive: true })
  const dir = mkdtempSync(join(TMP, 'worker-'))
  dirs.push(dir)
  return defineConfig({
    secret: 's'.repeat(32),
    db: sqlite({ url: `file:${join(dir, 'cms.db')}` }),
    ...(storage ? { upload: { storage } } : {}),
    collections: [{ slug: 'posts', fields: [{ name: 'title', type: 'text' }] }],
  })
}

describe('createWorker', () => {
  it('refuses a config without upload.storage: a Worker has no disk', () => {
    expect(() => createWorker(config())).toThrow(/upload\.storage/)
  })

  it('serves the API, and the admin from the ASSETS binding', async () => {
    const asked: string[] = []
    const env: WorkerEnv = {
      ASSETS: {
        async fetch(request) {
          const { pathname } = new URL(String(request instanceof Request ? request.url : request))
          asked.push(pathname)
          return pathname === `${ADMIN_ASSETS}/shell.html`
            ? new Response('<html><head></head><body></body></html>')
            : new Response('Not found', { status: 404 })
        },
      },
    }
    const waited: Promise<unknown>[] = []
    const ctx = { waitUntil: (task: Promise<unknown>) => void waited.push(task) }
    const worker = createWorker(config(memory()))

    const health = await worker.fetch(new Request('http://cms.test/healthz'), env, ctx)
    expect(health.status).toBe(200)
    const posts = await worker.fetch(new Request('http://cms.test/api/cms/posts'), env, ctx)
    expect(posts.status).toBe(401)
    const admin = await worker.fetch(new Request('http://cms.test/admin/'), env, ctx)
    expect(await admin.text()).toContain('<base href="/admin/">')
    expect(asked).toEqual([`${ADMIN_ASSETS}/shell.html`])

    // Cron Triggers: the jobs run, and the Worker is kept until they finish.
    await worker.scheduled({}, env, ctx)
    expect(waited).toHaveLength(1)
    await Promise.all(waited)
  })
})
