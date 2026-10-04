import { consoleEmail, defineConfig } from '@easy-cms/core'
import { postgres } from '@easy-cms/db-postgres'
import { smtp } from '@easy-cms/email-smtp'
import { color } from '@easy-cms/fields'
import { formBuilderPlugin } from '@easy-cms/plugin-form-builder'
import { mcpPlugin } from '@easy-cms/plugin-mcp'
import { nestedDocsPlugin } from '@easy-cms/plugin-nested-docs'
import { redirectsPlugin } from '@easy-cms/plugin-redirects'
import { seoPlugin } from '@easy-cms/plugin-seo'

/**
 * A post's or page's address on the site (English at ?locale=en), shared by the SEO and
 * redirects plugins. Posts without a slug, and pages without a path, have no page yet.
 */
function pageURL(collection: string, doc: Record<string, unknown>, locale: string | null) {
  const query = locale === 'en' ? '?locale=en' : ''
  if (collection === 'pages') return typeof doc.path === 'string' ? `/p${doc.path}${query}` : null
  return doc.slug ? `/posts/${doc.slug}${query}` : null
}

export default defineConfig({
  secret: process.env.EASY_CMS_SECRET ?? '',
  // A Postgres server when DATABASE_URL is set; otherwise PGlite (Postgres in WebAssembly) in .pglite.
  db: process.env.DATABASE_URL?.startsWith('postgres')
    ? postgres({ url: process.env.DATABASE_URL })
    : postgres({ pglite: process.env.PGLITE_DIR ?? '.pglite' }),
  // The admin menu: posts first; users are listed under Settings.
  admin: { locale: 'th', menu: ['posts', 'pages', 'categories', 'media'] },
  // API keys for scripts and AI assistants, managed under Settings → API keys.
  apiKeys: true,
  // Posts and the site name in Thai and English; the slug and other fields are shared.
  localization: { locales: ['th', 'en'], defaultLocale: 'th' },
  // "From a link" in the media library: the server downloads files from any public site.
  upload: { fromURL: { allowedHosts: ['*'] } },
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
      // Live preview in the admin: the page that shows a post.
      preview: ({ doc }) => (doc.slug ? `/posts/${doc.slug}` : null),
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
    // Redirects under Settings in the admin; a post whose slug changes redirects from its old
    // address (served by the middleware in this example).
    // Pages redirect too, including the pages under one that moved.
    redirectsPlugin({
      collections: ['posts', 'pages'],
      url: ({ doc, collection, locale }) => pageURL(collection, doc, locale),
    }),
    seoPlugin({
      collections: ['posts', 'pages'],
      globals: ['site'],
      // Posts: "Title | Easy CMS Blog"; the site: its name.
      generateTitle: ({ doc, collection }) =>
        collection ? (doc.title ? `${doc.title} | Easy CMS Blog` : null) : (doc.siteName as string),
      generateDescription: ({ doc }) => (doc.excerpt as string | undefined) ?? null,
      generateImage: ({ doc }) => (doc.cover as number | undefined) ?? null,
      // A post's page (English at ?locale=en), for the search preview, the sitemap and
      // hreflang links. Posts without a slug have no page yet.
      generateURL: ({ doc, collection, locale }) =>
        collection ? pageURL(collection, doc, locale) : '/',
      // /llms.txt for AI assistants: a summary, then posts linked to their Markdown versions.
      llms: {
        description: 'A demo blog built with Easy CMS, in Thai and English.',
        markdownURL: ({ doc, collection }) =>
          collection === 'posts' && doc.slug ? `/posts/${doc.slug}.md` : null,
      },
      // Tell Bing and other IndexNow engines about published changes (public https sites only).
      ...(process.env.INDEXNOW_KEY ? { indexNow: { key: process.env.INDEXNOW_KEY } } : {}),
    }),
  ],
})
