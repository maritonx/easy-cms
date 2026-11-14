# @easy-cms/plugin-backups

## 1.48.0

### Patch Changes

- Updated dependencies [4b8f02c]
  - @easy-cms/core@1.48.0
  - @easy-cms/storage-s3@1.48.0

## 1.47.0

### Patch Changes

- Updated dependencies [9e23a9e]
  - @easy-cms/core@1.47.0
  - @easy-cms/storage-s3@1.47.0

## 1.46.1

### Patch Changes

- @easy-cms/core@1.46.1
  - @easy-cms/storage-s3@1.46.1

## 1.46.0

### Patch Changes

- Updated dependencies [04e00e5]
  - @easy-cms/core@1.46.0
  - @easy-cms/storage-s3@1.46.0

## 1.45.0

### Patch Changes

- @easy-cms/core@1.45.0
  - @easy-cms/storage-s3@1.45.0

## 1.44.0

### Patch Changes

- Updated dependencies [b765b61]
- Updated dependencies [fb5f6e9]
  - @easy-cms/core@1.44.0
  - @easy-cms/storage-s3@1.44.0

## 1.43.1

### Patch Changes

- @easy-cms/core@1.43.1
  - @easy-cms/storage-s3@1.43.1

## 1.43.0

### Patch Changes

- b1f8284: Sign-in providers turned on in the admin (ADR-0066). `signInPlugin()` from `@easy-cms/auth-oauth` adds Google, Microsoft, GitHub and OpenID Connect to Settings → Integrations → Sign-in: an admin enters the app's keys, copies the redirect URL, tests a sign-in at the provider (nobody is signed in by it), then uses it for sign-in. The config's `auth.providers` stay the default; an admin can turn them off, and a connection with the same id takes a provider's place. `auth.locked: true` keeps sign-in as the code sets it. A change after which no admin could sign in is refused, and `easy-cms reset-sign-in` goes back to the config's providers. Turning a provider off signs out the people who used it: sessions record how they started (`password` or a provider's id). Integrations with the same `app.shared` keep one set of app keys, so Google Drive backups and signing in with Google use one Google Cloud app. `cms.signIn` lists the providers signing people in now.
  
  Needs a migration: a `method` column on `sessions` (see Upgrading → 1.43).
- Updated dependencies [b1f8284]
  - @easy-cms/core@1.43.0
  - @easy-cms/storage-s3@1.43.0

## 1.42.1

### Patch Changes

- Updated dependencies [eede511]
  - @easy-cms/core@1.42.1
  - @easy-cms/storage-s3@1.42.1

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
