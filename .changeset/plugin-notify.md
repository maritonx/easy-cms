---
"@easy-cms/plugin-notify": minor
"@easy-cms/core": minor
"@easy-cms/admin": minor
"@easy-cms/plugin-form-builder": minor
---

Notifications for admins (#356). The new `@easy-cms/plugin-notify` sends a Telegram message when a form is sent, an order comes in, or something fails, with a link to the admin. Admins connect the chat in Settings → Integrations: paste the bot token, press **Find Chat ID**, choose the language and the events. Failed messages are retried after 1, 5 and 30 minutes; a connection sends at most 60 an hour.

Core:

- `cms.on(event, handler)` and the `listeners` config run code after events on the server: content changes, `cms.emit()` events and the new failure events.
- Failure events `scheduled.failed`, `delivery.failed` (a webhook or email given up on), `backup.failed` and `integration.failed` go to webhooks that list them and to listeners.
- Integrations: `lookup` on a field adds a **Find** button with choices from the provider, `multiselect` fields are checkboxes, and `cms.integrations.all(id)` returns every connection.

The form builder sends `form.submitted` (the form and who sent it) for webhooks and notifications.
