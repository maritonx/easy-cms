import { readdirSync, readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { join, posix } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as browserBytes from '../src/runtime/browser/bytes.js'
import { createContext } from '../src/runtime/browser/context.js'
import * as browserCrypto from '../src/runtime/browser/crypto.js'
import * as browserFiles from '../src/runtime/browser/files.js'
import * as nodeBytes from '../src/runtime/bytes.js'
import * as nodeCrypto from '../src/runtime/crypto.js'

// The browser build swaps src/runtime/ for src/runtime/browser/ (ADR-0074). Each swap must give
// what the Node version gives, or a token made on one side won't open on the other.

const random = (size: number) => globalThis.crypto.getRandomValues(new Uint8Array(size))
const ENCODINGS = ['hex', 'base64', 'base64url'] as const

describe('browser bytes', () => {
  it('encode like Buffer', () => {
    for (const size of [0, 1, 2, 3, 4, 5, 31, 32, 33, 257]) {
      const data = random(size)
      for (const encoding of ENCODINGS) {
        expect(browserBytes.encode(data, encoding)).toBe(nodeBytes.encode(data, encoding))
      }
    }
    for (const encoding of ENCODINGS) {
      expect(browserBytes.encode('héllo ✓', encoding)).toBe(nodeBytes.encode('héllo ✓', encoding))
    }
  })

  it('decode like Buffer, also what is not quite in the encoding', () => {
    for (const size of [0, 1, 2, 3, 4, 5, 32, 100]) {
      const data = random(size)
      for (const encoding of ENCODINGS) {
        const text = nodeBytes.encode(data, encoding)
        expect(browserBytes.decode(text, encoding)).toEqual(nodeBytes.decode(text, encoding))
      }
    }
    const odd: [string, (typeof ENCODINGS)[number]][] = [
      ['aGVsbG8', 'base64'],
      ['aGVs bG8=\n', 'base64'],
      ['a-_b', 'base64'],
      ['a+/b', 'base64url'],
      ['aGVsbG8=trailing', 'base64'],
      ['abc', 'hex'],
      ['abzz12', 'hex'],
      ['ABcd', 'hex'],
    ]
    for (const [text, encoding] of odd) {
      expect(browserBytes.decode(text, encoding), `${text} as ${encoding}`).toEqual(
        nodeBytes.decode(text, encoding),
      )
    }
  })

  it('find ASCII text in bytes', () => {
    const data = nodeBytes.utf8('<svg onload=x>')
    for (const search of ['onload', '<svg', 'x>', '', 'onclick']) {
      expect(browserBytes.containsAscii(data, search)).toBe(nodeBytes.containsAscii(data, search))
    }
  })
})

describe('browser crypto', () => {
  it('hashes and MACs like node:crypto', () => {
    for (const data of ['', 'abc', random(100)]) {
      for (const algorithm of ['sha1', 'sha256'] as const) {
        expect(browserCrypto.hash(algorithm, data)).toEqual(nodeCrypto.hash(algorithm, data))
        expect(browserCrypto.hash(algorithm, data, 'hex')).toBe(
          nodeCrypto.hash(algorithm, data, 'hex'),
        )
      }
      expect(browserCrypto.hmac('key', data, 'base64url')).toBe(
        nodeCrypto.hmac('key', data, 'base64url'),
      )
    }
    expect(browserCrypto.hkdf('secret', 'salt', 'info', 42)).toEqual(
      nodeCrypto.hkdf('secret', 'salt', 'info', 42),
    )
  })

  it('compares values', () => {
    expect(browserCrypto.safeEqual('abc', 'abc')).toBe(true)
    expect(browserCrypto.safeEqual('abc', 'abd')).toBe(false)
    expect(browserCrypto.safeEqual('abc', 'abcd')).toBe(false)
  })

  it('seals with AES-GCM so either side opens it', () => {
    const key = random(32)
    const iv = random(12)
    const data = random(77)
    const sealed = browserCrypto.aesGcmEncrypt(key, iv, data)
    expect(sealed).toEqual(nodeCrypto.aesGcmEncrypt(key, iv, data))
    expect(nodeCrypto.aesGcmDecrypt(key, iv, sealed)).toEqual(data)
    expect(browserCrypto.aesGcmDecrypt(key, iv, sealed)).toEqual(data)
    const changed = { ...sealed, data: sealed.data.map((b, i) => (i === 0 ? b ^ 1 : b)) }
    expect(() => browserCrypto.aesGcmDecrypt(key, iv, changed)).toThrow()
  })

  it('derives the same scrypt key', async () => {
    const salt = random(16)
    const params = { N: 2 ** 10, r: 8, p: 1 }
    expect(await browserCrypto.scrypt('pässword', salt, 32, params)).toEqual(
      await nodeCrypto.scrypt('pässword', salt, 32, params),
    )
  })
})

describe('browser context', () => {
  it('keeps a value through awaits, and restores the one before', async () => {
    const context = createContext<string>()
    const seen: (string | undefined)[] = []
    await context.run('outer', async () => {
      await Promise.resolve()
      seen.push(context.getStore())
      await context.run('inner', async () => {
        await new Promise((resolve) => setTimeout(resolve, 1))
        seen.push(context.getStore())
      })
      seen.push(context.getStore())
    })
    seen.push(context.getStore())
    expect(seen).toEqual(['outer', 'inner', 'outer', undefined])
  })

  it('restores the value when fn throws or rejects', async () => {
    const context = createContext<number>()
    expect(() =>
      context.run(1, () => {
        throw new Error('sync')
      }),
    ).toThrow('sync')
    await expect(context.run(2, async () => Promise.reject(new Error('async')))).rejects.toThrow()
    expect(context.getStore()).toBeUndefined()
    expect(context.run(3, () => context.getStore())).toBe(3)
  })
})

describe('browser files', () => {
  it('join and resolve paths as POSIX paths from /', () => {
    const cases = [
      ['a', 'b'],
      ['/a', '../b', './c'],
      ['a/', '/b'],
      ['..', 'a'],
      ['/', 'migrations'],
    ]
    for (const paths of cases) {
      expect(browserFiles.joinPath(...paths)).toBe(posix.join(...paths))
      expect(browserFiles.resolvePath(...paths)).toBe(posix.resolve('/', ...paths))
    }
  })

  it('find no files and refuse to write', async () => {
    expect(browserFiles.fileExists('/x')).toBe(false)
    expect(await browserFiles.readText('/x')).toBeUndefined()
    await expect(browserFiles.writeText('/x', 'y')).rejects.toThrow(/file system/)
    await expect(browserFiles.listDir('/x')).rejects.toThrow(/file system/)
  })
})

describe('the browser build', () => {
  const dist = join(import.meta.dirname, '../dist/browser')
  // esbuild's output: static imports start a line; dynamic ones are `import("x")`.
  const IMPORT =
    /^(?:import|export)\b[^;"']*?["']([^"']+)["'];|\bimport\(\s*["']([^"']+)["']\s*\)/gm
  const builtins = new Set(builtinModules)

  it('reaches no Node module, and only the packages it declares', () => {
    const bare = new Set<string>()
    for (const file of readdirSync(dist).filter((f) => f.endsWith('.js'))) {
      for (const [, fromStatic, fromDynamic] of readFileSync(join(dist, file), 'utf8').matchAll(
        IMPORT,
      )) {
        const specifier = (fromStatic ?? fromDynamic) as string
        if (!specifier.startsWith('.')) bare.add(specifier)
      }
    }
    const node = [...bare].filter((s) => s.startsWith('node:') || builtins.has(s))
    expect(node).toEqual([])
    const packages = [...bare].map((s) =>
      s
        .split('/')
        .slice(0, s.startsWith('@') ? 2 : 1)
        .join('/'),
    )
    // `@opentelemetry/api` is loaded only when `telemetry` is on (an optional peer dependency).
    expect([...new Set(packages)].sort()).toEqual([
      '@noble/ciphers',
      '@noble/hashes',
      '@opentelemetry/api',
    ])
  })

  it('is what the easy-cms-browser condition points to', () => {
    const { exports } = JSON.parse(
      readFileSync(join(import.meta.dirname, '../package.json'), 'utf8'),
    ) as { exports: Record<string, string | Record<string, string>> }
    for (const [path, target] of Object.entries(exports)) {
      if (typeof target === 'string') continue
      expect(Object.keys(target), path).toEqual(['types', 'easy-cms-browser', 'default'])
      expect(target['easy-cms-browser'], path).toBe(
        target.default?.replace('./dist/', './dist/browser/'),
      )
    }
  })
})
