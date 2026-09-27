import { defineConfig } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'

// Where this server and the frontend (frontend/index.html) run; used for live preview.
const cmsURL = process.env.CMS_URL ?? 'http://localhost:4000'
const frontendURL = process.env.FRONTEND_URL ?? 'http://localhost:5173'

export default defineConfig({
  secret: process.env.EASY_CMS_SECRET ?? '',
  db: sqlite({ url: process.env.DATABASE_URL ?? 'file:./cms.db' }),
  admin: { locale: 'th' },
  // Posts and the site name in Thai and English; the slug and other fields are shared.
  localization: { locales: ['th', 'en'], defaultLocale: 'th' },
  // A frontend on another origin (Vite, a static site…) reads the API from the browser.
  cors: (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(','),
  upload: {
    // Resized copies need `sharp` installed; without it only the original is kept.
    imageSizes: [
      { name: 'thumbnail', width: 400, height: 300 },
      { name: 'wide', width: 1200 },
    ],
  },
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
      slug: 'posts',
      drafts: true,
      // History and restore; drafts of a published post stay unpublished until published.
      versions: true,
      // Live preview on the frontend's origin; the admin adds a preview token to the URL.
      preview: ({ doc }) =>
        `${frontendURL}/?api=${encodeURIComponent(`${cmsURL}/api/cms`)}&post=${doc.id}`,
      useAsTitle: 'title',
      access: {
        // Visitors see published posts; logged-in editors see drafts too.
        read: ({ user }) => (user ? true : { status: { equals: 'published' } }),
      },
      fields: [
        { name: 'title', type: 'text', required: true, maxLength: 200, localized: true },
        { name: 'slug', type: 'slug', from: 'title' },
        { name: 'excerpt', type: 'textarea', maxLength: 300, localized: true },
        { name: 'cover', type: 'upload' },
        { name: 'body', type: 'richText', localized: true },
        { name: 'category', type: 'relationship', to: 'categories' },
        { name: 'tags', type: 'select', options: ['nuxt', 'vue', 'cms', 'thai'], hasMany: true },
        { name: 'author', type: 'relationship', to: 'users' },
        { name: 'publishedAt', type: 'date' },
      ],
    },
  ],
  globals: [
    {
      slug: 'site',
      access: { read: () => true },
      fields: [
        { name: 'siteName', type: 'text', defaultValue: 'Easy CMS Blog', localized: true },
        { name: 'tagline', type: 'text', localized: true },
      ],
    },
  ],
})
