import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// graphql 16 and 17 are both in the range the plugin accepts: the tests run with each.
const graphql16 = fileURLToPath(new URL('./node_modules/graphql-16', import.meta.url))

export default defineConfig({
  test: {
    testTimeout: 90_000,
    hookTimeout: 90_000,
    projects: [
      { extends: true, test: { name: 'graphql-17', env: { GRAPHQL_MAJOR: '17' } } },
      {
        extends: true,
        test: { name: 'graphql-16', env: { GRAPHQL_MAJOR: '16' } },
        resolve: { alias: [{ find: /^graphql(?=\/|$)/, replacement: graphql16 }] },
      },
    ],
  },
})
