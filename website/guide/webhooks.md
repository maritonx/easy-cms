# Webhooks

Tell other services when content changes: rebuild a static site, clear a CDN cache, notify a
chat channel.

```ts
export default defineConfig({
  webhooks: [
    // Every event of every collection and global, signed.
    { url: 'https://example.com/cms-hook', secret: process.env.WEBHOOK_SECRET },
    // Only publishing of posts, e.g. a Vercel or Netlify build hook.
    { url: process.env.BUILD_HOOK_URL!, events: ['publish', 'unpublish'], collections: ['posts'], globals: [] },
  ],
})
```

| Option | Default | |
|---|---|---|
| `url` | required | Where events are POSTed |
| `events` | all | `create`, `update`, `delete`, `publish`, `unpublish`, `draft` |
| `collections` | all | Collection slugs; `[]` for none |
| `globals` | all | Global slugs; `[]` for none |
| `secret` | — | Signs each request (below) |
| `headers` | — | Extra headers, e.g. a token the receiver checks |

## Events

| Event | When |
|---|---|
| `create` | A document was created |
| `update` | A stored document or global changed |
| `delete` | A document was deleted |
| `publish` | Its status became `published` (sent with `create` or `update`) |
| `unpublish` | Its status left `published` |
| `draft` | Only a draft was saved; what is live did not change ([versions](./drafts#versions)) |

Publishing on a [schedule](./drafts#scheduled-publishing) sends the same events.

## Requests

```http
POST /cms-hook
content-type: application/json
x-easy-cms-event: publish
x-easy-cms-delivery: 2f1c…            (the same on retries)
x-easy-cms-signature: sha256=9a0b…    (with `secret`)

{ "event": "publish", "collection": "posts", "id": 12, "doc": { … }, "timestamp": "…" }
```

`doc` is the stored document: every locale, without hidden fields. Check the signature with an
HMAC-SHA256 of the raw body:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto'

const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`
const valid =
  expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
```

## Delivery

Webhooks are sent after the change is saved and never slow it down or make it fail. Timeouts
(10 s), network errors, `429` and `5xx` answers are retried twice (after 1 s and 5 s); other
`4xx` answers are logged and not retried.

On serverless platforms a function may stop before a webhook is sent: call
`await cms.flushWebhooks()` before returning when you write through the Local API there.
