import { defineConfig } from 'tsup'

// tsup's dts build sets `baseUrl`, which TypeScript 6 deprecates.
const dts = { compilerOptions: { ignoreDeprecations: '6.0' } }

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/config.ts'],
    format: ['esm'],
    // All declarations come from this config: the two configs build in parallel, and this one's
    // clean step would delete a declaration file written by the other.
    dts: { ...dts, entry: ['src/index.ts', 'src/config.ts', 'src/live-preview.ts'] },
    clean: true,
    target: 'node22',
    external: ['next', 'next/headers.js'],
  },
  {
    // A Client Component module: Next.js needs the directive at the top of the built file.
    entry: ['src/live-preview.ts'],
    format: ['esm'],
    dts: false,
    target: 'es2022',
    external: ['react', '@easy-cms/core/live-preview'],
    banner: { js: "'use client'" },
  },
])
