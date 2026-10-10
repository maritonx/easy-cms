import { createEasyCMS, createRestHandler, defineConfig } from '@easy-cms/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, open, SECRET, tempProject } from './helpers.js'

/** `auth.setupCode` (EASY_CMS_SETUP_CODE): only whoever deployed the site creates the first admin. */
let cms: Awaited<ReturnType<typeof open>>
let handle: ReturnType<typeof createRestHandler>

beforeAll(async () => {
  cms = await open(
    defineConfig({
      secret: SECRET,
      db: db(),
      auth: { setupCode: 'open-sesame-42' },
      audit: true,
      collections: [],
    }),
    tempProject(),
  )
  handle = createRestHandler(cms)
})
afterAll(() => cms.destroy())

const register = (body: Record<string, string>) =>
  handle(
    new Request('http://cms.test/api/cms/auth/first-register', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://cms.test' },
      body: JSON.stringify({ email: 'owner@x.co', password: 'password123', ...body }),
    }),
  )

describe('the setup code', () => {
  it('is asked for, and the first admin needs it', async () => {
    const init = (await (
      await handle(new Request('http://cms.test/api/cms/auth/init'))
    ).json()) as {
      setupCode: boolean
    }
    expect(init.setupCode).toBe(true)
    const wrong = await register({ setupCode: 'guess' })
    expect(wrong.status).toBe(400)
    expect(JSON.stringify(await wrong.json())).toContain('setupCode')
    expect((await register({})).status).toBe(400)
    expect(await cms.auth.hasUsers()).toBe(false)
    expect((await register({ setupCode: 'open-sesame-42' })).status).toBe(200)
    // Recorded, with who it was.
    const [entry] = (await cms.audit.list({ action: 'setup' })).docs
    expect(entry).toMatchObject({ action: 'setup', detail: { setupCode: true } })
    expect(entry?.actor.email).toBe('owner@x.co')
    expect((await register({ setupCode: 'open-sesame-42' })).status).toBe(403)
  })
})

describe('without a setup code', () => {
  it('warns in production while no admin exists', async () => {
    const warnings: string[] = []
    const logger = { info: () => {}, warn: (m: string) => warnings.push(m), error: () => {} }
    const config = defineConfig({ secret: SECRET, db: db(), collections: [] })
    const before = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      const first = await createEasyCMS(config, { cwd: tempProject(), schema: 'push', logger })
      await first.destroy()
    } finally {
      process.env.NODE_ENV = before
    }
    expect(warnings.some((w) => w.includes('No admin exists yet'))).toBe(true)
  })
})
