import { defineConfig } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { multiTenantPlugin } from '@easy-cms/plugin-multi-tenant'

// A multi-tenant SaaS: each customer (a tenant) sees only its own projects and tasks. Switch
// tenants at the top of the admin's menu; tenants are under Settings.
export default defineConfig({
  secret: process.env.EASY_CMS_SECRET ?? '',
  db: sqlite({ url: 'file:./cms.db' }),
  auth: { rbac: true },
  collections: [
    {
      slug: 'projects',
      useAsTitle: 'name',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'status', type: 'select', options: ['active', 'paused', 'done'] },
        { name: 'dueDate', type: 'date' },
      ],
    },
    {
      slug: 'tasks',
      useAsTitle: 'title',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'project', type: 'relationship', to: 'projects', required: true },
        { name: 'done', type: 'boolean' },
        { name: 'priority', type: 'select', options: ['low', 'medium', 'high'] },
      ],
    },
  ],
  plugins: [multiTenantPlugin({ collections: ['projects', 'tasks'] })],
})
