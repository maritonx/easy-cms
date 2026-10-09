// Reads what seed.mjs wrote, with the Easy CMS version installed now.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createEasyCMS, createRestHandler } from '@easy-cms/core'
import config from './easy-cms.config.mjs'

const expected = JSON.parse(readFileSync('expected.json', 'utf8'))
// `verify`: the server's check in production, that the database matches the config.
const cms = await createEasyCMS(config, { cwd: process.cwd(), schema: 'verify', scheduler: false })
try {
  const live = await cms.findById('posts', expected.second, { depth: 1 })
  assert.equal(live?.title, 'Second')
  assert.deepEqual(live?.tags, ['news', 'howto'])
  assert.equal(live?.cover?.filename, expected.media.filename)
  assert.equal(live?.related?.title, 'First')
  const draft = await cms.findById('posts', expected.second, { draft: true, depth: 0 })
  assert.equal(draft?.title, 'Second (draft)')
  assert.equal((await cms.findVersions('posts', expected.second)).totalDocs, expected.versions)
  assert.equal((await cms.findGlobal('site')).name, 'Upgrade test')
  const media = await cms.findById('media', expected.media.id)
  assert.equal(media?.alt, expected.media.alt)

  const handle = createRestHandler(cms)
  const api = (path, init) => handle(new Request(`http://cms.test/api/cms${path}`, init))
  const file = await api(`/media/file/${expected.media.filename}`)
  assert.equal(file.status, 200)
  assert.equal(file.headers.get('content-type'), 'image/png')
  const login = await api('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://cms.test' },
    body: JSON.stringify({ email: expected.admin, password: 'upgrade-test-password' }),
  })
  assert.equal(login.status, 200)
  // Still writable: a new version on an old document.
  await cms.update('posts', expected.first, { body: 'Hello again' })
  assert.equal((await cms.findVersions('posts', expected.first)).totalDocs > 1, true)
  console.log('Upgrade check passed')
} finally {
  await cms.destroy()
}
