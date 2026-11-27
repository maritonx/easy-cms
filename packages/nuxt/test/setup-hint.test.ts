import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { missingConfigHint } from '../src/setup-hint.js'

// `nuxi module add easy-cms` installs only this module: the warning must say what else to do.
describe('missingConfigHint', () => {
  const hint = missingConfigHint('/app')

  it('names the folder, the packages to install and the env var', () => {
    expect(hint).toContain('No Easy CMS config found in /app')
    expect(hint).toContain('npm install @easy-cms/core @easy-cms/db-sqlite')
    expect(hint).toContain('EASY_CMS_SECRET')
    expect(hint).toContain('npm create easy-cms')
  })

  it('shows a config that uses the real exports', () => {
    const sqlite = readFileSync(join(import.meta.dirname, '../../db-sqlite/src/index.ts'), 'utf8')
    expect(sqlite).toMatch(/export function sqlite\(/)
    expect(hint).toContain("import { sqlite } from '@easy-cms/db-sqlite'")
    expect(hint).toContain("import { defineConfig } from '@easy-cms/core'")
  })
})
