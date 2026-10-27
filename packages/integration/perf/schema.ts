// The content model of the load tests: posts in two languages with drafts, versions,
// relationships, hasMany tags, a group and blocks. Shared by load.ts, the nightly perf run's
// seed, and the config `easy-cms serve` runs there.

export const TAGS = ['news', 'guide', 'review', 'event'] as const

export const schema = {
  localization: { locales: ['th', 'en'], defaultLocale: 'th' },
  collections: [
    { slug: 'authors', access: { read: () => true }, fields: [{ name: 'name', type: 'text' }] },
    {
      slug: 'categories',
      access: { read: () => true },
      fields: [{ name: 'name', type: 'text', localized: true }],
    },
    {
      slug: 'posts',
      drafts: true,
      versions: true,
      access: { read: () => true },
      fields: [
        // like on titles (Thai and English) uses a trigram index on Postgres.
        { name: 'title', type: 'text', required: true, localized: true, index: 'trigram' },
        { name: 'slug', type: 'slug', from: 'title', localized: true },
        { name: 'excerpt', type: 'textarea', localized: true },
        { name: 'views', type: 'number', index: true },
        { name: 'publishedAt', type: 'date', index: true },
        { name: 'author', type: 'relationship', to: 'authors' },
        { name: 'category', type: 'relationship', to: 'categories' },
        {
          name: 'tags',
          type: 'select',
          options: ['news', 'guide', 'review', 'event'],
          hasMany: true,
        },
        {
          name: 'seo',
          type: 'group',
          fields: [{ name: 'description', type: 'text', localized: true }],
        },
        {
          name: 'layout',
          type: 'blocks',
          blocks: [
            { slug: 'hero', fields: [{ name: 'heading', type: 'text', localized: true }] },
            { slug: 'text', fields: [{ name: 'body', type: 'textarea', localized: true }] },
            {
              slug: 'gallery',
              fields: [
                { name: 'items', type: 'array', fields: [{ name: 'caption', type: 'text' }] },
              ],
            },
          ],
        },
      ],
    },
  ],
} as const
