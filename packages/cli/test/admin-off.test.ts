import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createEasyCMS, defineConfig, resolveConfig, silentLogger } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { buildWorkers } from '../src/build-workers.js'
import { createStandaloneHandler } from '../src/handler.js'

// `admin: { enabled: false }` (#442) in `easy-cms serve` and the Workers build.

const TMP = join(import.meta.dirname, '.tmp')
const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    } catch {
      // leave it to the OS temp cleaner
    }
  }
})

function project() {
  mkdirSync(TMP, { recursive: true })
  const dir = mkdtempSync(join(TMP, 'no-admin-'))
  dirs.push(dir)
  const config = defineConfig({
    secret: 's'.repeat(32),
    db: sqlite({ url: `file:${join(dir, 'cms.db')}` }),
    admin: { enabled: false },
    collections: [
      { slug: 'posts', access: { read: () => true }, fields: [{ name: 'title', type: 'text' }] },
    ],
  })
  return { dir, config }
}

describe('easy-cms serve without the admin UI (#442)', () => {
  it('answers 404 at the admin and at /, and serves the API', async () => {
    const { dir, config } = project()
    const cms = await createEasyCMS(config, { cwd: dir, scheduler: false, logger: silentLogger })
    const handle = createStandaloneHandler(cms)
    const get = (path: string) => handle(new Request(`http://cms.test${path}`))
    expect((await get('/admin/')).status).toBe(404)
    expect((await get('/admin/collections/posts')).status).toBe(404)
    expect((await get('/')).status).toBe(404)
    expect((await get('/api/cms/posts')).status).toBe(200)
    expect((await get('/api/cms/admin/ui/schema')).status).toBe(404)
    expect((await get('/healthz')).status).toBe(200)
    await cms.destroy()
  })
})

describe('easy-cms build --target workers without the admin UI (#442)', () => {
  it('leaves the admin app out of the assets', async () => {
    const { dir, config } = project()
    const configFile = join(dir, 'easy-cms.config.ts')
    writeFileSync(configFile, 'export default {}\n')
    const resolved = await resolveConfig({
      ...config,
      upload: { storage: { name: 'memory', apiVersion: 1 } as never },
    })
    const { dir: out } = await buildWorkers({ cwd: dir, configFile, config: resolved })
    expect(existsSync(join(out, 'assets'))).toBe(true)
    expect(readdirSync(join(out, 'assets'))).toEqual([])
  })
})
