# @easy-cms/plugin-notify

## 1.40.0

### Patch Changes

- Updated dependencies [1c56981]
  - @easy-cms/core@1.40.0

## 1.39.1

### Patch Changes

- Updated dependencies [2f7e8f6]
  - @easy-cms/core@1.39.1

## 1.39.0

### Patch Changes

- @easy-cms/core@1.39.0

## 1.38.0

### Patch Changes

- @easy-cms/core@1.38.0

## 1.37.0

### Patch Changes

- @easy-cms/core@1.37.0

## 1.36.0

### Minor Changes

- d5bdd31: Social posts (#312). The new `@easy-cms/plugin-social` (experimental) adds Social posts to Content: a text, a link, an image and the channels it goes to, each with its own text if needed. Channels are connections on the Integrations page; the first is a signed webhook to a Make, n8n or Zapier scenario. **Share on social media** on a document writes a post from it; the Posting panel posts now or at a time, each channel on its own with retries after 1, 5 and 30 minutes and Retry, says up front what would stop it (an image channels can't fetch, an unpublished source), and links to each post. Posting needs `publish` on the collection, a right of its own in Settings → Roles. Projects with the plugin get a new `social-posts` table: run `easy-cms migrate:create`.
  
  Core: `admin.permissions: ['publish']` lets roles be given `publish` on a collection without drafts. The notify plugin tells about `social.failed`.

### Patch Changes

- Updated dependencies [d5bdd31]
  - @easy-cms/core@1.36.0

## 1.35.1

### Patch Changes

- @easy-cms/core@1.35.1

## 1.35.0

### Patch Changes

- Updated dependencies [1b9b334]
- Updated dependencies [512a515]
  - @easy-cms/core@1.35.0

## 1.34.0

### Patch Changes

- Updated dependencies [a0a323f]
  - @easy-cms/core@1.34.0

## 1.33.0

### Minor Changes

- 69417d3: Real logos on the Integrations page. An integration's `icon` can be its logo: SVG `paths` (e.g. from simple-icons) with a brand `color`, which the admin swaps for the text color where it wouldn't show (a black logo in dark mode); only path data and `#rrggbb` colors are accepted. Telegram, Anthropic, Gemini and OpenAI now show theirs (simple-icons and Iconify's `logos`, both CC0, bundled at build time).

### Patch Changes

- Updated dependencies [69417d3]
- Updated dependencies [6098969]
  - @easy-cms/core@1.33.0

## 1.32.0

### Minor Changes

- 4e7b5ac: Notifications for admins (#356). The new `@easy-cms/plugin-notify` sends a Telegram message when a form is sent, an order comes in, or something fails, with a link to the admin. Admins connect the chat in Settings → Integrations: paste the bot token, press **Find Chat ID**, choose the language and the events. Failed messages are retried after 1, 5 and 30 minutes; a connection sends at most 60 an hour.
  
  Core:
  
  - `cms.on(event, handler)` and the `listeners` config run code after events on the server: content changes, `cms.emit()` events and the new failure events.
  - Failure events `scheduled.failed`, `delivery.failed` (a webhook or email given up on), `backup.failed` and `integration.failed` go to webhooks that list them and to listeners.
  - Integrations: `lookup` on a field adds a **Find** button with choices from the provider, `multiselect` fields are checkboxes, and `cms.integrations.all(id)` returns every connection.
  
  The form builder sends `form.submitted` (the form and who sent it) for webhooks and notifications.

### Patch Changes

- Updated dependencies [b87b819]
- Updated dependencies [4e7b5ac]
  - @easy-cms/core@1.32.0
