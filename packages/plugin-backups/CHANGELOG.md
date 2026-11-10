# @easy-cms/plugin-backups

## 1.42.0

### Patch Changes

- Updated dependencies [020e266]
  - @easy-cms/core@1.42.0
  - @easy-cms/storage-s3@1.42.0

## 1.41.0

### Minor Changes

- d50e7b5: `@easy-cms/plugin-backups`: backup destinations connected in Settings → Integrations → Backups (#395). **Google Drive** through a Google Cloud app of your own (keys entered in the admin or `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`), the `drive.file` scope, a folder of its own and resumable uploads; a token Google took back fails at once and says so. **S3-compatible storage** (Cloudflare R2, Backblaze B2, AWS S3, Wasabi) through `@easy-cms/storage-s3`, checked by writing and deleting a small file. Core passes the OAuth app's keys to an integration's `test` and `backups` (`app`), and lists the plugin among the official ones.

### Patch Changes

- Updated dependencies [5390273]
- Updated dependencies [45216de]
- Updated dependencies [51c7646]
- Updated dependencies [d50e7b5]
  - @easy-cms/core@1.41.0
  - @easy-cms/storage-s3@1.41.0
