import { defineConfig } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'

// A job board: companies post positions; candidates apply. Positions are public once
// published; applications are for signed-in staff only.
export default defineConfig({
  secret: process.env.EASY_CMS_SECRET ?? '',
  db: sqlite({ url: 'file:./cms.db' }),
  collections: [
    {
      slug: 'companies',
      useAsTitle: 'name',
      access: { read: () => true },
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'location', type: 'text' },
      ],
    },
    {
      slug: 'positions',
      useAsTitle: 'title',
      drafts: true,
      access: { read: ({ user }) => (user ? true : { status: { equals: 'published' } }) },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'slug', type: 'slug', from: 'title', unique: true },
        { name: 'company', type: 'relationship', to: 'companies', required: true },
        { name: 'type', type: 'select', options: ['full-time', 'part-time', 'contract'] },
        { name: 'remote', type: 'boolean' },
        { name: 'salaryFrom', type: 'number', min: 0 },
        { name: 'description', type: 'richText' },
      ],
    },
    {
      slug: 'applications',
      useAsTitle: 'name',
      access: { create: () => true, read: ({ user }) => !!user },
      fields: [
        { name: 'position', type: 'relationship', to: 'positions', required: true },
        { name: 'name', type: 'text', required: true },
        { name: 'email', type: 'email', required: true },
        { name: 'coverLetter', type: 'textarea' },
        { name: 'stage', type: 'select', options: ['new', 'interview', 'offer', 'rejected'] },
      ],
    },
  ],
})
