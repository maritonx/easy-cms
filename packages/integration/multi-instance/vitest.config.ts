import { defineConfig } from 'vitest/config'

// Not part of `vitest run`: needs Postgres and an S3 server (CI's multi-instance job).
export default defineConfig({
  test: {
    root: import.meta.dirname,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // Read by easy-cms.config.ts, in the test and in the instances it starts.
    env: {
      EASY_CMS_SECRET: 'multi-instance-test-secret-0123456789abcdef',
      CRON_SECRET: 'multi-instance-cron-secret-0123456789abcdef',
      S3_TEST_BUCKET: `ecms-multi-${Date.now()}`,
    },
  },
})
