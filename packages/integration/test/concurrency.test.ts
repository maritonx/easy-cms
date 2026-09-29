import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { defineConfig } from '@easy-cms/core'
import { describe, expect, it } from 'vitest'
import { DIALECT, db, open, SECRET, tempProject } from './helpers.js'

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

  it.runIf(DIALECT === 'sqlite')('waits for other processes writing to the same file', async () => {
    const cwd = tempProject()
    const setup = await open(config, cwd) // creates the tables first
    await setup.destroy()
    const writer = fileURLToPath(new URL('./fixtures/sqlite-writer.mjs', import.meta.url))
    // Every process starts writing at this moment; Windows can take seconds to start one.
    const startAt = String(Date.now() + 5_000)
    await Promise.all(
      ['a', 'b', 'c'].map((name) =>
        promisify(execFile)(process.execPath, [writer, cwd, name, startAt]),
      ),
    )
    const cms = await open(config, cwd)
    expect(await cms.count('notes')).toBe(120)
    await cms.destroy()
  })

  it('shares one write queue between instances in the same process', async () => {
    const cwd = tempProject()
    // Two instances on one file, as when a dev server reloads while the old one still writes.
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
