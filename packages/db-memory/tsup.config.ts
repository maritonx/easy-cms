import { readFileSync, writeFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { defineConfig, type Options } from 'tsup'

type Plugin = NonNullable<Options['esbuildPlugins']>[number]

/** `./kit.js` stays a file of its own (the last build), at `path` from the importing file. */
const kitApart = (path: string): Plugin => ({
  name: 'kit-apart',
  setup(build) {
    build.onResolve({ filter: /^\.\/kit\.js$/ }, () => ({ path, external: true }))
  },
})

/**
 * sql.js requires `node:fs` and `node:crypto` only when it runs on Node; browsers never reach
 * them, but bundlers look for them anyway. The browser build bundles sql.js without them.
 */
const sqlJsForBrowsers: Plugin = {
  name: 'sql-js-for-browsers',
  setup(build) {
    build.onResolve({ filter: /^node:(fs|crypto)$/ }, (args) => ({
      path: args.path,
      namespace: 'unused-on-browsers',
    }))
    build.onLoad({ filter: /.*/, namespace: 'unused-on-browsers' }, () => ({
      contents: 'module.exports = {}',
      loader: 'js',
    }))
  },
}

const builtins = new Set(builtinModules)
const isBuiltin = (specifier: string) => {
  const name = specifier.replace(/^node:/, '')
  return builtins.has(name) || builtins.has(name.split('/')[0] as string)
}

/**
 * drizzle-kit's API is one Node bundle: its CLI, drivers and prompts import Node's modules, some
 * at load. Snapshots and migrations call none of them, so each becomes a stand-in whose every
 * property and call gives another stand-in (`randomUUID` is the real one: snapshot ids). The
 * tests check that the SQL matches drizzle-kit's own.
 */
const DRIZZLE_SHARED =
  /^drizzle-orm(\/(sqlite-core|pg-core|mysql-core|singlestore-core|gel-core|casing|relations))?$/

const nodeStandIns: Plugin = {
  name: 'node-stand-ins',
  setup(build) {
    build.onResolve({ filter: /^[^./]/ }, (args) => {
      // drizzle-orm itself, shared with the app; its drivers are only for connecting.
      if (DRIZZLE_SHARED.test(args.path)) return { path: args.path, external: true }
      if (isBuiltin(args.path)) return { path: args.path.replace(/^node:/, ''), namespace: 'node' }
      // Database drivers drizzle-kit imports when it connects, which it doesn't here.
      if (args.importer.includes('drizzle-kit')) return { path: args.path, namespace: 'node' }
      return undefined
    })
    build.onLoad({ filter: /.*/, namespace: 'node' }, async (args) => {
      let names: string[] = []
      if (isBuiltin(args.path)) {
        names = Object.keys(await import(`node:${args.path}`)).filter(
          (name) => /^[A-Za-z_$][\w$]*$/.test(name) && name !== 'default',
        )
      }
      const own: Record<string, string> = {
        randomUUID: '() => globalThis.crypto.randomUUID()',
        createRequire: '() => (id) => standIn(id)',
      }
      const lines = [
        `const standIn = (name) => new Proxy(function () {}, {
          get: (_, key) => key === 'then' ? undefined : key === 'prototype' ? {} : key === Symbol.toPrimitive ? () => '' : standIn(name + '.' + String(key)),
          apply: () => standIn(name + '()'),
          construct: () => standIn('new ' + name),
        })`,
        `export default standIn(${JSON.stringify(args.path)})`,
        ...names.map(
          (name) =>
            `export const ${name} = ${own[name] ?? `standIn(${JSON.stringify(`${args.path}.${name}`)})`}`,
        ),
      ]
      return { contents: lines.join('\n'), loader: 'js' }
    })
  },
}

/** drizzle-kit reads `process` (its env, its output streams), which browsers don't have. */
const PROCESS = `const process = globalThis.process ?? {
  env: {},
  argv: [],
  cwd: () => '/',
  exit: () => {},
  on: () => {},
  stdout: { write: () => true, isTTY: false },
  stderr: { write: () => true, isTTY: false },
  stdin: { isTTY: false },
};`

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    // tsup's dts build sets `baseUrl`, which TypeScript 6 deprecates.
    dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
    // dist/kit.js and dist/browser/ are the other builds'.
    clean: ['!kit.js', '!browser/**'],
    target: 'es2022',
    esbuildPlugins: [kitApart('./kit.js')],
  },
  {
    // For browsers (the `easy-cms-browser` condition): sql.js inside, the same types.
    entry: ['src/index.ts'],
    format: ['esm'],
    outDir: 'dist/browser',
    clean: true,
    platform: 'browser',
    target: 'es2022',
    noExternal: ['sql.js'],
    // One file: sql.js is loaded when the first database opens, from inside it.
    splitting: false,
    esbuildPlugins: [kitApart('../kit.js'), sqlJsForBrowsers],
  },
  {
    entry: { kit: 'src/kit.ts' },
    format: ['esm'],
    platform: 'browser',
    target: 'es2022',
    minify: true,
    noExternal: ['drizzle-kit', /^drizzle-orm\//],
    // One file: the drivers' stand-ins inline, no chunks beside it.
    splitting: false,
    banner: { js: PROCESS },
    esbuildPlugins: [nodeStandIns],
    // drizzle-kit leaves a bare `import "drizzle-orm/casing"` beside the named one; bundlers of
    // the app warn about it (drizzle-orm has no side effects).
    onSuccess: async () => {
      const file = 'dist/kit.js'
      writeFileSync(file, readFileSync(file, 'utf8').replaceAll('import"drizzle-orm/casing";', ''))
    },
  },
])
