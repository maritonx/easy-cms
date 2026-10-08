---
'@easy-cms/core': minor
'@easy-cms/admin': minor
'@easy-cms/storage-s3': minor
'@easy-cms/storage-vercel-blob': minor
---

Large files straight to the storage: with S3 (R2, MinIO) or Vercel Blob, the admin sends files over 4 MB from the browser to the storage (`POST <api>/media/uploads` for a signed ticket and a presigned URL or client token, then `/media/uploads/complete`), past hosts' request limits (about 4.5 MB on Vercel); the server still checks each file's size and type from its contents, and deletes what fails. Storage adapters can add `uploadURL()` and `getStart()`. `cms.createUpload()` and `cms.completeUpload()` do the same from code. Making a media folder private or public (moving or deleting it) now refuses to move more than 200 files at once.
