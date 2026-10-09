import { describe, expect, it } from 'vitest'
import { defineFieldType, resolveConfig } from '../src/index.js'
import { generateTypes } from '../src/internal.js'
import { baseConfig } from './helpers.js'

/** A field type from a package: a 1–5 rating stored as a number. */
const rating = defineFieldType({
  name: 'rating',
  base: 'number',
  validate: (value, { field }) =>
    (Number.isInteger(value) &&
      (value as number) >= 1 &&
      (value as number) <= Number(field.max ?? 5)) ||
    'must be a whole number of stars',
  admin: { component: 'ecms-stars', module: './admin/stars.js', props: ['max'] },
  typescript: '1 | 2 | 3 | 4 | 5',
})

const fieldsOf = async (fields: unknown[]) => {
  const config = await resolveConfig(
    baseConfig({
      fieldTypes: [rating],
      collections: [{ slug: 'reviews', fields: fields as never }],
      globals: [{ slug: 'settings', fields: [{ name: 'minimum', type: 'rating' } as never] }],
    }),
  )
  return { config, fields: config.collections.find((c) => c.slug === 'reviews')?.fields ?? [] }
}

describe('field types', () => {
  it('become their base type everywhere fields can be', async () => {
    const { config, fields } = await fieldsOf([
      { name: 'stars', type: 'rating', max: 3 },
      { name: 'parts', type: 'array', fields: [{ name: 'stars', type: 'rating' }] },
      {
        name: 'layout',
        type: 'blocks',
        blocks: [{ slug: 'score', fields: [{ name: 'stars', type: 'rating' }] }],
      },
    ])
    expect(fields[0]).toMatchObject({
      type: 'number',
      customType: 'rating',
      admin: { component: { tag: 'ecms-stars', props: { max: 3 } } },
    })
    const parts = fields[1] as unknown as { fields: { type: string; admin: unknown }[] }
    // No options to pass: the tag alone.
    expect(parts.fields[0]).toMatchObject({ type: 'number', admin: { component: 'ecms-stars' } })
    const layout = fields[2] as unknown as { blocks: { fields: { customType: string }[] }[] }
    expect(layout.blocks[0]?.fields[0]?.customType).toBe('rating')
    expect(config.globals[0]?.fields[0]).toMatchObject({ type: 'number', customType: 'rating' })
    expect(config.admin.modules).toEqual(['./admin/stars.js'])
  })

  it("runs the type's check before the field's, skipping empty values", async () => {
    const { fields } = await fieldsOf([
      {
        name: 'stars',
        type: 'rating',
        max: 3,
        validate: (value: unknown) => value !== 2 || 'not two',
      },
    ])
    const validate = fields[0]?.validate as (v: unknown, ctx: unknown) => Promise<unknown>
    const ctx = { data: {}, operation: 'create' }
    expect(await validate(4, ctx)).toBe('must be a whole number of stars')
    expect(await validate(2, ctx)).toBe('not two')
    expect(await validate(3, ctx)).toBe(true)
    expect(await validate(null, ctx)).toBe(true)
  })

  it('keeps components the field sets itself', async () => {
    const { fields } = await fieldsOf([
      { name: 'stars', type: 'rating', admin: { component: 'ecms-my-stars' } },
    ])
    expect(fields[0]?.admin?.component).toBe('ecms-my-stars')
  })

  it("uses the type's TypeScript type", async () => {
    const { config } = await fieldsOf([{ name: 'stars', type: 'rating', required: true }])
    expect(generateTypes(config)).toMatch(/stars: 1 \| 2 \| 3 \| 4 \| 5/)
  })

  it('rejects bad definitions', async () => {
    const bad = (fieldTypes: unknown) =>
      resolveConfig(baseConfig({ fieldTypes: fieldTypes as never }))
    await expect(bad({})).rejects.toThrow(/fieldTypes: must be an array/)
    await expect(bad([{ name: 'Rating', base: 'number' }])).rejects.toThrow(/lowercase name/)
    await expect(bad([{ name: 'select', base: 'text' }])).rejects.toThrow(/built-in/)
    await expect(bad([rating, rating])).rejects.toThrow(/listed twice/)
    await expect(bad([{ name: 'tags', base: 'array' }])).rejects.toThrow(/must be one of text/)
  })
})
