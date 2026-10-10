# @easy-cms/storage-vercel-blob

## 0.66.1

### Patch Changes

- @easy-cms/core@0.66.1

## 0.66.0

### Patch Changes

- Updated dependencies [b5390b6]
  - @easy-cms/core@0.66.0

## 0.65.0

### Patch Changes

- Updated dependencies [eb1dd41]
  - @easy-cms/core@0.65.0

## 0.64.0

### Patch Changes

- Updated dependencies [42b3c86]
  - @easy-cms/core@0.64.0

## 0.63.0

### Patch Changes

- Updated dependencies [1ea78b2]
  - @easy-cms/core@0.63.0

## 0.62.0

### Patch Changes

- Updated dependencies [3530913]
  - @easy-cms/core@0.62.0

## 0.61.0

### Patch Changes

- Updated dependencies [3a8422c]
  - @easy-cms/core@0.61.0

## 0.60.0

The same code as 0.49.0, released as 0.60.0 to match the [roadmap](https://github.com/maritonx/easy-cms/blob/main/docs/ROADMAP.md):
the names and shapes for 1.0. See the [upgrade guide](https://easy-cms-website.vercel.app/docs/upgrading).

## 0.49.0

### Patch Changes

- Updated dependencies [ee496b4]
  - @easy-cms/core@0.49.0

## 0.48.0

### Patch Changes

- Updated dependencies [db47c50]
  - @easy-cms/core@0.48.0

## 0.47.4

### Patch Changes

- Updated dependencies [76e22e3]
  - @easy-cms/core@0.47.4

## 0.47.3

### Patch Changes

- @easy-cms/core@0.47.3

## 0.47.2

### Patch Changes

- Updated dependencies [43833ab]
  - @easy-cms/core@0.47.2

## 0.47.1

### Patch Changes

- @easy-cms/core@0.47.1

## 0.47.0

### Patch Changes

- Updated dependencies [203e359]
  - @easy-cms/core@0.47.0

## 0.46.0

### Patch Changes

- Updated dependencies [6938928]
  - @easy-cms/core@0.46.0

## 0.45.0

### Patch Changes

- Updated dependencies [56a926b]
  - @easy-cms/core@0.45.0

## 0.44.0

### Patch Changes

- Updated dependencies [40bd4bc]
  - @easy-cms/core@0.44.0

## 0.43.0

### Patch Changes

- @easy-cms/core@0.43.0

## 0.42.0

### Patch Changes

- Updated dependencies [4afac22]
  - @easy-cms/core@0.42.0

## 0.41.0

### Minor Changes

- 7a43c55: Large files straight to the storage: with S3 (R2, MinIO) or Vercel Blob, the admin sends files over 4 MB from the browser to the storage (`POST <api>/media/uploads` for a signed ticket and a presigned URL or client token, then `/media/uploads/complete`), past hosts' request limits (about 4.5 MB on Vercel); the server still checks each file's size and type from its contents, and deletes what fails. Storage adapters can add `uploadURL()` and `getStart()`. `cms.createUpload()` and `cms.completeUpload()` do the same from code. Making a media folder private or public (moving or deleting it) now refuses to move more than 200 files at once.

### Patch Changes

- Updated dependencies [7a43c55]
  - @easy-cms/core@0.41.0

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
