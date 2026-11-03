# @easy-cms/plugin-notify

Notifications for Easy CMS admins: a Telegram message when a form is sent, an order comes in, or something fails (scheduled publishing, webhooks and email, backups, integrations). Admins connect the chat on the Integrations page. Part of [Easy CMS](https://github.com/maritonx/easy-cms), the embedded, code-first headless CMS for Nuxt and Next.js.

## Install

```bash
npm install @easy-cms/plugin-notify
```

Or `pnpm add`, `yarn add` or `bun add`.

## Usage

```ts
import { notifyPlugin } from '@easy-cms/plugin-notify'

export default defineConfig({
  serverURL: 'https://example.com', // for links to the admin
  // …
  plugins: [notifyPlugin()],
})
```

Then create a migration (`easy-cms migrate:create notify`), and in the admin go to **Settings → Integrations → Telegram**: paste the bot token from @BotFather, press **Find Chat ID**, and choose the events.

## Links

[Notifications](https://easycms.dev/docs/notifications) · [Documentation](https://easycms.dev/docs) ([ภาษาไทย](https://easycms.dev/th/docs)) · [GitHub](https://github.com/maritonx/easy-cms)

MIT License
