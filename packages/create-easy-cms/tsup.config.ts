import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/bin.ts', 'src/studio-link.ts'],
  format: ['esm'],
  // tsup's dts build sets `baseUrl`, which TypeScript 6 deprecates.
  dts: {
    entry: ['src/index.ts', 'src/studio-link.ts'],
    compilerOptions: { ignoreDeprecations: '6.0' },
  },
  clean: true,
  target: 'node22',
})
