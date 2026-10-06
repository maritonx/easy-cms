---
"@easy-cms/core": minor
"@easy-cms/admin": minor
"@easy-cms/storage-vercel-blob": minor
"@easy-cms/storage-netlify-blobs": minor
---

One-click deploy to Vercel and Netlify, and a setup code for the first admin.

- **Deploy buttons** (README, docs): a Next.js blog with its admin, from `templates/next-starter`, with a Neon Postgres database and file storage made by the platform, and sample posts. The only thing to fill in is a setup code.
- **`auth.setupCode`** (default: the `EASY_CMS_SETUP_CODE` environment variable): creating the first admin needs this code, so nobody else can claim a freshly deployed site. Wrong codes are rate-limited. `GET <api>/users/init` says whether it is asked (`setupCode`), and the admin's setup page asks for it.
- **New package `@easy-cms/storage-vercel-blob`:** `vercelBlobStorage()` keeps uploads in Vercel Blob (`BLOB_READ_WRITE_TOKEN`), public on the CDN, or private behind the API (`access: 'private'`, e.g. for backups).
- **New package `@easy-cms/storage-netlify-blobs`:** `netlifyBlobsStorage()` keeps uploads in Netlify Blobs, served through the API.
