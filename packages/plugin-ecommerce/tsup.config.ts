import { readFileSync } from 'node:fs'
import { defineConfig } from 'tsup'

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/stripe.ts'],
    format: ['esm'],
    // tsup's dts build sets `baseUrl`, which TypeScript 6 deprecates.
    dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
    clean: true,
    target: 'es2022',
    external: ['stripe'],
    // INFO in src/info.ts.
    define: { __PACKAGE_VERSION__: JSON.stringify(version) },
  },
  {
    // For pages: no server code, and React and Vue stay the app's own.
    entry: ['src/client.ts', 'src/react.ts', 'src/vue.ts'],
    format: ['esm'],
    platform: 'browser',
    dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
    target: 'es2022',
    external: ['react', 'vue'],
  },
  {
    // The admin module: one self-contained browser file.
    entry: { admin: 'src/admin.ts' },
    format: ['esm'],
    platform: 'browser',
    target: 'es2022',
    minify: true,
    noExternal: [/.*/],
  },
])
