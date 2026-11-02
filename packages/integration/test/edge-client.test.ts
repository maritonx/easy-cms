import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { createRequire } from 'node:module'
import type { AddressInfo } from 'node:net'
import { createRestHandler, defineConfig } from '@easy-cms/core'
import { EdgeRuntime } from 'edge-runtime'
import { Miniflare } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, open, SECRET } from './helpers.js'

// `@easy-cms/core/client` in the two edge runtimes sites deploy to: Vercel's (edge-runtime) and
// Cloudflare's (workerd, through Miniflare), reading from a CMS running here (#336).

const config = defineConfig({
  secret: SECRET,
  db: db(),
  collections: [
    {
      slug: 'posts',
      drafts: true,
      access: { read: () => true },
      fields: [{ name: 'title', type: 'text', required: true }],
    },
  ],
  globals: [
    { slug: 'site', access: { read: () => true }, fields: [{ name: 'name', type: 'text' }] },
  ],
})

/** The built client, as the package publishes it. */
const clientFile = createRequire(import.meta.url).resolve('@easy-cms/core/client')
const clientCode = readFileSync(clientFile, 'utf8')

/** What each runtime reads; the same script runs in both. */
const script = `
  const cms = createClient({ url: API })
  const list = await cms.find('posts', { where: { title: { like: 'Pub' } }, sort: 'title' })
  const site = await cms.findGlobal('site')
  const draft = await cms.findById('posts', DRAFT_ID, { preview: PREVIEW })
  const missing = await cms.findById('posts', 999999)
  let refused = null
  try { await cms.findById('posts', DRAFT_ID, { preview: 'not-a-token' }) }
  catch (e) { refused = { name: e.name, status: e.status } }
  return {
    titles: list.docs.map((d) => d.title),
    total: list.totalDocs,
    site: site.name,
    draft: draft && { title: draft.title, status: draft.status },
    missing,
    refused,
  }
`

let server: Server
let api: string
let vars: string
let close: () => Promise<void>
beforeAll(async () => {
  const cms = await open(config)
  await cms.create('posts', { title: 'Published B', status: 'published' })
  await cms.create('posts', { title: 'Published A', status: 'published' })
  const draft = await cms.create('posts', { title: 'Still a draft', status: 'draft' })
  await cms.updateGlobal('site', { name: 'Edge site' })
  const preview = cms.createPreviewToken({ collection: 'posts', id: draft.id })
  const handle = createRestHandler(cms)
  server = createServer(async (req, res) => {
    const response = await handle(new Request(`http://${req.headers.host}${req.url}`))
    res.writeHead(response.status, Object.fromEntries(response.headers))
    res.end(Buffer.from(await response.arrayBuffer()))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  api = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/cms`
  vars = `const API = ${JSON.stringify(api)}, DRAFT_ID = ${JSON.stringify(draft.id)}, PREVIEW = ${JSON.stringify(preview)};`
  close = async () => {
    await new Promise((resolve) => server.close(resolve))
    await cms.destroy()
  }
})
afterAll(() => close?.())

const expected = {
  titles: ['Published A', 'Published B'],
  total: 2,
  site: 'Edge site',
  draft: { title: 'Still a draft', status: 'draft' },
  missing: null,
  refused: { name: 'EasyCMSClientError', status: 401 },
}

/** The ES module as a script: `export { a, b }` becomes plain declarations in scope. */
const asScript = clientCode.replace(/^export\s*\{[^}]*\};?\s*$/m, '')

describe('@easy-cms/core/client on edge runtimes (#336)', () => {
  it('reads posts, a global and a draft by preview token on Vercel’s edge runtime', async () => {
    const runtime = new EdgeRuntime({
      initialCode: `${asScript}\n${vars}\nglobalThis.run = async () => {${script}}`,
    })
    expect(runtime.evaluate('typeof process')).toBe('undefined')
    const result = await runtime.evaluate<Promise<unknown>>('run().then(JSON.stringify)')
    expect(JSON.parse(result as unknown as string)).toEqual(expected)
  })

  it('does the same in a Cloudflare Worker (workerd)', async () => {
    const mf = new Miniflare({
      modules: [
        {
          type: 'ESModule',
          path: 'worker.mjs',
          contents: `import { createClient } from './client.mjs'\n${vars}
            export default { async fetch() { return Response.json(await (async () => {${script}})()) } }`,
        },
        { type: 'ESModule', path: 'client.mjs', contents: clientCode },
      ],
      compatibilityDate: '2026-01-01',
    })
    try {
      const res = await mf.dispatchFetch('http://worker/')
      expect(await res.json()).toEqual(expected)
    } finally {
      await mf.dispose()
    }
  })
})
