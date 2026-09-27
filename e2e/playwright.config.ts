import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

// Fresh databases per run, so the first-admin flow is always available.
const scratch = mkdtempSync(join(tmpdir(), 'easy-cms-e2e-'))
const SECRET = 'e2e-secret-e2e-secret-e2e-secret-e2e'
const browser = {
  ...devices['Desktop Chrome'],
  // Locally use the installed Chrome; CI installs Playwright's Chromium.
  ...(process.env.CI ? {} : { channel: 'chrome' as const }),
}

/** Where the standalone example's frontend is served; the suite uses it as that app's public site. */
const FRONTEND = 'http://localhost:3103'

/**
 * The same admin suite runs against both adapters and the standalone server (FR-ADP-03): Nuxt in
 * development, Next.js as a production build, standalone as `easy-cms serve`.
 */
const apps = [
  {
    name: 'nuxt',
    port: 3100,
    command: 'pnpm --dir ../examples/nuxt-blog exec nuxi dev --port 3100',
  },
  {
    name: 'next',
    port: 3101,
    // A production build: `next dev` compiles routes on demand and reloads pages mid-test, which
    // aborted navigations in CI. Production also verifies the migrations, so apply them first.
    command:
      'pnpm --dir ../examples/next-blog exec next build && pnpm --dir ../examples/next-blog exec easy-cms migrate && pnpm --dir ../examples/next-blog exec next start --port 3101',
  },
  {
    name: 'standalone',
    port: 3102,
    command: 'pnpm --dir ../examples/standalone exec easy-cms serve --port 3102',
  },
] as const

export default defineConfig({
  testDir: 'tests',
  // Compile each dev server's routes before the first test.
  globalSetup: './global-setup.ts',
  // Tests build on each other's data within an app.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: apps.map((app) => ({
    name: app.name,
    use: { ...browser, baseURL: `http://localhost:${app.port}` },
  })),
  webServer: [
    ...apps.map((app) => ({
      name: app.name,
      command: app.command,
      url: `http://localhost:${app.port}/api/cms/users/init`,
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        EASY_CMS_SECRET: SECRET,
        // Nuxt and standalone examples: SQLite. Next example: Postgres via PGlite.
        DATABASE_URL: app.name === 'next' ? '' : `file:${join(scratch, `${app.name}.db`)}`,
        PGLITE_DIR: join(scratch, 'next-pglite'),
        NUXT_TELEMETRY_DISABLED: '1',
        NEXT_TELEMETRY_DISABLED: '1',
        CORS_ORIGINS: FRONTEND,
        // Standalone example: live preview opens the frontend, which calls this server.
        FRONTEND_URL: FRONTEND,
        CMS_URL: `http://localhost:${app.port}`,
      },
    })),
    // The standalone example's frontend, on its own origin.
    {
      name: 'frontend',
      command: `node static-server.ts ../examples/standalone/frontend ${new URL(FRONTEND).port}`,
      url: FRONTEND,
      reuseExistingServer: false,
    },
  ],
})
