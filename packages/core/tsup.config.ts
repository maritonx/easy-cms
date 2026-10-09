import { readFileSync } from 'node:fs'
import { defineConfig } from 'tsup'

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/live-preview.ts',
    'src/conditions.ts',
    'src/plugin.ts',
    'src/internal.ts',
  ],
  format: ['esm'],
  // tsup's dts build sets `baseUrl`, which TypeScript 6 deprecates.
  // Members tagged `@internal` are left out of the published types.
  dts: { compilerOptions: { ignoreDeprecations: '6.0', stripInternal: true } },
  clean: true,
  target: 'node22',
  // VERSION in src/version.ts.
  define: { __EASY_CMS_VERSION__: JSON.stringify(version) },
})
