import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type Config,
  createEasyCMS,
  createRestHandler,
  defineConfig,
  defineFieldType,
  generateTypes,
  resolveConfig,
  silentLogger,
  ValidationError,
} from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { color } from '../src/index.js'

const dirs: string[] = []
const open: { destroy(): Promise<void> }[] = []
afterEach(async () => {
  for (const cms of open.splice(0)) await cms.destroy()
  for (const dir of dirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    } catch {
      // Windows may still hold the SQLite file; the OS cleans temp.
    }
  }
})

function db() {
  const dir = mkdtempSync(join(tmpdir(), 'ecms-fields-'))
  dirs.push(dir)
  return sqlite({ url: `file:${join(dir, 'cms.db')}` })
}

const config = () =>
  defineConfig({
    secret: 'x'.repeat(32),
    db: db(),
    fieldTypes: [color],
    collections: [
      {
        slug: 'categories',
        access: { read: () => true },
        fields: [
          { name: 'name', type: 'text', required: true },
          { name: 'color', type: 'color', presets: ['#2f6f5e', '#e8a33d'] },
          { name: 'tint', type: 'color', alpha: true },
          {
            name: 'theme',
            type: 'group',
            fields: [{ name: 'accent', type: 'color', required: true }],
          },
        ],
      },
    ],
  })

async function start(c: Config = config()) {
  const cms = await createEasyCMS(c, { logger: silentLogger })
  open.push(cms)
  return cms
}

describe('color', () => {
  it('is stored as text and checked', async () => {
    const cms = await start()
    const doc = await cms.create('categories', {
      name: 'News',
      color: '#2f6f5e',
      tint: '#2f6f5e80',
      theme: { accent: '#E8A33D' },
    })
    expect(doc).toMatchObject({ color: '#2f6f5e', tint: '#2f6f5e80', theme: { accent: '#E8A33D' } })
    // Queried like text.
    const found = await cms.find('categories', { where: { color: { equals: '#2f6f5e' } } })
    expect(found.docs.map((d) => d.id)).toEqual([doc.id])

    const errorOf = (data: Record<string, unknown>) =>
      cms
        .create('categories', { name: 'x', theme: { accent: '#000000' }, ...data })
        .catch((e: unknown) => e)
    const red = await errorOf({ color: 'red' })
    expect(red).toBeInstanceOf(ValidationError)
    expect((red as ValidationError).errors).toEqual([
      { field: 'color', message: 'must be a color like #2f6f5e' },
    ])
    // Alpha only where the field allows it.
    expect(((await errorOf({ color: '#2f6f5e80' })) as ValidationError).errors[0]?.field).toBe(
      'color',
    )
    expect(((await errorOf({ tint: '#2f6' })) as ValidationError).errors[0]).toEqual({
      field: 'tint',
      message: 'must be a color like #2f6f5e or #2f6f5e80',
    })
    // Inside a group, and `required` still applies.
    expect(((await errorOf({ theme: { accent: '' } })) as ValidationError).errors[0]?.field).toBe(
      'theme.accent',
    )
    // Empty is fine when not required.
    expect(await errorOf({ color: null })).not.toBeInstanceOf(Error)
  })

  it("keeps the field's own validate", async () => {
    const c = config()
    const cms = await start({
      ...c,
      collections: [
        {
          slug: 'brands',
          fields: [
            {
              name: 'color',
              type: 'color',
              validate: (value: unknown) => value !== '#000000' || 'not black',
            } as never,
          ],
        },
      ],
    })
    await expect(cms.create('brands', { color: '#zzzzzz' })).rejects.toThrow(/must be a color/)
    await expect(cms.create('brands', { color: '#000000' })).rejects.toThrow(/not black/)
    await cms.create('brands', { color: '#ffffff' })
  })

  it('shows its components in the admin schema', async () => {
    const cms = await start()
    const handle = createRestHandler(cms)
    await cms.create('users', { email: 'a@example.com', password: 'password-123' })
    const { token } = await cms.auth.login({ email: 'a@example.com', password: 'password-123' })
    const response = await handle(
      new Request('http://localhost/api/cms/admin/schema', {
        headers: { authorization: `Bearer ${token}` },
      }),
    )
    const schema = (await response.json()) as {
      collections: { slug: string; fields: Record<string, unknown>[] }[]
      modules?: string[]
    }
    const fields = schema.collections.find((c) => c.slug === 'categories')?.fields ?? []
    expect(fields.find((f) => f.name === 'color')).toMatchObject({
      type: 'text',
      customType: 'color',
      admin: {
        component: { tag: 'ecms-color-field', props: { presets: ['#2f6f5e', '#e8a33d'] } },
        cell: { tag: 'ecms-color-cell', props: { presets: ['#2f6f5e', '#e8a33d'] } },
      },
    })
    expect(fields.find((f) => f.name === 'tint')).toMatchObject({
      admin: { component: { tag: 'ecms-color-field', props: { alpha: true } } },
    })
  })

  it('adds its admin module once, and types the value as a string', async () => {
    const resolved = await resolveConfig(config())
    expect(resolved.admin.modules).toEqual(['@easy-cms/fields/admin'])
    const types = generateTypes(resolved)
    expect(types).toMatch(/color\?: string \| null/)
    expect(types).toMatch(/accent: string/)
  })

  it('checks presets and names', async () => {
    const bad = (fields: unknown[], fieldTypes: unknown[] = [color]) =>
      resolveConfig({
        ...config(),
        fieldTypes: fieldTypes as never,
        collections: [{ slug: 'x', fields: fields as never }],
      })
    await expect(bad([{ name: 'c', type: 'color', presets: ['red'] }])).rejects.toThrow(
      /presets must be colors like #2f6f5e/,
    )
    await expect(
      bad([{ name: 'c', type: 'color', presets: ['#2f6f5e80'], alpha: true }]),
    ).resolves.toBeDefined()
    await expect(bad([], [color, color])).rejects.toThrow(/"color" is listed twice/)
    await expect(bad([], [defineFieldType({ name: 'text', base: 'text' })])).rejects.toThrow(
      /"text" is a built-in field type/,
    )
    await expect(
      bad([], [defineFieldType({ name: 'rating', base: 'relationship' as never })]),
    ).rejects.toThrow(/base/)
    // Without the type listed, `color` is an unknown type.
    await expect(bad([{ name: 'c', type: 'color' }], [])).rejects.toThrow(/type/)
  })
})
