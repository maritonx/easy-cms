# @easy-cms/plugin-social

## 1.43.1

### Patch Changes

- @easy-cms/core@1.43.1

## 1.43.0

### Patch Changes

- Updated dependencies [b1f8284]
  - @easy-cms/core@1.43.0

## 1.42.1

### Patch Changes

- Updated dependencies [eede511]
  - @easy-cms/core@1.42.1

## 1.42.0

### Patch Changes

- Updated dependencies [020e266]
  - @easy-cms/core@1.42.0

## 1.41.0

### Patch Changes

- 5390273: Backups set up in the admin, and sent to destinations (#395). Settings → Backups now changes when backups run, how many to keep and where they go (what the config sets wins): this server, and destinations that plugins add through Integrations (`backups` on an integration: `put`, `get`, `delete`), each with its own number to keep. A destination that fails is tried again after 1, 5 and 30 minutes, then `backup.failed`; downloads come from any place that has the file; the page warns while backups leave the server unencrypted. OAuth integrations take their app's keys (client id and secret) in the admin, with the redirect URI to copy; environment variables still win, and the Facebook Page channel uses it. Turso and other remote libSQL databases are backed up by copying them into a local SQLite file.
  
  Needs a migration: a new `admin-settings` table and a `copies` column on `database-backups` (see Upgrading → 1.41).
- Updated dependencies [5390273]
- Updated dependencies [45216de]
- Updated dependencies [51c7646]
- Updated dependencies [d50e7b5]
  - @easy-cms/core@1.41.0

## 1.40.0

### Patch Changes

- Updated dependencies [1c56981]
  - @easy-cms/core@1.40.0

## 1.39.1

### Patch Changes

- Updated dependencies [2f7e8f6]
  - @easy-cms/core@1.39.1

## 1.39.0

### Minor Changes

- 7b3564f: An X channel (#380): connect your X account with your own X app's keys (OAuth 1.0a, keys that don't expire) and post the text with its link. The admin's counter and Write with AI count X's way (a link 23, an emoji 2), and the panel shows what the post costs on X's pay-per-use API before posting. The built-in channels (`facebook`, `line`, `x`) are exported for sites that set `channels` themselves.

### Patch Changes

- @easy-cms/core@1.39.0

## 1.38.0

### Minor Changes

- 1f9de9c: Facebook Page and LINE OA channels (#313). Connect Pages you manage through your Meta app (`META_APP_ID`, `META_APP_SECRET`) and post photos or links to them; connect a LINE Official Account with its channel access token and broadcast each post as a card, with the friends it reaches and the month's message quota shown before posting.

### Patch Changes

- @easy-cms/core@1.38.0

## 1.37.0

### Minor Changes

- 0aa6dd4: Write social posts with AI (#312). With `@easy-cms/plugin-ai`, a social post's text and each channel's text have **Write with AI**: written from the shared document (or the post's title), within the channel's length, in the default language, into the field for review with Undo; replacing text asks first. It is the `social` AI feature, for users who may change the post.

### Patch Changes

- @easy-cms/core@1.37.0

## 1.36.0

### Minor Changes

- d5bdd31: Social posts (#312). The new `@easy-cms/plugin-social` (experimental) adds Social posts to Content: a text, a link, an image and the channels it goes to, each with its own text if needed. Channels are connections on the Integrations page; the first is a signed webhook to a Make, n8n or Zapier scenario. **Share on social media** on a document writes a post from it; the Posting panel posts now or at a time, each channel on its own with retries after 1, 5 and 30 minutes and Retry, says up front what would stop it (an image channels can't fetch, an unpublished source), and links to each post. Posting needs `publish` on the collection, a right of its own in Settings → Roles. Projects with the plugin get a new `social-posts` table: run `easy-cms migrate:create`.
  
  Core: `admin.permissions: ['publish']` lets roles be given `publish` on a collection without drafts. The notify plugin tells about `social.failed`.

### Patch Changes

- Updated dependencies [d5bdd31]
  - @easy-cms/core@1.36.0
