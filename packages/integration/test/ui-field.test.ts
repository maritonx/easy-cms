import {
  type AdminSchema,
  ConfigError,
  createRestHandler,
  defineConfig,
  resolveConfig,
} from '@easy-cms/core'
import { generateTypes } from '@easy-cms/core/internal'
import { describe, expect, it } from 'vitest'
import { db, open, SECRET } from './helpers.js'

const config = defineConfig({
  secret: SECRET,
  db: db(),
  collections: [
    {
      slug: 'posts',
      access: { read: () => true, create: () => true, update: () => true },
      admin: {
        layout: [
          { tab: 'Main', fields: ['title', 'estimate', 'meta'] },
          { tab: 'More', fields: ['rows', 'sections'] },
        ],
      },
      fields: [
        { name: 'title', type: 'text' },
        { name: 'estimate', type: 'ui', admin: { component: 'acme-estimate' } },
        {
          name: 'meta',
          type: 'group',
          fields: [
            { name: 'description', type: 'text' },
            {
              name: 'preview',
              type: 'ui',
              label: 'Preview',
              admin: { component: { tag: 'acme-preview', props: { max: 3 } } },
            },
          ],
        },
        {
          name: 'rows',
          type: 'array',
          fields: [
            { name: 'x', type: 'text' },
            { name: 'sum', type: 'ui', admin: { component: 'acme-sum' } },
          ],
        },
        {
          name: 'sections',
          type: 'blocks',
          blocks: [
            {
              slug: 'hero',
              fields: [
                { name: 'heading', type: 'text' },
                { name: 'hint', type: 'ui', admin: { component: 'acme-hint' } },
              ],
            },
          ],
        },
      ],
    },
  ],
})

describe('ui fields (#325)', () => {
  it('store nothing and never reach the API', async () => {
    const cms = await open(config)
    const created = await cms.create('posts', {
      title: 'Hello',
      meta: { description: 'D' },
      rows: [{ x: 'a' }],
      sections: [{ blockType: 'hero', heading: 'H' }],
    })
    const doc = (await cms.findById('posts', created.id)) as Record<string, unknown>
    expect(doc).not.toHaveProperty('estimate')
    expect(doc.meta).toEqual({ description: 'D' })
    expect((doc.rows as Record<string, unknown>[])[0]).not.toHaveProperty('sum')
    expect((doc.sections as Record<string, unknown>[])[0]).not.toHaveProperty('hint')
    // A value sent for one is not stored.
    const handle = createRestHandler(cms)
    const response = await handle(
      new Request('http://cms.test/api/cms/posts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Two', estimate: 'x' }),
      }),
    )
    const body = (await response.json()) as Record<string, unknown>
    expect(body).not.toHaveProperty('estimate')
    await cms.destroy()
  })

  it('show in the admin where they were placed, groups, arrays and blocks included', async () => {
    const cms = await open(config)
    await cms.create('users', { email: 'admin@x.co', password: 'password123', role: 'admin' })
    const { token } = await cms.auth.login({ email: 'admin@x.co', password: 'password123' })
    const handle = createRestHandler(cms)
    const schema = (await (
      await handle(
        new Request('http://cms.test/api/cms/admin/ui/schema', {
          headers: { authorization: `Bearer ${token}` },
        }),
      )
    ).json()) as AdminSchema
    const posts = schema.collections.find((c) => c.slug === 'posts')
    const fields = posts?.fields ?? []
    expect(fields.map((f) => f.name)).toEqual(['title', 'estimate', 'meta', 'rows', 'sections'])
    expect(fields[1]).toMatchObject({
      type: 'ui',
      label: '',
      admin: { component: { tag: 'acme-estimate' } },
    })
    const meta = fields.find((f) => f.name === 'meta')
    expect(meta?.fields?.map((f) => [f.name, f.type, f.label])).toEqual([
      ['description', 'text', undefined],
      ['preview', 'ui', 'Preview'],
    ])
    expect(fields.find((f) => f.name === 'rows')?.fields?.map((f) => f.name)).toEqual(['x', 'sum'])
    expect(
      fields.find((f) => f.name === 'sections')?.blocks?.[0]?.fields.map((f) => f.name),
    ).toEqual(['heading', 'hint'])
    expect(JSON.stringify(posts?.layout)).toContain('estimate')
    await cms.destroy()
  })

  it('are left out of the generated types, and the config can be resolved again', async () => {
    const resolved = await resolveConfig(config)
    expect(generateTypes(resolved)).not.toMatch(/estimate|preview|\bsum\b|hint/)
    // A second instance from the same config (its layout still names the ui field).
    const one = await open(config)
    const two = await open(config)
    await two.destroy()
    await one.destroy()
  })

  it('need a component, take no value options, and need a stored field beside them', async () => {
    const base = { secret: SECRET, db: db() }
    const posts = (fields: unknown[]) =>
      defineConfig({ ...base, collections: [{ slug: 'posts', fields: fields as never }] })
    await expect(
      resolveConfig(
        posts([
          { name: 't', type: 'text' },
          { name: 'x', type: 'ui' },
        ]),
      ),
    ).rejects.toThrow(/admin\.component.*required on a ui field/)
    await expect(
      resolveConfig(
        posts([
          { name: 't', type: 'text' },
          { name: 'x', type: 'ui', required: true, admin: { component: 'a-b' } },
        ]),
      ),
    ).rejects.toThrow(/required.*no effect on a ui field/)
    await expect(
      resolveConfig(
        posts([
          { name: 't', type: 'text' },
          {
            name: 'g',
            type: 'group',
            fields: [{ name: 'x', type: 'ui', admin: { component: 'a-b' } }],
          },
        ]),
      ),
    ).rejects.toThrow(ConfigError)
  })
})
