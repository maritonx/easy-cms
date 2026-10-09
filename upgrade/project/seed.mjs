// Writes content with the Easy CMS version installed here, and what to expect after upgrading.
import { writeFileSync } from 'node:fs'
import { createEasyCMS } from '@easy-cms/core'
import config from './easy-cms.config.mjs'

// A 1×1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const cms = await createEasyCMS(config, { cwd: process.cwd(), schema: 'verify', scheduler: false })
try {
  const admin = await cms.create('users', {
    email: 'admin@upgrade.test',
    password: 'upgrade-test-password',
    role: 'admin',
  })
  const media = await cms.upload({ data: new Uint8Array(PNG), name: 'dot.png' }, { alt: 'A dot' })
  const first = await cms.create('posts', { title: 'First', body: 'Hello', tags: ['news'] })
  await cms.update('posts', first.id, { title: 'First', status: 'published' })
  const second = await cms.create('posts', {
    title: 'Second',
    cover: media.id,
    related: first.id,
    tags: ['news', 'howto'],
  })
  await cms.update('posts', second.id, { title: 'Second', status: 'published' })
  // A draft on top of what is live.
  await cms.update('posts', second.id, { title: 'Second (draft)', status: 'draft' })
  await cms.updateGlobal('site', { name: 'Upgrade test' })
  const versions = await cms.findVersions('posts', second.id)
  writeFileSync(
    'expected.json',
    JSON.stringify(
      {
        admin: admin.email,
        media: { id: media.id, filename: media.filename, alt: 'A dot' },
        first: first.id,
        second: second.id,
        versions: versions.totalDocs,
      },
      null,
      2,
    ),
  )
} finally {
  await cms.destroy()
}
