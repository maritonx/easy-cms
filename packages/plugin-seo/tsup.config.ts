import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    // tsup's dts build sets `baseUrl`, which TypeScript 6 deprecates.
    dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
    clean: true,
    target: 'es2022',
  },
  {
    // The admin module: one self-contained file for the browser (Web Components, no imports).
    entry: { admin: 'src/admin.ts' },
    format: ['esm'],
    platform: 'browser',
    target: 'es2022',
    minify: true,
    noExternal: [/.*/],
  },
])
