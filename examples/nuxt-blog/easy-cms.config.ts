import { defineConfig } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { mcpPlugin } from '@easy-cms/plugin-mcp'
import { seoPlugin } from '@easy-cms/plugin-seo'

export default defineConfig({
  secret: process.env.EASY_CMS_SECRET ?? '',
  db: sqlite({ url: process.env.DATABASE_URL ?? 'file:./cms.db' }),
  // The admin menu: posts first; users are listed under Settings.
  admin: { locale: 'th', menu: ['posts', 'categories', 'media'] },
  // API keys for scripts and AI assistants, managed under Settings → API keys.
  apiKeys: true,
  // Posts and the site name in Thai and English; the slug and other fields are shared.
  localization: { locales: ['th', 'en'], defaultLocale: 'th' },
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
        { name: 'cover', type: 'upload', label: { en: 'Cover', th: 'รูปปก' } },
        { name: 'body', type: 'richText', label: { en: 'Body', th: 'เนื้อหา' }, localized: true },
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
  plugins: [
    // AI assistants (Claude, Cursor…) at /api/cms/mcp, with an API key.
    mcpPlugin(),
    seoPlugin({
      collections: ['posts'],
      globals: ['site'],
      // Posts: "Title | Easy CMS Blog"; the site: its name.
      generateTitle: ({ doc, collection }) =>
        collection ? (doc.title ? `${doc.title} | Easy CMS Blog` : null) : (doc.siteName as string),
      generateDescription: ({ doc }) => (doc.excerpt as string | undefined) ?? null,
      generateImage: ({ doc }) => (doc.cover as number | undefined) ?? null,
      // A post's page (English at ?locale=en), for the search preview, the sitemap and
      // hreflang links. Posts without a slug have no page yet.
      generateURL: ({ doc, collection, locale }) =>
        collection === 'posts'
          ? doc.slug
            ? `/posts/${doc.slug}${locale === 'en' ? '?locale=en' : ''}`
            : null
          : '/',
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
