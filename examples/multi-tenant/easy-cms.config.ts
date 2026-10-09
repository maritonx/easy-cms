import { defineConfig } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { multiTenantPlugin } from '@easy-cms/plugin-multi-tenant'

/**
 * Two brands in one CMS: each has its own posts, pages, media library and site settings, and
 * its own people. Categories are shared. Open the admin, create tenants under Settings, and
 * switch between them at the top of the menu.
 */
export default defineConfig({
  secret: process.env.EASY_CMS_SECRET ?? '',
  db: sqlite({ url: process.env.DATABASE_URL ?? 'file:./cms.db' }),
  // Roles from the admin (Settings → Roles): members get one in each tenant.
  auth: { rbac: true },
  apiKeys: true,
  upload: { folders: true },
  collections: [
    {
      slug: 'posts',
      admin: { order: 1 },
      useAsTitle: 'title',
      access: { read: () => true },
      fields: [
        { name: 'title', type: 'text', required: true },
        // Unique within each tenant: both brands can have /posts/hello.
        { name: 'slug', type: 'slug', from: 'title' },
        { name: 'category', type: 'relationship', to: 'categories' },
        { name: 'cover', type: 'upload' },
        { name: 'body', type: 'richText' },
      ],
    },
    {
      slug: 'pages',
      admin: { order: 2 },
      useAsTitle: 'title',
      access: { read: () => true },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'slug', type: 'slug', from: 'title' },
        { name: 'body', type: 'richText' },
      ],
    },
    // Shared by every brand.
    {
      slug: 'categories',
      admin: { order: 3 },
      useAsTitle: 'name',
      access: { read: () => true },
      fields: [{ name: 'name', type: 'text', required: true }],
    },
  ],
  globals: [
    {
      slug: 'site',
      access: { read: () => true },
      fields: [
        { name: 'name', type: 'text' },
        { name: 'tagline', type: 'text' },
      ],
    },
  ],
  plugins: [
    // Tenants under Settings, a tenant switcher, Members, and `x-easy-cms-tenant` / domains
    // for frontends.
    multiTenantPlugin({ collections: ['posts', 'pages', 'media'], globals: ['site'] }),
  ],
})
