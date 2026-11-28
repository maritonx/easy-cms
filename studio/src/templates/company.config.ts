import { defineConfig } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { seoPlugin } from '@easy-cms/plugin-seo'

// A company website: pages that editors lay out from blocks, the team, services, and the
// company's details in one place (a global).
export default defineConfig({
  secret: process.env.EASY_CMS_SECRET ?? '',
  db: sqlite({ url: 'file:./cms.db' }),
  collections: [
    {
      slug: 'pages',
      useAsTitle: 'title',
      drafts: true,
      access: { read: () => true },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'slug', type: 'slug', from: 'title', unique: true },
        {
          name: 'layout',
          type: 'blocks',
          blocks: [
            {
              slug: 'hero',
              fields: [
                { name: 'heading', type: 'text', required: true },
                { name: 'text', type: 'textarea' },
              ],
            },
            { slug: 'content', fields: [{ name: 'body', type: 'richText' }] },
            {
              slug: 'cta',
              fields: [
                { name: 'label', type: 'text', required: true },
                { name: 'link', type: 'text' },
              ],
            },
          ],
        },
      ],
    },
    {
      slug: 'services',
      useAsTitle: 'name',
      access: { read: () => true },
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'summary', type: 'textarea' },
        { name: 'order', type: 'number' },
      ],
    },
    {
      slug: 'team',
      useAsTitle: 'name',
      access: { read: () => true },
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'role', type: 'text' },
        { name: 'email', type: 'email' },
      ],
    },
  ],
  globals: [
    {
      slug: 'company',
      access: { read: () => true },
      fields: [
        { name: 'name', type: 'text' },
        { name: 'phone', type: 'text' },
        { name: 'address', type: 'textarea' },
      ],
    },
  ],
  plugins: [seoPlugin({ collections: ['pages'] })],
})
