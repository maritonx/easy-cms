import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BlobsServer } from '@netlify/blobs/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { netlifyBlobsStorage } from '../src/index.js'

/** Against Netlify's own local blobs server. */
const dir = mkdtempSync(join(tmpdir(), 'easy-cms-blobs-'))
const token = 'test-token'
let server: BlobsServer
let edgeURL = ''

beforeAll(async () => {
  server = new BlobsServer({ directory: dir, token })
  const { port } = await server.start()
  edgeURL = `http://localhost:${port}`
})
afterAll(async () => {
  await server.stop()
  rmSync(dir, { recursive: true, force: true })
})

describe('netlifyBlobsStorage', () => {
  it('stores, reads and deletes files, served through the API', async () => {
    const storage = netlifyBlobsStorage({
      siteID: 'site-1',
      token,
      edgeURL,
      uncachedEdgeURL: edgeURL,
    })
    await storage.put('photo-1.png', new Uint8Array([1, 2, 3]), { contentType: 'image/png' })
    expect(await storage.get('photo-1.png')).toEqual({ body: new Uint8Array([1, 2, 3]), size: 3 })
    expect(storage.url).toBeUndefined()
    await storage.delete('photo-1.png')
    expect(await storage.get('photo-1.png')).toBeNull()
    expect(await storage.get('never-there.png')).toBeNull()
  })
})
