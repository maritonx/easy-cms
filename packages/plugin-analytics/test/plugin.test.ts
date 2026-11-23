import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type Config,
  createEasyCMS,
  createRestHandler,
  defineConfig,
  silentLogger,
} from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { analyticsPlugin } from '../src/index.js'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0))
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    } catch {
      // The OS cleans its temp directory.
    }
})

async function setup(
  options: Parameters<typeof analyticsPlugin>[0] = {},
  extra: Partial<Config> = {},
) {
  const config = defineConfig({
    secret: 'x'.repeat(32),
    db: sqlite({ url: 'file:./cms.db' }),
    collections: [{ slug: 'posts', fields: [{ name: 'title', type: 'text' }] }],
    plugins: [analyticsPlugin(options)],
    ...extra,
  })
  const cwd = mkdtempSync(join(tmpdir(), 'easy-cms-analytics-'))
  dirs.push(cwd)
  const cms = await createEasyCMS(config, {
    cwd,
    schema: 'push',
    logger: silentLogger,
    scheduler: false,
  })
  const handle = createRestHandler(cms)
  const get = (path: string) => handle(new Request(`http://site.test/api/cms${path}`))
  const post = (path: string, body: unknown) =>
    handle(
      new Request(`http://site.test/api/cms${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://site.test' },
        body: JSON.stringify(body),
      }),
    )
  return { cms, get, post }
}

describe('analyticsPlugin', () => {
  it('serves the script with the container, the texts and short caching', async () => {
    const { cms, get } = await setup({ defaults: { gtm: 'GTM-ABC1234' } })
    try {
      let response = await get('/analytics.js')
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
      expect(response.headers.get('cache-control')).toBe('public, max-age=60')
      let script = await response.text()
      expect(script).toContain('"gtm":"GTM-ABC1234"')
      expect(script).toContain('"api":"/api/cms"')
      expect(script).toContain('ปฏิเสธทั้งหมด')
      const before = /"version":"([a-z0-9]+)"/.exec(script)?.[1]

      // The admin's values win, and new texts are a new version: visitors are asked again.
      await cms.updateGlobal('analytics', {
        gtm: 'GTM-XYZ9876',
        title: 'Cookies?',
        privacy: '/privacy',
        region: 'eea-th',
      })
      response = await get('/analytics.js')
      script = await response.text()
      expect(script).toContain('"gtm":"GTM-XYZ9876"')
      expect(script).toContain('"title":"Cookies?"')
      expect(script).toContain('"region":"eea-th"')
      expect(/"version":"([a-z0-9]+)"/.exec(script)?.[1]).not.toBe(before)
      // `</script>` in a text can't end the page's script element.
      await cms.updateGlobal('analytics', { text: '</script><b>hi' })
      expect(await (await get('/analytics.js')).text()).not.toContain('</script><b>')
    } finally {
      await cms.destroy()
    }
  })

  it('uses the defaults until an admin saves', async () => {
    const { cms, get } = await setup({ defaults: { banner: false, region: 'eea-th' } })
    try {
      let script = await (await get('/analytics.js')).text()
      expect(script).toContain('"banner":false')
      expect(script).toContain('"gtm":null')
      expect(script).toContain('"region":"eea-th"')
      await cms.updateGlobal('analytics', { banner: true, region: 'everywhere' })
      script = await (await get('/analytics.js')).text()
      expect(script).toContain('"banner":true')
      expect(script).toContain('"region":"everywhere"')
    } finally {
      await cms.destroy()
    }
  })

  it('refuses a container ID that is not one', async () => {
    expect(() => analyticsPlugin({ defaults: { gtm: 'UA-1234' } })).toThrow('not a container ID')
    const { cms } = await setup()
    try {
      await expect(cms.updateGlobal('analytics', { gtm: 'G-ABC' })).rejects.toThrow()
    } finally {
      await cms.destroy()
    }
  })

  it('records consent without an IP address, and only what looks right', async () => {
    const { cms, post } = await setup()
    try {
      const good = {
        id: 'b1e9a0c2-7f4d-4c1e-9a2b-1234567890ab',
        analytics: true,
        marketing: false,
        version: 'abc12',
      }
      expect((await post('/analytics/consent', good)).status).toBe(204)
      const { docs } = await cms.find('consent-records')
      expect(docs).toHaveLength(1)
      expect(docs[0]).toMatchObject({
        consentId: good.id,
        analytics: true,
        marketing: false,
        version: 'abc12',
      })
      expect(JSON.stringify(docs[0])).not.toMatch(/203\.|ip/i)

      for (const bad of [
        { ...good, id: 'x' },
        { ...good, id: '<script>alert(1)</script>' },
        { ...good, analytics: 'yes' },
        { ...good, version: 'NOT VALID' },
        null,
      ])
        expect((await post('/analytics/consent', bad)).status).toBe(400)

      // Records off: nothing kept.
      await cms.updateGlobal('analytics', { record: false })
      expect((await post('/analytics/consent', good)).status).toBe(204)
      expect(await cms.count('consent-records')).toBe(1)
    } finally {
      await cms.destroy()
    }
  })

  it('keeps the records out of reach of visitors and editors', async () => {
    const { cms } = await setup()
    try {
      const visitor = { user: null, overrideAccess: false } as const
      await expect(cms.find('consent-records', visitor)).rejects.toThrow()
      await expect(
        cms.create('consent-records', { consentId: 'fake-0000' }, { ...visitor }),
      ).rejects.toThrow()
      await expect(cms.findGlobal('analytics', visitor)).rejects.toThrow()
    } finally {
      await cms.destroy()
    }
  })

  it('refuses names that are taken', () => {
    const apply = analyticsPlugin() as unknown as (config: Partial<Config>) => Config
    expect(() => apply({ globals: [{ slug: 'analytics', fields: [] }] })).toThrow(
      '"analytics" is taken',
    )
  })
})
