import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Every file package.json points to must be in the build (a missing .d.ts once shipped).
describe('package exports', () => {
  it('exist after the build', () => {
    const root = join(import.meta.dirname, '..')
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    const files: string[] = []
    const walk = (value: unknown) => {
      if (typeof value === 'string') files.push(value)
      else if (value && typeof value === 'object') Object.values(value).forEach(walk)
    }
    walk(pkg.exports)
    const missing = files.filter((file) => !existsSync(join(root, file)))
    expect(missing).toEqual([])
  })
})

// `@easy-cms/core/client` runs on edge runtimes: no Node.js modules, and no shared chunks, which
// could pull them in later (#336).
describe('@easy-cms/core/client', () => {
  it('is one file without imports', () => {
    const code = readFileSync(join(import.meta.dirname, '../dist/client.js'), 'utf8')
    expect(code).not.toMatch(/\bnode:/)
    expect(code).not.toMatch(/^\s*import\b|\bimport\s*\(|\brequire\s*\(/m)
    expect(code).not.toMatch(/\bprocess\./)
  })
})
