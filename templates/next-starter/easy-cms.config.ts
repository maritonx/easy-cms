import { createHmac } from 'node:crypto'
import { defineConfig, type StorageAdapter } from '@easy-cms/core'
import { postgres } from '@easy-cms/db-postgres'
import { seoPlugin } from '@easy-cms/plugin-seo'
import { netlifyBlobsStorage } from '@easy-cms/storage-netlify-blobs'
import { vercelBlobStorage } from '@easy-cms/storage-vercel-blob'

/**
 * Easy CMS, ready for Vercel and Netlify: Postgres (Neon) when the platform gives a database,
 * otherwise PGlite in `.pglite` for development; uploads in Vercel Blob or Netlify Blobs.
 */
const databaseURL = process.env.DATABASE_URL ?? process.env.NETLIFY_DATABASE_URL

/** Where uploads go: Vercel Blob, Netlify Blobs, or the `uploads` folder when developing. */
function storage(): StorageAdapter | undefined {
  if (process.env.BLOB_READ_WRITE_TOKEN) return vercelBlobStorage()
  if (process.env.NETLIFY) return netlifyBlobsStorage()
  return undefined
}

/**
 * Signs sessions and links. Set EASY_CMS_SECRET (`openssl rand -hex 32`); a one-click deploy
 * without it gets one made from the database URL, so it works at once.
 */
function secret(): string {
  if (process.env.EASY_CMS_SECRET) return process.env.EASY_CMS_SECRET
  if (databaseURL) return createHmac('sha256', databaseURL).update('easy-cms-secret').digest('hex')
  return 'development-secret-change-me-development-secret'
}

const uploads = storage()

export default defineConfig({
  secret: secret(),
  db: databaseURL ? postgres({ url: databaseURL }) : postgres({ pglite: '.pglite' }),
  ...(uploads ? { upload: { storage: uploads } } : {}),
  admin: { brand: { name: 'Easy CMS Starter' }, menu: ['posts', 'categories', 'media'] },
  // Settings → Roles and Settings → Audit log.
  auth: { rbac: true },
  audit: true,
  plugins: [
    seoPlugin({
      collections: ['posts'],
      generateURL: ({ doc }) => (doc.slug ? `/posts/${doc.slug}` : null),
    }),
  ],
  collections: [
    {
      slug: 'categories',
      editIn: 'drawer',
      labels: { singular: 'Category', plural: 'Categories' },
      icon: 'tag',
      useAsTitle: 'name',
      access: { read: () => true },
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'slug', type: 'slug', from: 'name' },
      ],
    },
    {
      slug: 'posts',
      labels: { singular: 'Post', plural: 'Posts' },
      icon: 'newspaper',
      drafts: true,
      versions: true,
      preview: ({ doc }) => (doc.slug ? `/posts/${doc.slug}` : null),
      useAsTitle: 'title',
      admin: { ownerField: 'author' },
      access: {
        // Visitors see published posts; signed-in editors see drafts too.
        read: ({ user }) => (user ? true : { status: { equals: 'published' } }),
      },
      fields: [
        { name: 'title', type: 'text', required: true, maxLength: 200 },
        { name: 'slug', type: 'slug', from: 'title' },
        { name: 'excerpt', type: 'textarea', maxLength: 300 },
        { name: 'cover', type: 'upload', mimeTypes: ['image/*'] },
        { name: 'body', type: 'richText' },
        { name: 'category', type: 'relationship', to: 'categories', position: 'sidebar' },
        { name: 'author', type: 'relationship', to: 'users', position: 'sidebar' },
        { name: 'publishedAt', type: 'date', position: 'sidebar' },
      ],
    },
  ],
  globals: [
    {
      slug: 'site',
      label: 'Site',
      icon: 'globe',
      access: { read: () => true },
      fields: [
        { name: 'siteName', type: 'text', defaultValue: 'Easy CMS Starter' },
        { name: 'tagline', type: 'text' },
      ],
    },
  ],
})
