// Run by `easy-cms serve` as two instances against one Postgres and one S3 bucket (CI's
// multi-instance job), as the reference architecture describes (ADR-0051).
import { defineConfig } from '@easy-cms/core'
import { postgres } from '@easy-cms/db-postgres'
import { s3Storage } from '@easy-cms/storage-s3'

const env = (name: string) => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

export default defineConfig({
  secret: env('EASY_CMS_SECRET'),
  cronSecret: env('CRON_SECRET'),
  db: postgres({ url: env('POSTGRES_URL'), max: 5 }),
  upload: {
    storage: s3Storage({
      bucket: env('S3_TEST_BUCKET'),
      endpoint: env('S3_TEST_ENDPOINT'),
      region: 'us-east-1',
      accessKeyId: env('S3_TEST_ACCESS_KEY'),
      secretAccessKey: env('S3_TEST_SECRET_KEY'),
    }),
  },
  collections: [
    {
      slug: 'posts',
      drafts: true,
      schedule: true,
      access: { read: () => true },
      fields: [{ name: 'title', type: 'text' }],
    },
    // One document per run of the job below.
    { slug: 'runs', fields: [{ name: 'at', type: 'text' }] },
  ],
  jobs: [
    {
      name: 'test:count-runs',
      every: 3600,
      run: async ({ cms, now }) => {
        await cms.create('runs', { at: now.toISOString() })
      },
    },
  ],
})
