# @easy-cms/plugin-social

Social posts for Easy CMS (experimental): write a post once and send it to several channels, each with its own text, now or at a time, with retries and a state per channel. Channels are accounts connected on the Integrations page; the first is a webhook to a Make, n8n or Zapier scenario. Part of [Easy CMS](https://github.com/maritonx/easy-cms), the embedded, code-first headless CMS for Nuxt and Next.js.

## Install

```bash
npm install @easy-cms/plugin-social
```

Or `pnpm add`, `yarn add` or `bun add`.

## Usage

```ts
import { socialPlugin } from '@easy-cms/plugin-social'

export default defineConfig({
  serverURL: 'https://example.com',
  // …
  plugins: [
    socialPlugin({
      collections: ['posts'],
      url: ({ doc }) => `https://example.com/posts/${doc.slug}`,
    }),
  ],
})
```

Then create a migration (`easy-cms migrate:create social`), connect a webhook in **Settings → Integrations → Webhook (social)**, and press **Share on social media** on a post.

## Links

[Social posts](https://easycms.dev/docs/social) · [Documentation](https://easycms.dev/docs) ([ภาษาไทย](https://easycms.dev/th/docs)) · [GitHub](https://github.com/maritonx/easy-cms)

MIT License
