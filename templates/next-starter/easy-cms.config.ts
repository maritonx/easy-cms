import { createHmac, randomBytes } from 'node:crypto'
import { defineConfig, type StorageAdapter } from '@easy-cms/core'
import { postgres } from '@easy-cms/db-postgres'
import { seoPlugin } from '@easy-cms/plugin-seo'
import { netlifyBlobsStorage } from '@easy-cms/storage-netlify-blobs'
import { vercelBlobStorage } from '@easy-cms/storage-vercel-blob'

/** An environment variable; on Netlify's functions also from `Netlify.env`. */
function env(name: string): string | undefined {
  const netlify = (globalThis as { Netlify?: { env: { get(name: string): string | undefined } } })
    .Netlify
  return process.env[name] || netlify?.env.get(name) || undefined
}

/** On Vercel or Netlify (builds and functions), whose disk doesn't keep files. */
const onVercel = Boolean(env('VERCEL'))
const onNetlify = Boolean(env('NETLIFY') || 'Netlify' in globalThis)

/**
 * Easy CMS, ready for Vercel and Netlify: Postgres from the platform (Neon on Vercel, Netlify
 * Database on Netlify), otherwise PGlite in `.pglite` for development; uploads in Vercel Blob
 * or Netlify Blobs. `NETLIFY_DATABASE_URL` is the older Netlify DB (beta).
 */
const databaseURL = env('DATABASE_URL') ?? env('NETLIFY_DB_URL') ?? env('NETLIFY_DATABASE_URL')
if (!databaseURL && (onVercel || onNetlify || env('AWS_LAMBDA_FUNCTION_NAME')))
  throw new Error(
    onNetlify
      ? 'No database: Netlify Database sets NETLIFY_DB_URL when @netlify/database is installed (it needs a credit-based plan). Or set DATABASE_URL to any Postgres, then redeploy'
      : 'No database: connect one to the project (Storage → Neon), which sets DATABASE_URL, or set DATABASE_URL to any Postgres, then redeploy',
  )

/**
 * Where uploads go: Vercel Blob on Vercel, Netlify Blobs on Netlify, or the `uploads` folder
 * when developing. On Vercel the disk can't keep files: without a Blob store, uploads fail
 * saying to connect one (`BLOB_READ_WRITE_TOKEN`), instead of writing where they'd be lost.
 */
function storage(): StorageAdapter | undefined {
  if (env('BLOB_READ_WRITE_TOKEN') || onVercel) return vercelBlobStorage()
  if (onNetlify) return netlifyBlobsStorage()
  return undefined
}

/**
 * Where files in private folders go: on Vercel, private blobs (the public store's files have
 * public URLs). Netlify Blobs and the local disk serve nothing publicly, so they keep both.
 */
function privateStorage(): StorageAdapter | undefined {
  if (env('BLOB_READ_WRITE_TOKEN') || onVercel)
    return vercelBlobStorage({ access: 'private', prefix: 'private/' })
  return undefined
}

/**
 * Signs sessions and links. Set EASY_CMS_SECRET (`openssl rand -hex 32`). A one-click deploy
 * without it gets one made from the database URL, so it works at once (whoever can read that
 * URL could make it too: set EASY_CMS_SECRET soon). In production without either, a random one
 * for this process: sign-ins end when it restarts, but nobody can guess it.
 */
function secret(): string {
  const set = env('EASY_CMS_SECRET')
  if (set) return set
  if (databaseURL) {
    if (process.env.NODE_ENV === 'production')
      console.warn(
        '[easy-cms] EASY_CMS_SECRET is not set: using one made from the database URL. Set it (openssl rand -hex 32).',
      )
    return createHmac('sha256', databaseURL).update('easy-cms-secret').digest('hex')
  }
  if (process.env.NODE_ENV === 'production') {
    console.warn(
      '[easy-cms] EASY_CMS_SECRET is not set: using a random one, so sign-ins end on restart. Set it (openssl rand -hex 32).',
    )
    return randomBytes(32).toString('hex')
  }
  return 'development-secret-change-me-development-secret'
}

const uploads = storage()
const privateUploads = privateStorage()

export default defineConfig({
  secret: secret(),
  db: databaseURL ? postgres({ url: databaseURL }) : postgres({ pglite: '.pglite' }),
  // Folders in the media library; admins choose which roles use each.
  upload: {
    folders: true,
    // Images and documents: PDF, Word, Excel, PowerPoint, OpenDocument, CSV, text.
    mimeTypes: ['image/*', 'documents'],
    // Large files go from the browser straight to Vercel Blob, past the 4.5 MB request limit.
    maxFileSize: 100 * 1024 * 1024,
    ...(uploads ? { storage: uploads } : {}),
    ...(privateUploads ? { privateStorage: privateUploads } : {}),
  },
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
