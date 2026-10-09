import { describe, expect, it } from 'vitest'
import {
  ADAPTER_API_VERSION,
  ConfigError,
  definePlugin,
  PLUGIN_API_VERSION,
  resolveConfig,
  VERSION,
} from '../src/index.js'
import { checkRenamedOptions, validateConfig } from '../src/internal.js'
import { baseConfig, fakeDb } from './helpers.js'

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

  it('stops startup for a plugin written for another plugin API', async () => {
    const current = definePlugin((c) => c, { name: 'ok', apiVersion: PLUGIN_API_VERSION })
    await expect(resolveConfig(baseConfig({ plugins: [current] }))).resolves.toBeDefined()
    const newer = definePlugin((c) => c, { name: '@acme/next', apiVersion: PLUGIN_API_VERSION + 1 })
    const error = await resolveConfig(baseConfig({ plugins: [newer] })).catch((e) => e)
    expect(error).toBeInstanceOf(ConfigError)
    expect(error.message).toContain('@acme/next is written for plugin API')
    expect(error.message).toContain('upgrade Easy CMS')
  })

  it('checks the API version of adapters', () => {
    expect(
      validateConfig(baseConfig({ db: { ...fakeDb, apiVersion: ADAPTER_API_VERSION } })),
    ).toEqual([])
    const issues = validateConfig(baseConfig({ db: { ...fakeDb, apiVersion: 99 } }))
    expect(issues.map((i) => i.path)).toEqual(['db'])
  })

  it('names options of plugins and adapters that were renamed', () => {
    expect(() => checkRenamedOptions('p', { kept: 1 }, { old: 'new' })).not.toThrow()
    expect(() => checkRenamedOptions('p', { old: 1 }, { old: 'new (in seconds)' })).toThrow(
      'p.old: is now `new` (in seconds)',
    )
  })
})
