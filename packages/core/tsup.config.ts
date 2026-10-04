import { readFileSync } from 'node:fs'
import { defineConfig } from 'tsup'

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }

export default defineConfig({
  entry: ['src/index.ts', 'src/live-preview.ts'],
  format: ['esm'],
  // tsup's dts build sets `baseUrl`, which TypeScript 6 deprecates.
  dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
  clean: true,
  target: 'node22',
  // VERSION in src/version.ts.
  define: { __EASY_CMS_VERSION__: JSON.stringify(version) },
})
