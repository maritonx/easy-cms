import { defineConfig } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'

// A restaurant in Thai and English: the menu, its categories, and branches. Names and
// descriptions have a version per language; prices and opening hours are shared.
export default defineConfig({
  secret: process.env.EASY_CMS_SECRET ?? '',
  db: sqlite({ url: 'file:./cms.db' }),
  localization: { locales: ['th', 'en'], defaultLocale: 'th' },
  collections: [
    {
      slug: 'categories',
      useAsTitle: 'name',
      access: { read: () => true },
      fields: [
        { name: 'name', type: 'text', required: true, localized: true },
        { name: 'order', type: 'number' },
      ],
    },
    {
      slug: 'dishes',
      useAsTitle: 'name',
      access: { read: () => true },
      fields: [
        { name: 'name', type: 'text', required: true, localized: true },
        { name: 'description', type: 'textarea', localized: true },
        { name: 'price', type: 'number', required: true, min: 0 },
        { name: 'category', type: 'relationship', to: 'categories' },
        { name: 'spicy', type: 'boolean' },
        { name: 'available', type: 'boolean' },
      ],
    },
    {
      slug: 'branches',
      useAsTitle: 'name',
      access: { read: () => true },
      fields: [
        { name: 'name', type: 'text', required: true, localized: true },
        { name: 'phone', type: 'text' },
        { name: 'hours', type: 'text' },
      ],
    },
  ],
})
