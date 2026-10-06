---
"@easy-cms/storage-vercel-blob": patch
---

Without a Blob store (`BLOB_READ_WRITE_TOKEN`), uploads now fail with a message the admin shows (connect a Blob store, then redeploy) instead of an error in the server log, and pages that show images still render. The starter template uses Vercel Blob whenever it runs on Vercel, instead of falling back to the disk, which Vercel doesn't keep.
