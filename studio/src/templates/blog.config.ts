import { defineConfig } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { seoPlugin } from '@easy-cms/plugin-seo'

// A blog: posts with drafts, in categories. Edit anything; the admin on the right follows.
export default defineConfig({
  secret: process.env.EASY_CMS_SECRET ?? '',
  db: sqlite({ url: 'file:./cms.db' }),
  collections: [
    {
      slug: 'posts',
      drafts: true,
      useAsTitle: 'title',
      access: {
        // Anyone reads what is published; editors see drafts too.
        read: ({ user }) => (user ? true : { status: { equals: 'published' } }),
      },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'slug', type: 'slug', from: 'title', unique: true },
        { name: 'excerpt', type: 'textarea' },
        { name: 'body', type: 'richText' },
        { name: 'category', type: 'relationship', to: 'categories' },
        { name: 'tags', type: 'select', options: ['news', 'guide', 'story'], hasMany: true },
        { name: 'featured', type: 'boolean' },
        { name: 'publishedAt', type: 'date' },
      ],
    },
    {
      slug: 'categories',
      useAsTitle: 'name',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'slug', type: 'slug', from: 'name' },
      ],
    },
  ],
  plugins: [seoPlugin({ collections: ['posts'] })],
})
