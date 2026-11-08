# @easy-cms/plugin-social

## 1.36.0

### Minor Changes

- d5bdd31: Social posts (#312). The new `@easy-cms/plugin-social` (experimental) adds Social posts to Content: a text, a link, an image and the channels it goes to, each with its own text if needed. Channels are connections on the Integrations page; the first is a signed webhook to a Make, n8n or Zapier scenario. **Share on social media** on a document writes a post from it; the Posting panel posts now or at a time, each channel on its own with retries after 1, 5 and 30 minutes and Retry, says up front what would stop it (an image channels can't fetch, an unpublished source), and links to each post. Posting needs `publish` on the collection, a right of its own in Settings → Roles. Projects with the plugin get a new `social-posts` table: run `easy-cms migrate:create`.
  
  Core: `admin.permissions: ['publish']` lets roles be given `publish` on a collection without drafts. The notify plugin tells about `social.failed`.

### Patch Changes

- Updated dependencies [d5bdd31]
  - @easy-cms/core@1.36.0
