import { createRestHandler, defineConfig, ValidationError } from '@easy-cms/core'
import { describe, expect, it } from 'vitest'
import { db, open, SECRET } from './helpers.js'

// Blocks between paragraphs of rich text (#328).

const config = defineConfig({
  secret: SECRET,
  db: db(),
  collections: [
    {
      slug: 'pages',
      access: { read: ({ user }) => user !== null },
      fields: [{ name: 'title', type: 'text' }],
    },
    {
      slug: 'posts',
      access: { read: () => true, create: () => true, update: () => true },
      fields: [
        { name: 'title', type: 'text' },
        {
          name: 'body',
          type: 'richText',
          blocks: [
            {
              slug: 'card',
              admin: {
                summary: async ({ fields, cms }) => {
                  const link = fields.doc as { relationTo: string; value: number } | null
                  if (!link) return 'Card'
                  const doc = await cms.findById(link.relationTo as 'posts', link.value, {
                    depth: 0,
                  })
                  return `Card: ${String(doc?.title)}`
                },
              },
              fields: [
                { name: 'doc', type: 'relationship', to: ['posts', 'pages'], required: true },
              ],
            },
            {
              slug: 'callout',
              fields: [
                {
                  name: 'tone',
                  type: 'select',
                  options: ['info', 'warning'],
                  defaultValue: 'info',
                },
                { name: 'text', type: 'textarea', required: true },
                { name: 'note', type: 'text', access: { read: ({ user }) => user !== null } },
              ],
            },
          ],
        },
      ],
    },
  ],
})

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const block = (blockType: string, fields: Record<string, unknown>, id?: string) => ({
  type: 'block',
  attrs: { blockType, ...(id ? { id } : {}), fields },
})
const doc = (...content: unknown[]) => ({ type: 'doc' as const, content })
const blocksOf = (body: unknown) =>
  ((body as { content: { type: string; attrs: Record<string, unknown> }[] }).content ?? []).filter(
    (n) => n.type === 'block',
  )

describe('blocks in rich text (#328)', () => {
  it('validates block fields, fills defaults and ids, and populates relationships in them', async () => {
    const cms = await open(config)
    const other = await cms.create('posts', { title: 'Other post' })
    const post = await cms.create(
      'posts',
      {
        title: 'With blocks',
        body: doc(
          paragraph('Before'),
          block('callout', { text: 'Mind the gap' }),
          block('card', { doc: { relationTo: 'posts', value: other.id } }, 'card-1'),
        ),
      },
      { depth: 0 },
    )
    const [callout, card] = blocksOf(post.body)
    expect(callout?.attrs).toMatchObject({
      blockType: 'callout',
      id: expect.any(String),
      fields: { tone: 'info', text: 'Mind the gap' },
    })
    expect(card?.attrs).toEqual({
      blockType: 'card',
      id: 'card-1',
      fields: { doc: { relationTo: 'posts', value: other.id } },
    })

    const read = await cms.findById('posts', post.id, { depth: 1 })
    expect(blocksOf(read?.body)[1]?.attrs.fields).toMatchObject({
      doc: { relationTo: 'posts', value: { id: other.id, title: 'Other post' } },
    })
    await cms.destroy()
  })

  it('names the block and field of an error, and refuses blocks the field does not have', async () => {
    const cms = await open(config)
    const errors = async (body: unknown) =>
      cms.create('posts', { title: 'x', body } as never).then(
        () => [],
        (e: unknown) => (e instanceof ValidationError ? e.errors : [e]),
      )
    expect(await errors(doc(block('callout', { tone: 'loud' }, 'c1')))).toEqual([
      { field: 'body.c1.tone', message: 'must be one of: info, warning' },
      { field: 'body.c1.text', message: 'is required' },
    ])
    expect(
      await errors(doc(block('card', { doc: { relationTo: 'pages', value: 99 } }, 'k1'))),
    ).toEqual([{ field: 'body.k1.doc', message: 'pages 99 does not exist' }])
    expect(await errors(doc(block('video', {}, 'v1')))).toEqual([
      {
        field: 'body.v1',
        message: `has a block "video" this field doesn't have: use one of "card", "callout"`,
      },
    ])
    await cms.destroy()
  })

  it('applies field access inside blocks, and the page access of related documents', async () => {
    const cms = await open(config)
    const page = await cms.create('pages', { title: 'Members only' })
    const post = await cms.create('posts', {
      title: 'P',
      body: doc(
        block('callout', { text: 'Hi', note: 'For editors' }),
        block('card', { doc: { relationTo: 'pages', value: page.id } }),
      ),
    })
    const anonymous = await cms.findById('posts', post.id, { overrideAccess: false, user: null })
    const [callout, card] = blocksOf(anonymous?.body)
    expect(callout?.attrs.fields).toEqual({ tone: 'info', text: 'Hi' })
    expect(card?.attrs.fields).toEqual({ doc: null })
    await cms.destroy()
  })

  it('runs admin.summary on the server for the editor’s cards', async () => {
    const cms = await open(config)
    const other = await cms.create('posts', { title: 'Linked' })
    await cms.create('users', { email: 'a@x.co', password: 'password123', role: 'admin' })
    const { token } = await cms.auth.login({ email: 'a@x.co', password: 'password123' })
    const res = await createRestHandler(cms)(
      new Request('http://cms.test/api/cms/admin/ui/block-summaries', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          collection: 'posts',
          field: 'body',
          blocks: [
            {
              id: 'a',
              blockType: 'card',
              fields: { doc: { relationTo: 'posts', value: other.id } },
            },
            { id: 'b', blockType: 'callout', fields: { text: 'no summary function' } },
          ],
        }),
      }),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ summaries: { a: 'Card: Linked' } })
    await cms.destroy()
  })
})
