import { describe, expect, it } from 'vitest'
import { configSignature } from '../src/internal.js'
import { baseConfig } from './helpers.js'

describe('configSignature', () => {
  const make = (title = 'text') =>
    baseConfig({
      collections: [
        {
          slug: 'posts',
          hooks: { beforeChange: [({ data }) => ({ ...data, touched: true })] },
          fields: [{ name: 'title', type: title as 'text' }],
        },
      ],
    })

  it('is the same for the same config loaded twice (another object)', () => {
    expect(configSignature(make())).toBe(configSignature(make()))
  })

  it('changes with the structure, not with how functions were compiled', () => {
    expect(configSignature(make('textarea'))).not.toBe(configSignature(make()))
    // The same hook compiled with other variable names (as each bundle does).
    const renamed = make()
    const other = {
      ...renamed,
      collections: [
        {
          slug: 'posts',
          fields: renamed.collections?.[0]?.fields ?? [],
          hooks: { beforeChange: [({ data: d }: { data: object }) => ({ ...d, touched: true })] },
        },
      ],
    }
    expect(configSignature(other)).toBe(configSignature(make()))
    // A hook added or removed is a structural change.
    const without = {
      ...renamed,
      collections: [{ slug: 'posts', fields: renamed.collections?.[0]?.fields ?? [] }],
    }
    expect(configSignature(without)).not.toBe(configSignature(make()))
  })
})
