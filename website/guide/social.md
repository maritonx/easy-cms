# Social posts

::: info What you'll learn
Write a post once and send it to several channels, each with its own text, now or at a time, and
see how each one went.

**Before this page:** [Integrations](./integrations).
:::

`@easy-cms/plugin-social` (experimental) adds **Social posts** to Content. A post has a text, a link,
an image and the channels it goes to; each channel can have its own text. Channels are accounts
connected in **Settings → Integrations**: the first is a **webhook**, a URL that gets each post as
signed JSON, such as a Make, n8n or Zapier scenario that posts to X, LinkedIn or anywhere else.
Facebook Pages and LINE follow.

```bash [pm]
npm install @easy-cms/plugin-social
```

```ts
import { socialPlugin } from '@easy-cms/plugin-social'

export default defineConfig({
  serverURL: 'https://example.com', // channels fetch images from public URLs
  // …
  plugins: [
    socialPlugin({
      collections: ['posts'], // their edit page has Share
      url: ({ doc }) => `https://example.com/posts/${doc.slug}`, // the post's link
    }),
  ],
})
```

The plugin adds a `social-posts` collection: create a migration for it (`easy-cms migrate:create
social`, see [Migrations](./deployment)). Jobs must run to send scheduled posts and retries
([Jobs](./jobs)).

## Connecting a webhook

**Settings → Integrations → Social & messaging → Webhook (social) → Connect**: name it (e.g. "Make
→ X"), paste the scenario's URL and, to sign posts, a secret. Connecting sends `{ "test": true }`,
which the scenario can ignore. Each connection is one channel.

Each post arrives as:

```json
{
  "post": 12,
  "channel": "social-webhook:Make → X",
  "text": "Our new guide is out",
  "link": "https://example.com/posts/guide",
  "image": { "url": "https://example.com/api/cms/media/file/guide.png", "alt": "The cover" },
  "source": { "collection": "posts", "id": 7 }
}
```

with `x-easy-cms-signature-v2` and `x-easy-cms-timestamp`, as Easy CMS's [webhooks](./webhooks#checking-the-signature)
sign theirs, so `verifyWebhook(body, headers, secret)` checks it. A `2xx` answer means posted; when it
says `{ "url": "…" }`, the post links to it.

## Writing and sharing

**Share on social media** on a document's edit page (collections in `collections`) writes a social
post from it: its title, its first textarea (an excerpt), `url`, its first image, and every connected
channel. `share: ({ doc, collection }) => ({ title, text, link, image })` fills it your way. Remove the
channels it shouldn't go to; a channel's own text replaces the post's text there.

## Posting

The **Posting** panel beside the post shows each channel: not posted, scheduled, sending, posted (with
a link to the post) or failed (with the reason). It posts what is saved.

- **Post now** sends at once; **Schedule** sends at a time.
- Channels go on their own: one that fails is tried again after 1, 5 and 30 minutes, then given up on,
  and **Retry** sends it again. The others aren't held up, and a channel that posted is never posted
  again; its text stays as it was posted.
- Before you press, the panel says what would stop the post: an image channels can't fetch (no
  `serverURL`, a private file, a localhost address), or a source that isn't published yet. A scheduled
  post waits up to an hour for its source to be published, then fails.

Writing a post needs the right to create and change social posts; **posting** needs `publish` on the
collection, a separate right in **Settings → Roles**, so an editor can draft and someone else posts.

Each channel given up on sends `social.failed`, and each post `social.posted`, to [webhooks](./webhooks#your-own-events)
that list them and to `cms.on`; the [notify plugin](./notifications) tells your chat about failures.

## Options

| Option | Default | |
|---|---|---|
| `collections` | `[]` | Collections whose edit page has **Share**, and which a post's source points to. |
| `url` | — | `({ doc, collection }) => string`: a shared document's link. |
| `share` | title, first textarea, `url`, first image | `({ doc, collection, cms }) => ({ title, text, link, image })`. |
| `channels` | `[webhook]` | Where posts go (adapters). |
| `slug` | `social-posts` | The collection. |

## Next steps

- [Integrations](./integrations): connections and secrets.
- [Notifications](./notifications): a Telegram message when a post fails.
