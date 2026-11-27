import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { defineConfig, type Options } from 'tsup'

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }

const entry = [
  'src/index.ts',
  'src/live-preview.ts',
  'src/conditions.ts',
  'src/plugin.ts',
  'src/internal.ts',
  'src/client.ts',
]
// VERSION in src/version.ts.
const define = { __EASY_CMS_VERSION__: JSON.stringify(version) }

const runtime = resolve('src/runtime')
const browser = join(runtime, 'browser')
/** Modules of src/runtime/ and their browser versions in src/runtime/browser/ (ADR-0074). */
const swaps = new Map(
  [
    ['crypto.ts', 'crypto.ts'],
    ['bytes.ts', 'bytes.ts'],
    ['context.ts', 'context.ts'],
    ['node/files.ts', 'files.ts'],
    ['node/disk-storage.ts', 'disk-storage.ts'],
    ['node/remote-file.ts', 'remote-file.ts'],
  ].map(([from, to]) => [join(runtime, from as string), join(browser, to as string)]),
)
/** Packages that only work on a server, and what stands in for them. */
const packages: Record<string, string> = {
  jiti: join(browser, 'jiti.ts'),
  sharp: join(browser, 'sharp.ts'),
}

type Plugin = NonNullable<Options['esbuildPlugins']>[number]

/**
 * Atop every file of the browser build, for the bare `process` core reads: the page's own when
 * it has one, otherwise no environment variables, `/` as the working directory, and log lines to
 * the console. A banner, not an injected module: that would add an import to every file.
 */
const PROCESS = `const process = globalThis.process ?? {
  env: {},
  cwd: () => '/',
  argv: [],
  stdout: { write: (line) => (console.log(line.replace(/\\n$/, '')), true) },
  stderr: { write: (line) => (console.error(line.replace(/\\n$/, '')), true) },
};`

const browserRuntime: Plugin = {
  name: 'easy-cms-browser-runtime',
  setup(build) {
    build.onResolve({ filter: /^\.\.?\// }, (args) => {
      const target = resolve(args.resolveDir, args.path).replace(/\.js$/, '.ts')
      const swap = swaps.get(target)
      return swap ? { path: swap } : undefined
    })
    build.onResolve({ filter: /^(jiti|sharp)$/ }, (args) => ({
      path: packages[args.path] as string,
    }))
  },
}

const node: Options = {
  entry,
  format: ['esm'],
  // tsup's dts build sets `baseUrl`, which TypeScript 6 deprecates.
  // Members tagged `@internal` are left out of the published types.
  dts: { compilerOptions: { ignoreDeprecations: '6.0', stripInternal: true } },
  // dist/browser/ is the other build's.
  clean: ['!browser/**'],
  target: 'node22',
  define,
}

/**
 * The same entries for browsers (Studio, ADR-0074), picked with the `easy-cms-browser` export
 * condition: no Node modules, the types of the build above.
 */
const browserBuild: Options = {
  entry,
  format: ['esm'],
  outDir: join('dist', 'browser'),
  clean: true,
  platform: 'browser',
  target: 'es2022',
  define,
  banner: { js: PROCESS },
  noExternal: Object.keys(packages),
  esbuildPlugins: [browserRuntime],
}

export default defineConfig([node, browserBuild])
