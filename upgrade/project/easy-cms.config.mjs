// One config for the old version and the current one: only options both understand.
import { defineConfig } from '@easy-cms/core'
import { postgres } from '@easy-cms/db-postgres'
import { sqlite } from '@easy-cms/db-sqlite'

const db =
  process.env.UPGRADE_DB === 'postgres'
    ? postgres({ url: process.env.POSTGRES_URL })
    : process.env.UPGRADE_DB === 'pglite'
      ? postgres({ pglite: './pgdata' })
      : sqlite({ url: 'file:./cms.db' })

export default defineConfig({
  secret: 'upgrade-test-secret-0123456789abcdef',
  db,
  collections: [
    {
      slug: 'posts',
      drafts: true,
      versions: true,
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'body', type: 'textarea' },
        { name: 'cover', type: 'upload' },
        { name: 'tags', type: 'select', hasMany: true, options: ['news', 'howto'] },
        { name: 'related', type: 'relationship', to: 'posts' },
      ],
    },
  ],
  globals: [{ slug: 'site', fields: [{ name: 'name', type: 'text' }] }],
})
