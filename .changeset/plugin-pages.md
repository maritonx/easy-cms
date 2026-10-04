---
"@easy-cms/core": minor
"@easy-cms/admin": minor
"@easy-cms/plugin-form-builder": minor
---

Plugin pages and dashboard panels.

- **`admin.pages`**: pages of their own at `<admin>/p/<path>`, with a Web Component as the body. The admin draws the header. `group` puts them under Content or Settings in the menu, or leaves them out (`false`).
- **`admin.dashboard`**: panels on the dashboard after the built-in ones, `half` or `full` width.
- **`access: ({ user }) => boolean`** on both is checked on the server; what a user may not see is left out of their admin.
- Admin components now also get `user`, and on pages `route` (`subpath`, `query`). They can send a `navigate` event to open an admin path, e.g. to keep a tab or date range in the address.
- New menu icons: `chart-column` and `chart-line`.
- **Form builder:** a "Form overview" page with submissions per day and per form over 7 or 30 days, and a dashboard panel for the last 7 days. Both read the new `GET <api>/form/stats.json`, which counts days in the editor's time zone.
