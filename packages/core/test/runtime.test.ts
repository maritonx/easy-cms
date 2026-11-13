import { readdirSync, readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { join, relative as relativePath, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

// Core runs on more than Node (ADR-0067). Only src/runtime/ imports Node's modules, and the
// built package reaches only the ones Node, Bun, Deno and Cloudflare Workers (`nodejs_compat`)
// share, plus those of features that need a server with a disk.

const src = join(import.meta.dirname, '../src')
const dist = join(import.meta.dirname, '../dist')

/** What Node, Bun, Deno and Workers all have: `src/runtime/*.ts` may use these. */
const SHARED = ['async_hooks', 'buffer', 'crypto']
/**
 * Only on a server (`src/runtime/node/`): disk storage, config files, admin modules, backups'
 * scratch files, and downloads from a URL. Workers get their own versions (ADR-0067, step 3).
 */
const SERVER_ONLY = ['dns', 'fs', 'fs/promises', 'http', 'https', 'module', 'net', 'os', 'path']

const builtins = new Set(builtinModules)
const nodeModuleOf = (specifier: string) => {
  const name = specifier.replace(/^node:/, '')
  return builtins.has(name) || specifier.startsWith('node:') ? name : undefined
}

/** A path from `from`, with forward slashes (on Windows too). */
const relative = (from: string, to: string) => relativePath(from, to).split(sep).join('/')

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)],
  )
}

const IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)["']([^"']+)["']/gm
const importsOf = (code: string) => [...code.matchAll(IMPORT)].map((m) => m[1] as string)

describe('Node modules in core', () => {
  it('are imported only in src/runtime/', () => {
    const outside = files(src)
      .filter((file) => !relative(src, file).startsWith('runtime/'))
      .flatMap((file) =>
        importsOf(readFileSync(file, 'utf8'))
          .filter(nodeModuleOf)
          .map((m) => `${relative(src, file)}: ${m}`),
      )
    expect(outside).toEqual([])
  })

  it('in src/runtime/ outside node/ are the ones every runtime has', () => {
    const used = files(join(src, 'runtime'))
      .filter((file) => !relative(src, file).startsWith('runtime/node/'))
      .flatMap((file) =>
        importsOf(readFileSync(file, 'utf8')).flatMap((m) => nodeModuleOf(m) ?? []),
      )
    expect([...new Set(used)].sort()).toEqual(SHARED)
  })

  it('reached by the built package are known', () => {
    const used = new Set<string>()
    const seen = new Set<string>()
    const visit = (file: string) => {
      if (seen.has(file)) return
      seen.add(file)
      for (const specifier of importsOf(readFileSync(file, 'utf8'))) {
        if (specifier.startsWith('./')) visit(join(dist, specifier))
        else {
          const name = nodeModuleOf(specifier)
          if (name) used.add(name)
        }
      }
    }
    visit(join(dist, 'index.js'))
    // A new one here: put it behind src/runtime/ and decide which list it belongs on.
    expect([...used].sort()).toEqual([...SHARED, ...SERVER_ONLY].sort())
  })
})
