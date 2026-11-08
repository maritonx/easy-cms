# Social posts

::: info What you'll learn
Write a post once and send it to several channels, each with its own text, now or at a time, and
see how each one went.

**Before this page:** [Integrations](./integrations).
:::

`@easy-cms/plugin-social` (experimental) adds **Social posts** to Content. A post has a text, a link,
an image and the channels it goes to; each channel can have its own text. Channels are accounts
connected in **Settings → Integrations**: the first is a **webhook**, a URL that gets each post as
signed JSON, such as a Make, n8n or Zapier scenario that posts to LinkedIn, Threads, Discord or anywhere else. A
[Facebook Page](#facebook-page), a [LINE Official Account](#line-oa) and an [X account](#x) are channels of their own.

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
→ LinkedIn"), paste the scenario's URL and, to sign posts, a secret. Connecting sends `{ "test": true }`,
which the scenario can ignore. Each connection is one channel.

Each post arrives as:

```json
{
  "post": 12,
  "channel": "social-webhook:Make → LinkedIn",
  "text": "Our new guide is out",
  "link": "https://example.com/posts/guide",
  "image": { "url": "https://example.com/api/cms/media/file/guide.png", "alt": "The cover" },
  "source": { "collection": "posts", "id": 7 }
}
```

with `x-easy-cms-signature-v2` and `x-easy-cms-timestamp`, as Easy CMS's [webhooks](./webhooks#checking-the-signature)
sign theirs, so `verifyWebhook(body, headers, secret)` checks it. A `2xx` answer means posted; when it
says `{ "url": "…" }`, the post links to it.

## Facebook Page {#facebook-page}

Posts go to Pages you manage through a **Meta app** of your own:

1. At [developers.facebook.com](https://developers.facebook.com/apps) create an app (type **Business**)
   and add **Facebook Login for Business**.
2. In its settings, add the redirect URI
   `https://example.com/api/cms/admin/integrations/facebook-page/callback` (your `serverURL`).
3. Set the app's id and secret on the server:

```bash
META_APP_ID=1234567890
META_APP_SECRET=…
```

Then **Settings → Integrations → Facebook Page → Connect with Facebook Page**: Facebook asks you to log
in and allow the app to manage your Pages; back in the admin, choose the Page. Each Page you connect is
one channel. The admin gets a Page token that doesn't expire unless you take the app's access back, or
change your Facebook password: then the card shows the error, and you connect the Page again.

A post with an image goes up as a photo, with the text and the link as its caption; without one it is a
link post, with Facebook's preview of the link. The panel links to the post.

::: warning Development mode and App Review
A new app is in **Development mode**: it works for the people with a role on the app (its admins,
developers and testers) and the Pages they manage, which is enough for your own site. Letting anyone
else connect their Page needs **App Review** for `pages_manage_posts`, `pages_read_engagement` and
`pages_show_list`, and a verified business.
:::

`FACEBOOK_GRAPH_VERSION` picks another Graph API version (default `v26.0`).

## LINE OA {#line-oa}

Posts go to every friend of a LINE Official Account as a card: the image, the title, the text and a
button to the link.

1. In the [LINE Official Account Manager](https://manager.line.biz) turn on the **Messaging API** for
   your account (**Settings → Messaging API**). This makes a channel in the
   [LINE Developers Console](https://developers.line.biz/console/).
2. In the console, open the channel's **Messaging API** tab and issue a **channel access token
   (long-lived)**.

**Settings → Integrations → LINE OA → Connect**: paste the token and, if you like, the button's text
(default "Read more"). Connecting checks the token against the account and shows its name. Or set
`LINE_CHANNEL_ACCESS_TOKEN` on the server.

::: warning Each friend reached is a message
A broadcast counts one message per friend it reaches toward your plan's monthly quota; the free plan's is
small, and what's over is paid or refused, depending on the plan (see LINE's pricing for your country).
Before you post, the panel shows about how many friends the post reaches and the month's messages so far,
and warns when the post would go over.
:::

The text on the card is cut at 300 characters, and the image needs an `https` URL. LINE gives no link to
a broadcast, so the panel shows it posted without one.

## X {#x}

Posts go to your X account through an X app of your own, with keys that don't expire:

1. At [console.x.com](https://console.x.com) create an app, and in its settings give it **Read and
   Write** permission.
2. Under **Keys and tokens**, copy the **API key and secret** (OAuth 1.0 consumer keys), then
   generate an **access token and secret** for your account. Make them after setting Read and Write:
   tokens made while the app could only read can't post. X shows each once.
3. Buy credits: X's API has no free plan (see [Costs](#costs)).

**Settings → Integrations → X → Connect**: paste the four values. Connecting checks them and shows
the account's @name. Or set `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN` and
`X_ACCESS_TOKEN_SECRET` on the server.

A post is its text and the link; X shows the link's card, with the page's share image, so no image is
uploaded. X counts in its own way: the link is 23 characters whatever its length, an emoji or a CJK
character is 2, and Thai is 1 a character. The text may have 255, so that with the link the post fits
X's 280, and the counter beside the text counts X's way.

When X refuses, the card says what to do: keys that were made again (401), an app without write
permission or a post X already has (403), no credits left (402). Only a busy X (429) or an outage is
tried again.

## Writing and sharing

**Share on social media** on a document's edit page (collections in `collections`) writes a social
post from it: its title, its first textarea (an excerpt), `url`, its first image, and every connected
channel. `share: ({ doc, collection }) => ({ title, text, link, image })` fills it your way. Remove the
channels it shouldn't go to; a channel's own text replaces the post's text there.

## Writing with AI

With the [AI plugin](./ai), the post's text and each channel's text have **Write with AI**: it writes
from the shared document (its title and text; before anything is shared, the post's title), within the
channel's length (300 characters for LINE, 255 by X's count for X, 500 for the others), in the default language. The text goes into the field
for review, with **Undo**; replacing text you have asks first. It is the **Social posts** feature in the
AI settings, and each press is one request toward the user's daily limit.

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

## Costs {#costs}

What each channel costs to post with, as of November 2026; check the providers' pages, as prices change.

| Channel | Cost |
|---|---|
| Facebook Page | Free: posting to your own Pages through the Graph API has no charge. |
| LINE OA | One message per friend reached, from the plan's monthly quota; the free plan's is small ([LINE's pricing](https://developers.line.biz/en/docs/messaging-api/pricing/) for your country). The panel shows the quota before you post. |
| Webhook | Whatever the scenario costs: Make's free plan has 1,000 credits a month, about one per module run. |
| X | Pay-per-use, with no free plan: [$0.015 a post, $0.20 with a link](https://docs.x.com/x-api/getting-started/pricing), paid from credits bought ahead. The panel shows the cost before you post. |

**Scheduled posts and retries need jobs to run often**: a failed channel is tried again after 1, 5
and 30 minutes, and a scheduled post goes out at the first run after its time. On Vercel's Hobby plan,
whose cron runs once a day, call the jobs endpoint from [GitHub Actions](./drafts#scheduled-publishing)
every few minutes.

**Images.** A post's image is a file in the media library: when the shared document has none (e.g.
its share image is generated), the post has none either. Facebook still shows the link's preview;
LINE's card has no picture. Give the posts you care about a cover.

## Options

| Option | Default | |
|---|---|---|
| `collections` | `[]` | Collections whose edit page has **Share**, and which a post's source points to. |
| `url` | — | `({ doc, collection }) => string`: a shared document's link. |
| `share` | title, first textarea, `url`, first image | `({ doc, collection, cms }) => ({ title, text, link, image })`. |
| `channels` | `[webhook, facebook, line, x]` | Where posts go (adapters). |
| `slug` | `social-posts` | The collection. |

## Next steps

- [Integrations](./integrations): connections and secrets.
- [Notifications](./notifications): a Telegram message when a post fails.
