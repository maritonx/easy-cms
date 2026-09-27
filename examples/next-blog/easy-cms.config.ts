import { defineConfig } from '@easy-cms/core'
import { postgres } from '@easy-cms/db-postgres'

export default defineConfig({
  secret: process.env.EASY_CMS_SECRET ?? '',
  // A Postgres server when DATABASE_URL is set; otherwise PGlite (Postgres in WebAssembly) in .pglite.
  db: process.env.DATABASE_URL?.startsWith('postgres')
    ? postgres({ url: process.env.DATABASE_URL })
    : postgres({ pglite: process.env.PGLITE_DIR ?? '.pglite' }),
  admin: { locale: 'th' },
  // Posts and the site name in Thai and English; the slug and other fields are shared.
  localization: { locales: ['th', 'en'], defaultLocale: 'th' },
  collections: [
    {
      slug: 'categories',
      icon: 'tag',
      useAsTitle: 'name',
      access: { read: () => true },
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'slug', type: 'slug', from: 'name' },
      ],
    },
    {
      slug: 'posts',
      icon: 'newspaper',
      drafts: true,
      // History and restore; drafts of a published post stay unpublished until published.
      versions: true,
      // Publish or unpublish at a set time (the server runs due jobs every minute).
      schedule: true,
      // Live preview in the admin: the page that shows a post.
      preview: ({ doc }) => (doc.slug ? `/posts/${doc.slug}` : null),
      useAsTitle: 'title',
      access: {
        // Visitors see published posts; logged-in editors see drafts too.
        read: ({ user }) => (user ? true : { status: { equals: 'published' } }),
      },
      fields: [
        { name: 'title', type: 'text', required: true, maxLength: 200, localized: true },
        { name: 'slug', type: 'slug', from: 'title' },
        { name: 'excerpt', type: 'textarea', maxLength: 300, localized: true },
        { name: 'cover', type: 'upload' },
        { name: 'body', type: 'richText', localized: true },
        {
          name: 'sections',
          type: 'blocks',
          blocks: [
            {
              slug: 'quote',
              labels: { singular: { en: 'Quote', th: 'คำพูด' } },
              fields: [
                { name: 'text', type: 'textarea', required: true, localized: true },
                { name: 'author', type: 'text' },
              ],
            },
            {
              slug: 'callout',
              labels: { singular: { en: 'Callout', th: 'กล่องข้อความ' } },
              fields: [
                {
                  name: 'tone',
                  type: 'select',
                  options: ['info', 'warning'],
                  defaultValue: 'info',
                },
                { name: 'text', type: 'text', required: true, localized: true },
              ],
            },
          ],
        },
        { name: 'category', type: 'relationship', to: 'categories' },
        { name: 'tags', type: 'select', options: ['nuxt', 'vue', 'cms', 'thai'], hasMany: true },
        { name: 'author', type: 'relationship', to: 'users' },
        { name: 'publishedAt', type: 'date' },
      ],
    },
  ],
  globals: [
    {
      slug: 'site',
      icon: 'house',
      access: { read: () => true },
      fields: [
        { name: 'siteName', type: 'text', defaultValue: 'Easy CMS Blog', localized: true },
        { name: 'tagline', type: 'text', localized: true },
      ],
    },
  ],
})
