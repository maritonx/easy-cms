import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import pkg from '../package.json' with { type: 'json' }
import { type IO, run } from '../src/index.js'
import {
  decodeStudioLink,
  encodeStudioHash,
  packagesIn,
  StudioLinkError,
} from '../src/studio-link.js'

const V = pkg.version === '0.0.0' ? 'latest' : `^${pkg.version}`

const CONFIG = `import { defineConfig } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { seoPlugin } from '@easy-cms/plugin-seo'
import { color } from '@easy-cms/fields'

// ภาษาไทย and emoji survive the trip ✓
export default defineConfig({
  secret: process.env.EASY_CMS_SECRET ?? '',
  db: sqlite({ url: 'file:./cms.db' }),
  fieldTypes: [color],
  collections: [{ slug: 'posts', fields: [{ name: 'title', type: 'text' }] }],
  plugins: [seoPlugin({ collections: ['posts'] })],
})
`

const link = async (code: string, version?: string) =>
  `https://studio.easycms.dev/#${await encodeStudioHash(version ? { code, version } : { code })}`

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function project(files: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'create-easy-cms-studio-'))
  dirs.push(dir)
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true })
    writeFileSync(join(dir, name), content)
  }
  return dir
}

async function create(dir: string, ...args: string[]) {
  const out: string[] = []
  const err: string[] = []
  const io: IO = {
    out: (l) => out.push(l),
    err: (l) => err.push(l),
    interactive: false,
    capture: async () => null,
  }
  const code = await run([dir, '--skip-install', ...args], io)
  return { code, out: out.join('\n'), err: err.join('\n') }
}

describe('Studio links', () => {
  it('carry the config and its version in the hash, exactly', async () => {
    const shared = await link(CONFIG, '1.57.0')
    expect(shared).toMatch(/^https:\/\/studio\.easycms\.dev\/#v=1\.57\.0&c=[A-Za-z0-9_-]+$/)
    expect(await decodeStudioLink(shared)).toEqual({ code: CONFIG, version: '1.57.0' })
    // The hash alone, with or without its `#`.
    const hash = shared.slice(shared.indexOf('#'))
    expect((await decodeStudioLink(hash)).code).toBe(CONFIG)
    expect((await decodeStudioLink(hash.slice(1))).code).toBe(CONFIG)
  })

  it('stay short enough to share for a real config', async () => {
    const big = CONFIG.repeat(10)
    expect((await link(big)).length).toBeLessThan(big.length / 3)
  })

  it('refuse a link without a config, or a damaged one', async () => {
    await expect(decodeStudioLink('https://studio.easycms.dev/')).rejects.toThrow(StudioLinkError)
    const shared = await link(CONFIG)
    await expect(decodeStudioLink(shared.slice(0, -20))).rejects.toThrow(/cut off or changed/)
  })

  it('read imports in linear time, whatever the spacing', () => {
    const started = performance.now()
    packagesIn(`from${' '.repeat(100_000)}x`)
    expect(performance.now() - started).toBeLessThan(200)
    expect(packagesIn("import ( '@easy-cms/fields' )")).toEqual(['@easy-cms/fields'])
  })

  it('find the @easy-cms packages a config imports', () => {
    expect(packagesIn(CONFIG)).toEqual([
      '@easy-cms/db-sqlite',
      '@easy-cms/fields',
      '@easy-cms/plugin-seo',
    ])
  })
})

describe('create-easy-cms --from', () => {
  it('writes the config from the link, and installs the packages it imports', async () => {
    const dir = project()
    const result = await create(dir, '--from', await link(CONFIG, pkg.version))
    expect(result.code).toBe(0)
    expect(readFileSync(join(dir, 'easy-cms.config.ts'), 'utf8')).toBe(CONFIG)
    expect(result.out).toContain('created easy-cms.config.ts from the Studio link')
    expect(result.out).toContain('(sqlite)')
    for (const name of ['db-sqlite', 'plugin-seo', 'fields'])
      expect(result.out).toContain(`@easy-cms/${name}@${V}`)
  })

  it('takes the database from the config', async () => {
    const dir = project()
    const postgres = CONFIG.replace(
      "import { sqlite } from '@easy-cms/db-sqlite'",
      "import { postgres } from '@easy-cms/db-postgres'",
    )
    const result = await create(dir, '--from', await link(postgres))
    expect(result.code).toBe(0)
    expect(result.out).toContain('(postgres)')
    expect(result.out).not.toContain('@easy-cms/db-sqlite')
    const clash = await create(project(), '--db', 'sqlite', '--from', await link(postgres))
    expect(clash.code).toBe(1)
    expect(clash.err).toContain('uses postgres')
  })

  it('leaves an existing config alone and writes the new one beside it', async () => {
    const dir = project({ 'easy-cms.config.ts': '// mine\n' })
    const result = await create(dir, '--standalone', '--from', await link(CONFIG))
    expect(result.code).toBe(0)
    expect(readFileSync(join(dir, 'easy-cms.config.ts'), 'utf8')).toBe('// mine\n')
    expect(readFileSync(join(dir, 'easy-cms.config.studio.ts'), 'utf8')).toBe(CONFIG)
    expect(result.out).toContain('beside it')
  })

  it('stops before writing anything when the link is broken', async () => {
    const dir = project()
    const result = await create(dir, '--from', 'https://studio.easycms.dev/#c=%%%')
    expect(result.code).toBe(1)
    expect(result.err).toMatch(/cut off or changed/)
    expect(() => readFileSync(join(dir, 'easy-cms.config.ts'))).toThrow()
  })
})
