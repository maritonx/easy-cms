import { consoleEmail, defineConfig } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { smtp } from '@easy-cms/email-smtp'
import { color } from '@easy-cms/fields'
import { formBuilderPlugin } from '@easy-cms/plugin-form-builder'
import { mcpPlugin } from '@easy-cms/plugin-mcp'
import { nestedDocsPlugin } from '@easy-cms/plugin-nested-docs'
import { redirectsPlugin } from '@easy-cms/plugin-redirects'
import { seoPlugin } from '@easy-cms/plugin-seo'

// Where this server and the frontend (frontend/index.html) run; used for live preview.
const cmsURL = process.env.CMS_URL ?? 'http://localhost:4000'
const frontendURL = process.env.FRONTEND_URL ?? 'http://localhost:5173'

export default defineConfig({
  secret: process.env.EASY_CMS_SECRET ?? '',
  db: sqlite({ url: process.env.DATABASE_URL ?? 'file:./cms.db' }),
  // The admin menu: posts first; users are listed under Settings.
  admin: { locale: 'th', menu: ['posts', 'pages', 'categories', 'media'] },
  // API keys for scripts and AI assistants, managed under Settings → API keys.
  apiKeys: true,
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
    // "From a link" in the media library: the server downloads files from any public site.
    fromURL: { allowedHosts: ['*'] },
  },
  // Settings → Backups: a compressed copy of the database every night, the newest 7 kept.
  backups: { every: 'day', at: '03:00', keep: 7 },
  // Settings → Roles: admins tick what each role may do; add roles there without code.
  auth: { rbac: true },
  // Field types from packages; `type: 'color'` below.
  fieldTypes: [color],
  collections: [
    {
      slug: 'categories',
      // Small: create and edit in a panel over the list.
      editIn: 'drawer',
      labels: {
        singular: { en: 'Category', th: 'หมวดหมู่' },
        plural: { en: 'Categories', th: 'หมวดหมู่' },
      },
      icon: 'tag',
      useAsTitle: 'name',
      access: { read: () => true },
      fields: [
        { name: 'name', type: 'text', required: true, label: { en: 'Name', th: 'ชื่อ' } },
        { name: 'slug', type: 'slug', from: 'name', label: { en: 'Slug', th: 'Slug' } },
        // A field type from @easy-cms/fields: a color picker, and a swatch in the list.
        {
          name: 'color',
          type: 'color',
          presets: ['#2f6f5e', '#e8a33d', '#c2410c', '#2563eb', '#7c3aed'],
          label: { en: 'Color', th: 'สี' },
        },
      ],
    },
    {
      slug: 'posts',
      labels: { singular: { en: 'Post', th: 'บทความ' }, plural: { en: 'Posts', th: 'บทความ' } },
      icon: 'newspaper',
      drafts: true,
      // History and restore; drafts of a published post stay unpublished until published.
      versions: true,
      // Publish or unpublish at a set time (the server runs due jobs every minute).
      schedule: true,
      // Live preview on the frontend's origin; the admin adds a preview token to the URL.
      preview: ({ doc }) =>
        `${frontendURL}/?api=${encodeURIComponent(`${cmsURL}/api/cms`)}&post=${doc.id}`,
      // Roles limited to their own posts (Settings → Roles) go by the author.
      admin: { ownerField: 'author' },
      useAsTitle: 'title',
      access: {
        // Visitors see published posts; logged-in editors see drafts too.
        read: ({ user }) => (user ? true : { status: { equals: 'published' } }),
      },
      fields: [
        {
          name: 'title',
          type: 'text',
          label: { en: 'Title', th: 'ชื่อเรื่อง' },
          required: true,
          maxLength: 200,
          localized: true,
        },
        { name: 'slug', type: 'slug', from: 'title', label: { en: 'Slug', th: 'Slug' } },
        {
          name: 'excerpt',
          type: 'textarea',
          label: { en: 'Excerpt', th: 'คำโปรย' },
          maxLength: 300,
          localized: true,
        },
        {
          name: 'cover',
          type: 'upload',
          label: { en: 'Cover', th: 'รูปปก' },
          mimeTypes: ['image/*'],
        },
        { name: 'body', type: 'richText', label: { en: 'Body', th: 'เนื้อหา' }, localized: true },
        // Several images in the order editors arrange them, shown under the post.
        {
          name: 'gallery',
          type: 'upload',
          hasMany: true,
          maxRows: 12,
          mimeTypes: ['image/*'],
          label: { en: 'Gallery', th: 'แกลเลอรี' },
        },
        {
          name: 'sections',
          label: { en: 'Sections', th: 'ส่วนเนื้อหา' },
          type: 'blocks',
          blocks: [
            {
              slug: 'quote',
              labels: { singular: { en: 'Quote', th: 'คำพูด' } },
              fields: [
                { name: 'text', type: 'textarea', required: true, localized: true },
                { name: 'author', type: 'text' },
              ],
            },
            {
              slug: 'callout',
              labels: { singular: { en: 'Callout', th: 'กล่องข้อความ' } },
              fields: [
                {
                  name: 'tone',
                  type: 'select',
                  options: ['info', 'warning'],
                  defaultValue: 'info',
                },
                { name: 'text', type: 'text', required: true, localized: true },
              ],
            },
          ],
        },
        {
          name: 'category',
          type: 'relationship',
          to: 'categories',
          label: { en: 'Category', th: 'หมวดหมู่' },
          position: 'sidebar',
        },
        {
          name: 'tags',
          type: 'select',
          options: ['nuxt', 'vue', 'cms', 'thai'],
          hasMany: true,
          label: { en: 'Tags', th: 'แท็ก' },
          position: 'sidebar',
        },
        {
          name: 'author',
          type: 'relationship',
          to: 'users',
          label: { en: 'Author', th: 'ผู้เขียน' },
          position: 'sidebar',
        },
        {
          name: 'publishedAt',
          type: 'date',
          label: { en: 'Published at', th: 'วันที่เผยแพร่' },
          position: 'sidebar',
        },
      ],
    },
    {
      slug: 'pages',
      labels: { singular: { en: 'Page', th: 'หน้า' }, plural: { en: 'Pages', th: 'หน้า' } },
      icon: 'file-text',
      drafts: true,
      versions: true,
      useAsTitle: 'title',
      access: {
        read: ({ user }) => (user ? true : { status: { equals: 'published' } }),
      },
      // A parent, breadcrumbs and the full path (/about/team) come from nestedDocsPlugin below.
      fields: [
        {
          name: 'title',
          type: 'text',
          label: { en: 'Title', th: 'ชื่อหน้า' },
          required: true,
          localized: true,
        },
        // One slug per language, so the English path can differ: /about/team, /เกี่ยวกับ/ทีม.
        {
          name: 'slug',
          type: 'slug',
          from: 'title',
          label: { en: 'Slug', th: 'Slug' },
          localized: true,
        },
        { name: 'body', type: 'richText', label: { en: 'Body', th: 'เนื้อหา' }, localized: true },
      ],
    },
  ],
  globals: [
    {
      slug: 'site',
      label: { en: 'Site', th: 'ข้อมูลเว็บไซต์' },
      icon: 'house',
      access: { read: () => true },
      fields: [
        {
          name: 'siteName',
          type: 'text',
          label: { en: 'Site name', th: 'ชื่อเว็บไซต์' },
          defaultValue: 'Easy CMS Blog',
          localized: true,
        },
        { name: 'tagline', type: 'text', label: { en: 'Tagline', th: 'คำโปรย' }, localized: true },
      ],
    },
  ],
  // SEO fields on posts and the site, with a search preview and Generate buttons in the admin.
  // Form notifications: SMTP when SMTP_HOST is set, else printed in the server's log.
  email: process.env.SMTP_HOST ? smtp() : consoleEmail({ from: 'Easy CMS Blog <blog@localhost>' }),
  plugins: [
    // Forms editors build in the admin (Forms), shown on the site with <easy-form>.
    formBuilderPlugin({ defaultTo: process.env.FORMS_TO ?? 'owner@localhost' }),
    // AI assistants (Claude, Cursor…) at /api/cms/mcp, with an API key.
    mcpPlugin(),
    // Pages inside pages (About → Team): a tree in the admin, paths kept up to date.
    nestedDocsPlugin({ collections: ['pages'] }),
    // Redirects under Settings; the frontend asks /api/cms/resolve-redirect?path=… for them.
    redirectsPlugin(),
    seoPlugin({
      collections: ['posts'],
      globals: ['site'],
      // Posts: "Title | Easy CMS Blog"; the site: its name.
      generateTitle: ({ doc, collection }) =>
        collection ? (doc.title ? `${doc.title} | Easy CMS Blog` : null) : (doc.siteName as string),
      generateDescription: ({ doc }) => (doc.excerpt as string | undefined) ?? null,
      generateImage: ({ doc }) => (doc.cover as number | undefined) ?? null,
      // The frontend shows a post by id (see `preview` above).
      generateURL: ({ id, collection }) =>
        collection === 'posts' && id !== null ? `${frontendURL}/?post=${id}` : `${frontendURL}/`,
      // /robots.txt from this server: AI training crawlers stay out, AI search may cite posts.
      robots: { ai: { training: false } },
      ...(process.env.INDEXNOW_KEY ? { indexNow: { key: process.env.INDEXNOW_KEY } } : {}),
    }),
  ],
})
