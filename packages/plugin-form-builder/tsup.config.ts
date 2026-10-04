import { copyFileSync, readFileSync } from 'node:fs'
import { defineConfig } from 'tsup'

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/client.ts'],
    format: ['esm'],
    // tsup's dts build sets `baseUrl`, which TypeScript 6 deprecates.
    dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
    clean: true,
    target: 'es2022',
    // INFO in src/info.ts.
    define: { __PACKAGE_VERSION__: JSON.stringify(version) },
  },
  {
    // Browser files, one each and self-contained: the admin module and the <easy-form> element.
    entry: { admin: 'src/admin.ts', element: 'src/element.ts' },
    format: ['esm'],
    platform: 'browser',
    target: 'es2022',
    minify: true,
    noExternal: [/.*/],
    // Node's fs, not `cp`: the build runs on Windows too.
    onSuccess: async () => copyFileSync('src/element.css', 'dist/element.css'),
  },
])
