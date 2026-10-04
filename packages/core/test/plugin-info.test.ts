import { describe, expect, it } from 'vitest'
import { definePlugin, resolveConfig, VERSION } from '../src/index.js'
import { baseConfig } from './helpers.js'

describe('plugin info', () => {
  it('keeps each plugin’s name and version, in order', async () => {
    const named = definePlugin((config) => config, { name: '@acme/stats', version: '1.2.0' })
    expect(named.info).toEqual({ name: '@acme/stats', version: '1.2.0' })
    const config = await resolveConfig(baseConfig({ plugins: [named, (c) => c] }))
    expect(config.installedPlugins).toEqual([{ name: '@acme/stats', version: '1.2.0' }, {}])
  })

  it('has a version (a placeholder when run from source)', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/)
  })
})
