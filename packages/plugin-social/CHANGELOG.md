# @easy-cms/plugin-social

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
