import { defineConfig } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'

// A small CRM: companies, the people in them, and deals moving through a pipeline.
export default defineConfig({
  secret: process.env.EASY_CMS_SECRET ?? '',
  db: sqlite({ url: 'file:./cms.db' }),
  collections: [
    {
      slug: 'companies',
      useAsTitle: 'name',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'website', type: 'text' },
        {
          name: 'industry',
          type: 'select',
          options: ['retail', 'software', 'health', 'education'],
        },
      ],
    },
    {
      slug: 'contacts',
      useAsTitle: 'name',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'email', type: 'email' },
        { name: 'company', type: 'relationship', to: 'companies' },
        { name: 'title', type: 'text' },
      ],
    },
    {
      slug: 'deals',
      useAsTitle: 'name',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'company', type: 'relationship', to: 'companies', required: true },
        { name: 'contact', type: 'relationship', to: 'contacts' },
        { name: 'value', type: 'number', min: 0 },
        {
          name: 'stage',
          type: 'select',
          required: true,
          options: ['lead', 'qualified', 'proposal', 'won', 'lost'],
        },
        { name: 'closeDate', type: 'date' },
      ],
    },
  ],
})
