import { defineConfig, resolveConfig, ValidationError } from '@easy-cms/core'
import { generateTypes } from '@easy-cms/core/internal'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, open, SECRET } from './helpers.js'

/** Uploads with `hasMany` (a gallery), `minRows`/`maxRows` and `mimeTypes`. */
const config = defineConfig({
  secret: SECRET,
  db: db(),
  localization: { locales: ['th', 'en'], defaultLocale: 'th' },
  collections: [
    {
      slug: 'posts',
      access: { read: () => true },
      fields: [
        { name: 'title', type: 'text' },
        { name: 'cover', type: 'upload', mimeTypes: ['image/*'] },
        { name: 'gallery', type: 'upload', hasMany: true, maxRows: 3, mimeTypes: ['image/*'] },
        { name: 'files', type: 'upload', hasMany: true, minRows: 1 },
        { name: 'slides', type: 'upload', hasMany: true, localized: true },
      ],
    },
  ],
})

const png = () =>
  sharp({ create: { width: 8, height: 8, channels: 3, background: '#2f6f5e' } })
    .png()
    .toBuffer()
    .then((b) => new Uint8Array(b))

type CMS = Awaited<ReturnType<typeof open<typeof config>>>
let cms: CMS
const images: number[] = []
let pdf: number
beforeAll(async () => {
  cms = await open(config)
  for (const name of ['a.png', 'b.png', 'c.png', 'd.png'])
    images.push((await cms.upload({ data: await png(), name })).id as number)
  pdf = (await cms.upload({ data: new TextEncoder().encode('%PDF-1.4\n%…'), name: 'menu.pdf' }))
    .id as number
})
afterAll(() => cms.destroy())

describe('upload with hasMany', () => {
  it('keeps several files in order and populates them', async () => {
    const [a, b, c] = images as [number, number, number]
    const post = await cms.create('posts', { title: 'Trip', gallery: [c, a, b], files: [pdf] })
    expect(post.gallery.map((m) => (typeof m === 'object' ? m.id : m))).toEqual([c, a, b])
    const read = await cms.findById('posts', post.id, { depth: 1 })
    expect(read?.gallery.map((m) => (typeof m === 'object' ? m.filename : m))).toEqual([
      expect.stringMatching(/^c-/),
      expect.stringMatching(/^a-/),
      expect.stringMatching(/^b-/),
    ])
    const ids = await cms.findById('posts', post.id, { depth: 0 })
    expect(ids?.gallery).toEqual([c, a, b])

    // Reordering is an update with the new order.
    const moved = await cms.update('posts', post.id, { gallery: [a, b, c] }, { depth: 0 })
    expect(moved.gallery).toEqual([a, b, c])
    // Queries find documents by any of the files.
    const found = await cms.find('posts', { where: { gallery: { in: [b] } } })
    expect(found.docs.map((d) => d.id)).toContain(post.id)
    // Without files it reads as an empty list.
    const empty = await cms.create('posts', { title: 'Empty', files: [pdf] })
    expect(empty.gallery).toEqual([])
  })

  it('checks minRows, maxRows and mimeTypes', async () => {
    const [a, b, c, d] = images as [number, number, number, number]
    const errorOf = (data: Record<string, unknown>) =>
      cms.create('posts', { title: 'x', files: [pdf], ...data }).catch((e) => e)

    const tooMany = await errorOf({ gallery: [a, b, c, d] })
    expect(tooMany).toBeInstanceOf(ValidationError)
    expect(tooMany.errors).toEqual([{ field: 'gallery', message: 'must have at most 3 files' }])

    const tooFew = await errorOf({ files: [] })
    expect(tooFew.errors).toEqual([{ field: 'files', message: 'must have at least 1 file' }])

    const notImage = await errorOf({ gallery: [a, pdf] })
    expect(notImage.errors[0]).toMatchObject({
      field: 'gallery',
      message: expect.stringMatching(
        /^must be an image \(menu-[0-9a-f]+\.pdf is application\/pdf\)$/,
      ),
    })
    // A single upload's mimeTypes too.
    expect((await errorOf({ cover: pdf })).errors[0].field).toBe('cover')
    expect(await errorOf({ cover: a, gallery: [a, b] })).not.toBeInstanceOf(Error)
  })

  it('has one list per locale when localized', async () => {
    const [a, b, c] = images as [number, number, number]
    const post = await cms.create('posts', { title: 'Slides', files: [pdf], slides: [a, b] })
    await cms.update('posts', post.id, { slides: [c] }, { locale: 'en' })
    expect((await cms.findById('posts', post.id, { depth: 0 }))?.slides).toEqual([a, b])
    expect((await cms.findById('posts', post.id, { depth: 0, locale: 'en' }))?.slides).toEqual([c])
  })

  it('validates the options and types the value', async () => {
    const bad = (field: Record<string, unknown>) =>
      resolveConfig(
        defineConfig({
          secret: SECRET,
          db: db(),
          collections: [{ slug: 'x', fields: [{ name: 'f', type: 'upload', ...field } as never] }],
        }),
      )
    await expect(bad({ maxRows: 3 })).rejects.toThrow(/minRows and maxRows need hasMany/)
    await expect(bad({ hasMany: true, minRows: 4, maxRows: 2 })).rejects.toThrow(
      /minRows \(4\) is greater than maxRows \(2\)/,
    )
    await expect(bad({ mimeTypes: ['images'] })).rejects.toThrow(/must be a list of MIME types/)

    const types = generateTypes(await resolveConfig(config))
    expect(types).toMatch(/gallery: \(ID \| Media\)\[\]/)
    expect(types).toMatch(/cover\?: ID \| Media \| null/)
  })
})
