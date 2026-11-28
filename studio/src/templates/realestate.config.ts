import { defineConfig } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'

// Property listings: homes for sale or rent, the agents who list them, and enquiries from
// visitors. Listings are public; enquiries are for staff.
export default defineConfig({
  secret: process.env.EASY_CMS_SECRET ?? '',
  db: sqlite({ url: 'file:./cms.db' }),
  collections: [
    {
      slug: 'agents',
      useAsTitle: 'name',
      access: { read: () => true },
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'phone', type: 'text' },
        { name: 'email', type: 'email' },
      ],
    },
    {
      slug: 'listings',
      useAsTitle: 'title',
      drafts: true,
      access: { read: () => true },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'slug', type: 'slug', from: 'title', unique: true },
        { name: 'deal', type: 'select', required: true, options: ['sale', 'rent'] },
        { name: 'price', type: 'number', required: true, min: 0 },
        { name: 'bedrooms', type: 'number', min: 0 },
        { name: 'area', type: 'number', min: 0 },
        {
          name: 'location',
          type: 'group',
          fields: [
            { name: 'district', type: 'text' },
            { name: 'city', type: 'text' },
          ],
        },
        { name: 'agent', type: 'relationship', to: 'agents' },
        { name: 'description', type: 'richText' },
      ],
    },
    {
      slug: 'enquiries',
      useAsTitle: 'name',
      access: { create: () => true, read: ({ user }) => !!user },
      fields: [
        { name: 'listing', type: 'relationship', to: 'listings', required: true },
        { name: 'name', type: 'text', required: true },
        { name: 'phone', type: 'text' },
        { name: 'message', type: 'textarea' },
      ],
    },
  ],
})
