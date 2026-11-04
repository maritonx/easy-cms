# @easy-cms/plugin-notify

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
