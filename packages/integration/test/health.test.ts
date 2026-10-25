import {
  type Config,
  createApiHandler,
  createEasyCMS,
  createRestHandler,
  defineConfig,
  jsonLogger,
  silentLogger,
} from '@easy-cms/core'
import { describe, expect, it } from 'vitest'
import { db, open, SECRET, tempProject } from './helpers.js'

const config = defineConfig({
  secret: SECRET,
  db: db(),
  collections: [{ slug: 'posts', fields: [{ name: 'title', type: 'text' }] }],
})

const get = (handle: (r: Request) => Promise<Response>, path: string, init: RequestInit = {}) =>
  handle(new Request(`http://cms.test/api/cms${path}`, init))

describe('/healthz and /readyz (#158)', () => {
  it('answer without credentials, even a bad token, and are never cached', async () => {
    const cms = await open(config)
    const handle = createRestHandler(cms)
    const live = await get(handle, '/healthz', { headers: { authorization: 'Bearer ecms_bad' } })
    expect(live.status).toBe(200)
    expect(await live.text()).toBe('ok')
    expect(live.headers.get('cache-control')).toBe('no-store')

    const ready = await get(handle, '/readyz')
    expect(ready.status).toBe(200)
    expect(ready.headers.get('cache-control')).toBe('no-store')
    expect(await ready.json()).toEqual({
      status: 'ok',
      checks: { database: 'ok', migrations: 'ok' },
    })
    expect((await get(handle, '/readyz', { method: 'POST' })).status).toBe(405)
    await cms.destroy()
  })

  it('is not ready while a migration is pending', async () => {
    const cwd = tempProject()
    const tool = (c: Config) =>
      createEasyCMS(c, { cwd, schema: 'skip', scheduler: false, logger: silentLogger })
    const first = await tool(config)
    await first.db.createMigration({ name: 'init' })
    await first.db.migrate()
    await first.destroy()
    await new Promise((r) => setTimeout(r, 1100)) // names are timestamped to the second
    const changed = defineConfig({
      ...config,
      collections: [
        {
          slug: 'posts',
          fields: [
            { name: 'title', type: 'text' },
            { name: 'body', type: 'text' },
          ],
        },
      ],
    })
    const second = await tool(changed)
    await second.db.createMigration({ name: 'body' })
    const ready = await get(createRestHandler(second), '/readyz')
    expect(ready.status).toBe(503)
    expect(await ready.json()).toEqual({
      status: 'error',
      checks: { database: 'ok', migrations: '1 pending' },
    })
    await second.db.migrate()
    expect((await get(createRestHandler(second), '/readyz')).status).toBe(200)
    await second.destroy()
  })

  it('keeps probes out of the request log lines', async () => {
    const lines: Record<string, unknown>[] = []
    const cms = await createEasyCMS(config, {
      cwd: tempProject(),
      scheduler: false,
      logger: jsonLogger((line) => lines.push(JSON.parse(line))),
    })
    const handle = createRestHandler(cms)
    await get(handle, '/healthz')
    await get(handle, '/readyz')
    await get(handle, '/posts')
    expect(lines.filter((line) => 'status' in line).map((line) => line.path)).toEqual([
      '/api/cms/posts',
    ])
    await cms.destroy()
  })

  it('answers when the CMS cannot start: alive, not ready', async () => {
    const broken = defineConfig({
      secret: SECRET,
      db: {
        name: 'broken',
        apiVersion: 1,
        init: async () => {
          throw new Error('database unreachable')
        },
      },
      collections: [],
    })
    const handle = createApiHandler(broken)
    const original = console.error
    console.error = () => {}
    try {
      expect((await get(handle, '/healthz')).status).toBe(200)
      const ready = await get(handle, '/readyz')
      expect(ready.status).toBe(503)
      expect(await ready.json()).toEqual({ status: 'error', checks: { startup: 'error' } })
      await expect(get(handle, '/posts')).rejects.toThrow('database unreachable')
    } finally {
      console.error = original
    }
  })
})
