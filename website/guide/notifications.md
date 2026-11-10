# Notifications

::: info What you'll learn
Tell the site's admins in a Telegram chat when a form is sent, an order comes in, or something
fails.

**Before this page:** [Integrations](./integrations).
:::

`@easy-cms/plugin-notify` sends a short message to a chat for the events admins choose, with a
link to the page in the admin. Telegram comes first; the plugin is built for more channels (LINE,
Slack, Discord) later.

```bash [pm]
npm install @easy-cms/plugin-notify
```

```ts
import { notifyPlugin } from '@easy-cms/plugin-notify'

export default defineConfig({
  serverURL: 'https://example.com', // for the links to the admin
  // …
  plugins: [notifyPlugin()],
})
```

The plugin adds a `notify-messages` collection (its queue, kept out of the admin) and a job: create
a migration for them (`easy-cms migrate:create notify`, see [Migrations](./deployment)). Jobs must
run, in a server or with a cron ([Jobs](./jobs)).

## Connecting Telegram

1. In Telegram, talk to **@BotFather**: `/newbot`, then copy the token it gives.
2. Write to your new bot, or add it to the group that should get the messages.
3. In the admin, **Settings → Integrations → Telegram → Connect an account**: paste the **Bot
   token**, press **Find Chat ID** and choose the chat.
4. Choose the **Language** of the messages (empty: the admin's language) and the **Events** (none
   ticked: all), then **Save**. Easy CMS sends a test message to the chat; **Test** sends another.

Several chats can be connected (the shop team for orders, the developers for failures); each gets
the events ticked on it. `TELEGRAM_BOT_TOKEN` in the environment wins over the token typed in the
admin.

## Events

| Event | The message says |
|---|---|
| `form.submitted` | The form's name and who sent it, from the [form builder](./forms). Not the answers: they can be personal, so read them in the admin. |
| `order.created` | The order number, total and email, from the [shop](./ecommerce) |
| `scheduled.failed` | Which document failed to publish or unpublish on time, and why |
| `delivery.failed` | A webhook or an email given up on after its retries |
| `backup.failed` | Why a [backup](./backups) failed |
| `integration.failed` | A connection that stopped working (not the notification channels themselves) |
| `social.failed` | A [social post](./social)'s channel given up on, and why |
| `email.bounced`, `email.complained` | An email that bounced for good or was reported as spam, from an [email provider's webhook](./email#delivery-events). Only to chats that tick them. |

These are the [failure events](./webhooks#when-something-fails) webhooks can get too.

## Delivery

Messages are sent at once. One that fails is tried again after 1, 5 and 30 minutes by the
`notify:send` job; after that it is given up on and the connection shows the error on the
Integrations page and the dashboard. A wrong token or a chat the bot left isn't retried.

A connection sends at most 60 messages an hour (`limit`); the ones over it are counted and the chat
gets one message saying how many, once the hour allows. Sent messages are kept for 7 days.

## Options

| Option | Default | |
|---|---|---|
| `channels` | `[telegram]` | Where messages go. |
| `limit` | `60` | Messages a connection sends an hour, at most. |
| `slug` | `notify-messages` | The queue's collection. |

## Next steps

- [Integrations](./integrations): connections, secrets and the dashboard.
- [Webhooks](./webhooks#listening-on-the-server): `cms.on` and `listeners`, for events of your own.
