---
"@easy-cms/plugin-backups": minor
"@easy-cms/core": patch
---

`@easy-cms/plugin-backups`: backup destinations connected in Settings → Integrations → Backups (#395). **Google Drive** through a Google Cloud app of your own (keys entered in the admin or `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`), the `drive.file` scope, a folder of its own and resumable uploads; a token Google took back fails at once and says so. **S3-compatible storage** (Cloudflare R2, Backblaze B2, AWS S3, Wasabi) through `@easy-cms/storage-s3`, checked by writing and deleting a small file. Core passes the OAuth app's keys to an integration's `test` and `backups` (`app`), and lists the plugin among the official ones.
