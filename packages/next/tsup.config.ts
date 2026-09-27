import { defineConfig } from 'tsup'

// tsup's dts build sets `baseUrl`, which TypeScript 6 deprecates.
const dts = { compilerOptions: { ignoreDeprecations: '6.0' } }

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/config.ts'],
    format: ['esm'],
    dts,
    clean: true,
    target: 'node22',
    external: ['next', 'next/headers.js'],
  },
  {
    // A Client Component module: Next.js needs the directive at the top of the built file.
    entry: ['src/live-preview.ts'],
    format: ['esm'],
    dts,
    target: 'es2022',
    external: ['react', '@easy-cms/core/live-preview'],
    banner: { js: "'use client'" },
  },
])
