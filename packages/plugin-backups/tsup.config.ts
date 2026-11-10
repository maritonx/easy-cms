import { readFileSync } from 'node:fs'
import { defineConfig } from 'tsup'

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  // tsup's dts build sets `baseUrl`, which TypeScript 6 deprecates.
  dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
  clean: true,
  target: 'es2022',
  // INFO in src/info.ts.
  define: { __PACKAGE_VERSION__: JSON.stringify(version) },
})
