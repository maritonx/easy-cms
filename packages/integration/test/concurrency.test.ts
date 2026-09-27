import { defineConfig } from '@easy-cms/core'
import { describe, expect, it } from 'vitest'
import { db, open, SECRET, tempProject } from './helpers.js'

const config = defineConfig({
  secret: SECRET,
  db: db(),
  collections: [
    {
      slug: 'notes',
      fields: [
        { name: 'text', type: 'text' },
        { name: 'tags', type: 'select', options: ['a', 'b'], hasMany: true },
      ],
    },
  ],
  globals: [{ slug: 'site', fields: [{ name: 'name', type: 'text' }] }],
})

describe('concurrent writes', () => {
  it('saves writes made at the same time (SQLite has one writer)', async () => {
    const cms = await open(config)
    const created = await Promise.all(
      Array.from({ length: 20 }, (_, i) => cms.create('notes', { text: `n${i}`, tags: ['a'] })),
    )
    const [first, ...rest] = created
    await Promise.all([
      ...rest.map((note) => cms.update('notes', note.id, { tags: ['a', 'b'] })),
      cms.updateGlobal('site', { name: 'Site' }),
      cms.delete('notes', first?.id as number),
    ])
    const { docs } = await cms.find('notes', { limit: 0, where: { tags: { equals: 'b' } } })
    expect(docs).toHaveLength(19)
    expect(await cms.count('notes')).toBe(19)
    expect((await cms.findGlobal('site')).name).toBe('Site')
    await cms.destroy()
  })

  it('waits for another process writing to the same database', async () => {
    const cwd = tempProject()
    // Two instances have their own connections, like two processes (a server and the CLI).
    const one = await open(config, cwd)
    const two = await open(config, cwd)
    await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        (i % 2 ? one : two).create('notes', { text: `n${i}`, tags: ['a', 'b'] }),
      ),
    )
    expect(await one.count('notes')).toBe(30)
    await one.destroy()
    await two.destroy()
  })
})
