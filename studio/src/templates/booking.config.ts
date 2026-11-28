import { defineConfig } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'

// Bookings for a clinic or salon: services with a length and price, staff, and bookings.
// Anyone may book; only signed-in staff see the bookings.
export default defineConfig({
  secret: process.env.EASY_CMS_SECRET ?? '',
  db: sqlite({ url: 'file:./cms.db' }),
  collections: [
    {
      slug: 'services',
      useAsTitle: 'name',
      access: { read: () => true },
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'minutes', type: 'number', required: true, min: 15 },
        { name: 'price', type: 'number', min: 0 },
      ],
    },
    {
      slug: 'staff',
      useAsTitle: 'name',
      access: { read: () => true },
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'services', type: 'relationship', to: 'services', hasMany: true },
      ],
    },
    {
      slug: 'bookings',
      useAsTitle: 'customer',
      access: {
        // The booking form on the site creates them; only staff read them.
        create: () => true,
        read: ({ user }) => !!user,
      },
      fields: [
        { name: 'customer', type: 'text', required: true },
        { name: 'phone', type: 'text', required: true },
        { name: 'service', type: 'relationship', to: 'services', required: true },
        { name: 'staff', type: 'relationship', to: 'staff' },
        { name: 'startsAt', type: 'date', required: true },
        {
          name: 'status',
          type: 'select',
          options: ['requested', 'confirmed', 'done', 'cancelled'],
        },
        { name: 'notes', type: 'textarea' },
      ],
    },
  ],
})
