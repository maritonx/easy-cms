import { defineConfig } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'

// An online shop: products in categories, customers, and orders with their lines. Customers
// place orders; staff see and fulfil them.
export default defineConfig({
  secret: process.env.EASY_CMS_SECRET ?? '',
  db: sqlite({ url: 'file:./cms.db' }),
  collections: [
    {
      slug: 'categories',
      useAsTitle: 'name',
      access: { read: () => true },
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'slug', type: 'slug', from: 'name' },
      ],
    },
    {
      slug: 'products',
      useAsTitle: 'name',
      drafts: true,
      access: { read: () => true },
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'slug', type: 'slug', from: 'name', unique: true },
        { name: 'price', type: 'number', required: true, min: 0 },
        { name: 'stock', type: 'number', min: 0 },
        { name: 'category', type: 'relationship', to: 'categories' },
        { name: 'description', type: 'richText' },
      ],
    },
    {
      slug: 'customers',
      useAsTitle: 'name',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'email', type: 'email', required: true, unique: true },
        { name: 'phone', type: 'text' },
      ],
    },
    {
      slug: 'orders',
      useAsTitle: 'number',
      fields: [
        { name: 'number', type: 'text', required: true, unique: true },
        { name: 'customer', type: 'relationship', to: 'customers', required: true },
        {
          name: 'lines',
          type: 'array',
          fields: [
            { name: 'product', type: 'relationship', to: 'products', required: true },
            { name: 'quantity', type: 'number', required: true, min: 1 },
          ],
        },
        { name: 'total', type: 'number' },
        { name: 'status', type: 'select', options: ['pending', 'paid', 'shipped', 'cancelled'] },
      ],
    },
  ],
})
