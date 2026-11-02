import { defineConfig, ValidationError } from '@easy-cms/core'
import { describe, expect, it } from 'vitest'
import { db, open, SECRET } from './helpers.js'

const config = defineConfig({
  secret: SECRET,
  db: db(),
  collections: [
    {
      slug: 'posts',
      access: { read: () => true, create: () => true, update: () => true, delete: () => true },
      preview: ({ doc }) => `/posts/${doc.slug}`,
      fields: [
        { name: 'title', type: 'text' },
        { name: 'slug', type: 'text' },
      ],
    },
    {
      slug: 'tags',
      access: { read: () => true, create: () => true },
      fields: [{ name: 'name', type: 'text' }],
    },
    {
      slug: 'pages',
      access: { read: () => true, create: () => true, update: () => true },
      fields: [
        { name: 'title', type: 'text' },
        { name: 'body', type: 'richText' },
      ],
    },
  ],
})

/** A paragraph: "Read " then a link to a document. */
const body = (doc: unknown, extra: Record<string, unknown> = {}) => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Read ' },
        {
          type: 'text',
          text: 'the post',
          marks: [{ type: 'link', attrs: { href: 'https://stale.example', ...extra, doc } }],
        },
      ],
    },
  ],
})
type Body = ReturnType<typeof body>
const linkOf = (b: unknown) =>
  ((b as Body).content[0]?.content[1]?.marks[0]?.attrs ?? {}) as Record<string, unknown>

describe('links to documents in rich text (#326)', () => {
  it('keeps the id, and reads the URL from the linked document', async () => {
    const cms = await open(config)
    const post = await cms.create('posts', { title: 'Hello', slug: 'hello' })
    const page = await cms.create('pages', {
      title: 'Home',
      body: body({ relationTo: 'posts', value: post.id }) as never,
    })
    // Stored: the id, no URL.
    const raw = await cms.findById('pages', page.id, { depth: 0 })
    expect(linkOf(raw?.body)).toMatchObject({
      doc: { relationTo: 'posts', value: post.id },
      href: null,
    })
    // Read: the URL of the post as it is now.
    const read = await cms.findById('pages', page.id)
    expect(linkOf(read?.body).href).toBe('/posts/hello')
    await cms.update('posts', post.id, { slug: 'hello-again' })
    const moved = await cms.findById('pages', page.id)
    expect(linkOf(moved?.body).href).toBe('/posts/hello-again')
    // A deleted post: the words stay, the link goes.
    await cms.delete('posts', post.id)
    const gone = await cms.findById('pages', page.id)
    expect(linkOf(gone?.body)).toMatchObject({ href: null, doc: { relationTo: 'posts' } })
    await cms.destroy()
  })

  it('refuses links to collections without a URL, to unknown ones and to missing documents', async () => {
    const cms = await open(config)
    const tag = await cms.create('tags', { name: 'news' })
    const save = (doc: unknown) => cms.create('pages', { title: 'x', body: body(doc) as never })
    await expect(save({ relationTo: 'tags', value: tag.id })).rejects.toThrow(
      /whose documents have no URL/,
    )
    await expect(save({ relationTo: 'nope', value: 1 })).rejects.toThrow(/not a collection/)
    await expect(save({ relationTo: 'posts', value: 999 })).rejects.toThrow(/does not exist/)
    await expect(save({ relationTo: 'posts' })).rejects.toThrow(ValidationError)
    await cms.destroy()
  })
})
