import { defineConfig, resolveConfig } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { printSchema } from 'graphql'
import { expect, it } from 'vitest'
import { buildGraphQLSchema, graphqlPlugin } from '../src/index.js'

/**
 * Type and field names in the generated schema are API: clients and their generated types
 * depend on them. A change shows up in review as a diff of `__snapshots__/schema.graphql`;
 * update it with `vitest -u` only when the change is meant (and noted in the changelog).
 */
const config = defineConfig({
  secret: 'x'.repeat(32),
  db: sqlite({ url: 'file:./unused.db' }),
  localization: { locales: ['th', 'en'], defaultLocale: 'th' },
  collections: [
    {
      slug: 'categories',
      fields: [
        { name: 'name', type: 'text', required: true, localized: true },
        { name: 'parent', type: 'relationship', to: 'categories' },
      ],
    },
    {
      slug: 'posts',
      drafts: true,
      versions: true,
      schedule: true,
      fields: [
        { name: 'title', type: 'text', required: true, localized: true },
        { name: 'slug', type: 'slug', from: 'title' },
        { name: 'summary', type: 'textarea' },
        { name: 'contact', type: 'email' },
        { name: 'views', type: 'number' },
        { name: 'featured', type: 'boolean' },
        { name: 'publishedAt', type: 'date' },
        { name: 'size', type: 'select', options: ['small', 'large'] },
        { name: 'tags', type: 'select', options: ['news', 'tips'], hasMany: true },
        { name: 'category', type: 'relationship', to: 'categories', required: true },
        { name: 'related', type: 'relationship', to: 'posts', hasMany: true },
        { name: 'cover', type: 'upload' },
        { name: 'gallery', type: 'upload', hasMany: true },
        { name: 'body', type: 'richText', localized: true },
        { name: 'data', type: 'json' },
        {
          name: 'seo',
          type: 'group',
          fields: [
            { name: 'title', type: 'text' },
            { name: 'noindex', type: 'boolean' },
          ],
        },
        {
          name: 'links',
          type: 'array',
          fields: [
            { name: 'label', type: 'text', localized: true },
            { name: 'url', type: 'text', required: true },
          ],
        },
        {
          name: 'layout',
          type: 'blocks',
          blocks: [
            {
              slug: 'hero',
              fields: [
                { name: 'heading', type: 'text', required: true },
                { name: 'image', type: 'upload' },
              ],
            },
            { slug: 'quote', fields: [{ name: 'text', type: 'textarea' }] },
          ],
        },
        { name: 'internal', type: 'text', hidden: true },
      ],
    },
  ],
  globals: [
    {
      slug: 'site-settings',
      drafts: true,
      fields: [
        { name: 'name', type: 'text', localized: true },
        { name: 'featured', type: 'relationship', to: 'posts' },
      ],
    },
  ],
  plugins: [graphqlPlugin()],
})

it('keeps the names of the generated schema', async () => {
  const schema = buildGraphQLSchema(await resolveConfig(config))
  await expect(printSchema(schema)).toMatchFileSnapshot('__snapshots__/schema.graphql')
})
