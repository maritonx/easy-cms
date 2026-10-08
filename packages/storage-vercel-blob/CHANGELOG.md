# @easy-cms/storage-vercel-blob

## 0.40.0

### Patch Changes

- Updated dependencies [e24dbd1]
  - @easy-cms/core@0.40.0

## 0.39.0

### Patch Changes

- Updated dependencies [72758f0]
  - @easy-cms/core@0.39.0

## 0.38.0

### Patch Changes

- Updated dependencies [5a71c12]
  - @easy-cms/core@0.38.0

## 0.37.2

### Patch Changes

- Updated dependencies [63f0116]
  - @easy-cms/core@0.37.2

## 0.37.1

### Patch Changes

- e319e04: Without a Blob store (`BLOB_READ_WRITE_TOKEN`), uploads now fail with a message the admin shows (connect a Blob store, then redeploy) instead of an error in the server log, and pages that show images still render. The starter template uses Vercel Blob whenever it runs on Vercel, instead of falling back to the disk, which Vercel doesn't keep.
- @easy-cms/core@0.37.1

## 0.37.0

### Minor Changes

- cbf800c: One-click deploy to Vercel and Netlify, and a setup code for the first admin.
  
  - **Deploy buttons** (README, docs): a Next.js blog with its admin, from `templates/next-starter`, with a Neon Postgres database and file storage made by the platform, and sample posts. The only thing to fill in is a setup code.
  - **`auth.setupCode`** (default: the `EASY_CMS_SETUP_CODE` environment variable): creating the first admin needs this code, so nobody else can claim a freshly deployed site. Wrong codes are rate-limited. `GET <api>/users/init` says whether it is asked (`setupCode`), and the admin's setup page asks for it.
  - **New package `@easy-cms/storage-vercel-blob`:** `vercelBlobStorage()` keeps uploads in Vercel Blob (`BLOB_READ_WRITE_TOKEN`), public on the CDN, or private behind the API (`access: 'private'`, e.g. for backups).
  - **New package `@easy-cms/storage-netlify-blobs`:** `netlifyBlobsStorage()` keeps uploads in Netlify Blobs, served through the API.

### Patch Changes

- Updated dependencies [cbf800c]
  - @easy-cms/core@0.37.0
