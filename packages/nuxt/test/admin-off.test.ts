import { fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import { fixture, freshDatabase } from './helpers.js'

// `admin: { enabled: false }` (#442): read by the module while it builds (in this process) and by
// the server when it starts (its env).
freshDatabase()
process.env.EASY_CMS_TEST_NO_ADMIN = '1'
const macOS = process.platform === 'darwin'
await setup({
  rootDir: fixture,
  dev: true,
  env: { EASY_CMS_TEST_NO_ADMIN: '1' },
  setupTimeout: macOS ? 280_000 : 180_000,
  ...(macOS && { serverStartTimeout: 180_000 }),
})

describe('@easy-cms/nuxt without the admin UI (#442)', () => {
  it('serves no admin, and the API as before', async () => {
    // The app's own pages answer there now (this fixture's app.vue renders every URL).
    for (const path of ['/admin', '/admin/collections/posts']) {
      const page = await fetch(path)
      expect(page.headers.get('content-security-policy') ?? '').not.toContain('frame-ancestors')
      expect(await page.text()).not.toContain('<base href="/admin/">')
    }
    expect((await fetch('/api/cms/posts')).status).toBe(200)
    expect((await fetch('/api/cms/admin/ui/schema')).status).toBe(404)
  })
})
