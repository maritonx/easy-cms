# Webhooks

::: info What you'll learn
Notify other services when content changes, with signatures and retries that survive restarts.

**Before this page:** [Hooks](./hooks).
:::

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
| `collections` | all but `users` | Collection slugs; `[]` for none. User accounts are sent only when `users` is listed. |
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

## Your own events

Plugins and apps send events of their own, e.g. the [shop](./ecommerce)'s `order.paid`. Declare
them in `events` (plugins do), send them with `cms.emit()`, and list them in a webhook's
`events`: they go only to webhooks that list them.

```ts
export default defineConfig({
  events: ['invoice.sent'],
  webhooks: [{ url: 'https://erp.example.com/hook', events: ['invoice.sent'], secret }],
})

cms.emit('invoice.sent', { number: 'INV-1' }, { collection: 'invoices', id: 7 })
```

The body is `{ event, collection?, id?, doc, timestamp }`, with what was given as `doc`;
delivery, signatures and retries are the same.

## Requests

```http
POST /cms-hook
content-type: application/json
x-easy-cms-event: publish
x-easy-cms-delivery: 2f1c…               (the same on retries)
x-easy-cms-timestamp: 1761700000          (with `secret`: this attempt's time, Unix seconds)
x-easy-cms-signature-v2: v1=5c3e…         (with `secret`)
x-easy-cms-signature: sha256=9a0b…        (with `secret`, deprecated)

{ "event": "publish", "collection": "posts", "id": 12, "doc": { … }, "timestamp": "…" }
```

`doc` is the stored document: every locale, without hidden fields.

### Checking the signature

With `secret`, each attempt is signed with an HMAC-SHA256 of `<delivery>.<timestamp>.<body>`, the
raw body as sent. The timestamp is the attempt's, so a request captured on the way can't be sent
again later. In Node, `verifyWebhook()` from `@easy-cms/core` checks it and returns the payload:

```ts
import { verifyWebhook } from '@easy-cms/core'

export async function POST(request: Request) {
  const body = await request.text() // the raw body, before parsing
  let payload
  try {
    payload = verifyWebhook(body, request.headers, process.env.CMS_WEBHOOK_SECRET!)
  } catch {
    return new Response('Bad signature', { status: 401 })
  }
  // …
}
```

- **Five minutes.** It refuses a timestamp more than 5 minutes from now (`{ toleranceSeconds }`
  changes that), so keep the receiver's clock right.
- **Skip what you have handled.** Within those minutes a replay still verifies: keep the
  `x-easy-cms-delivery` ids you have handled for a while and skip them. Retries use the same id.
- **Several secrets.** Pass an array while you replace one: any of them verifies.

Elsewhere, compare in constant time:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto'

const signed = `${headers['x-easy-cms-delivery']}.${headers['x-easy-cms-timestamp']}.${rawBody}`
const expected = `v1=${createHmac('sha256', secret).update(signed).digest('hex')}`
const given = headers['x-easy-cms-signature-v2']
const valid =
  expected.length === given.length && timingSafeEqual(Buffer.from(expected), Buffer.from(given))
// and |now − x-easy-cms-timestamp| ≤ 300 seconds
```

`x-easy-cms-signature` (an HMAC of the body alone) is still sent until 2.0, but a captured request
replays with it: move to `x-easy-cms-signature-v2`.

## Delivery

Webhooks are sent after the change is saved and never slow it down or make it fail. Timeouts
(10 s), network errors, `429` and `5xx` answers are retried; other `4xx` answers are logged and
not retried.

- Two quick retries happen in the process that made the change (after 1 s and 5 s).
- Each delivery is saved in the database (the internal `webhook-deliveries` table) before the
  first attempt and removed once it succeeds, so a restart or a stopped serverless function
  doesn't lose it, even in the middle of sending. A process that stopped mid-send is picked up
  by the next run after 5 minutes.
- After the quick retries, it is retried with [scheduled jobs](./drafts#scheduled-publishing):
  after 1 minute, 5 minutes, 30 minutes, 2, 6 and 12 hours. Servers run them every minute; on
  serverless, call `<api>/jobs/run` from a cron.
- After the last attempt (about a day later) the delivery is kept with `state: 'failed'` and its
  last error, and not retried by itself. Admins see it under **Settings → Deliveries**, where
  they can retry or delete it ([Health checks](./health-checks#failed-webhooks)). Failed
  deliveries are deleted after 30 days.

Every attempt sends the same body and `x-easy-cms-delivery` (with a new timestamp and signature), so a receiver can skip
deliveries it has already handled. Adding `webhooks` to a config adds the
`webhook-deliveries` table: create a migration as for any config change.

On serverless platforms a function may stop before a webhook is sent: call
`await cms.flushWebhooks()` before returning when you write through the Local API there.
`await cms.retryWebhooks()` tries the saved deliveries that are due (`runJobs()` does that and
runs scheduled publishing).

## Next steps

- [Drafts, versions & scheduling](./drafts): what publishing triggers.
- [CLI](./cli): run retries from cron.
