# Integrations

**Settings → Integrations** is where a site's admins connect accounts to outside providers: a
Telegram bot, an AI provider, a Facebook Page. Plugins declare the providers; admins connect them
without editing environment variables.


## The page

- **Categories** filter it: Social & messaging, AI, Notifications, Automation, Backups, Email,
  [Sign-in](./sso#in-the-admin), and **Set in code**,
  which shows the email, storage, search, sign-in and payment adapters the config sets (read-only).
- **A card per provider** a plugin added: turn it on or off, connect accounts, **Test** them, make
  one the default, edit or **Disconnect** them. Turned off, plugins can't use it; its accounts stay.
- **Several accounts per provider**, each named (two Facebook Pages, two OpenAI keys); the first is
  the default.
- Official plugins that aren't installed show the `npm install` command: the admin can't install
  packages.
- A connection whose test or last use failed shows on the dashboard under "needs attention".

Admins see the page, and [roles](./roles) given **Integrations**; users limited to part of the site
(a tenant) don't. Connecting, editing, disconnecting and turning a provider on or off go to the
[audit log](./audit-log).

## Secrets

Values marked `secret` are encrypted in the database (AES-256-GCM, with a key derived from
`secret`) and never sent back to the admin, which shows them as `••••1234`. Editing a connection
keeps a secret that isn't typed again.

After [rotating the secret](./security#rotating-the-secret), connections are read with
`previousSecrets` and encrypted again with the new secret when they are used; run
`easy-cms secrets:rotate` to do all of them at once, then remove the old secret. The page says how
many still use it.

An **environment variable** named in `env` wins over the admin. When every field is set there,
the provider has an "Environment" connection that can't be changed in the admin.

## Declaring an integration

Plugins add theirs to `integrations` (a site can too):

```ts
import { definePlugin } from '@easy-cms/core'

export const telegramPlugin = () =>
  definePlugin((config) => ({
    ...config,
    integrations: [
      ...(config.integrations ?? []),
      {
        id: 'telegram',
        label: 'Telegram',
        category: 'notifications',
        plugin: '@acme/easy-cms-telegram',
        docs: 'https://example.com/guide',
        kind: 'fields',
        fields: [
          { name: 'botToken', label: 'Bot token', secret: true, required: true },
          { name: 'chatId', label: 'Chat ID', required: true },
        ],
        env: { botToken: 'TELEGRAM_BOT_TOKEN' },
        // Checks the values without posting; connecting runs it first.
        test: async ({ botToken }) => {
          const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`)
          const body = await res.json()
          return body.ok ? { ok: true, account: body.result.username } : { ok: false, message: body.description }
        },
      },
    ],
  }))
```

The plugin reads the connection on the server, and says how it went:

```ts
const telegram = await cms.integrations.get('telegram') // the default; { name } for another
if (telegram) {
  try {
    await send(telegram.values.botToken, telegram.values.chatId, text)
    await cms.integrations.markUsed('telegram')
  } catch (error) {
    await cms.integrations.markError('telegram', String(error)) // shows on the card and the dashboard
  }
}
```

`get` returns `null` when nothing is connected or the provider is turned off.
`cms.integrations.all('telegram')` returns every connection (the environment's first), e.g. to
send to each chat.

### Finding a value, ticking options

A field with `lookup` has a **Find** button beside it: Easy CMS runs `lookup` with the values typed
so far (editing a connection, its stored secrets for the ones left empty) and the admin picks one
of the choices, e.g. the chats a bot was written to. A `multiselect` field is a set of checkboxes,
kept as `a,b,c`:

```ts
fields: [
  { name: 'botToken', label: 'Bot token', secret: true, required: true },
  {
    name: 'chatId',
    label: 'Chat ID',
    lookup: async ({ botToken }) => (await chatsOf(botToken)).map((c) => ({ value: String(c.id), label: c.title })),
  },
  { name: 'events', type: 'multiselect', options: [{ value: 'order.created', label: 'New orders' }, 'form.submitted'] },
]
```

An error thrown by `lookup` shows under the field. At most 100 choices are shown.

### OAuth

`kind: 'oauth'` has a **Connect** button instead of fields. Easy CMS signs a `state` (valid 10
minutes) and sends the admin to `authorizeUrl`; the provider comes back to
`<api>/admin/integrations/<id>/callback`, and `exchange` turns the code into values. With several
accounts (a user's Pages), the admin chooses one:

```ts
{
  id: 'facebook-page',
  label: 'Facebook Page',
  category: 'social',
  kind: 'oauth',
  oauth: {
    authorizeUrl: ({ redirectUri, state }) =>
      `https://www.facebook.com/v21.0/dialog/oauth?client_id=${process.env.META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=pages_manage_posts`,
    exchange: async ({ code, redirectUri }) => {
      const pages = await pagesFor(code, redirectUri) // the provider's API
      return { accounts: pages.map((p) => ({ id: p.id, name: p.name, values: { token: p.access_token } })) }
    },
  },
}
```

Everything `exchange` returns is encrypted. The app's own id and secret stay in environment
variables.

### Consent

`consent: { text, policy? }` is shown before the first connection, e.g. that text sent to an AI
provider leaves the site: an admin accepts it once (**Accept and connect**), and who did goes to the
audit log. Connecting before that is refused. `test` gets the connection's `name` too.

### Logo

`icon` is the provider's logo on its row and in its drawer: SVG paths, e.g. from
[simple-icons](https://simpleicons.org) (CC0), or the name of an admin icon (`'globe'`). Without
one, its first letter shows.

```ts
import { siTelegram } from 'simple-icons' // a devDependency: the bundler keeps only this icon

icon: { paths: [{ d: siTelegram.path }], color: `#${siTelegram.hex}` }
```

A path without `fill` takes `color`, or the text color where the brand's wouldn't show (a black logo
in dark mode); `viewBox` defaults to `0 0 24 24`. Only path data and `#rrggbb` colors are accepted:
the admin draws nothing else. Logos are trademarks of their owners, shown to name their services; the
official plugins' come from simple-icons and, for OpenAI, Iconify's `logos` set (both CC0).

## Next steps

- [Plugins](./plugins): writing one.
- [Security](./security): the secret and rotating it.
