# Realtime

::: info What you'll learn
Keep a list or a document on your site up to date as editors save, without reloading: subscribe
to a collection's changes over Server-Sent Events.

**Before this page:** [Access control](./access-control), [Drafts, versions & scheduling](./drafts).
:::

Turn it on per collection:

```ts
{
  slug: 'posts',
  realtime: true,
  fields: [/* … */],
}
```

Each save of a post then also writes a row of the `realtime-events` table, in the same database
transaction. Create a migration for it (`easy-cms migrate:create realtime`). The table exists
only when at least one collection has `realtime: true`.

Subscribers get five kinds of change: `create`, `update`, `delete`, `publish` and `unpublish`.
Each carries the document **as the subscriber reads it over REST**: the collection's read access
(row-level `where` included), field-level `read` access, API key permissions and drafts apply to
each subscriber on its own.

## In the browser

`createClient()` from `@easy-cms/core/client` has `live()`: a list loaded with `find`, then kept
up to date from the events. With `id`, one document.

### Next.js

`useLive` from `@easy-cms/next/live`, in a Client Component:

```tsx
'use client'
import { createClient } from '@easy-cms/core/client'
import { useLive } from '@easy-cms/next/live'
import type config from '@/easy-cms.config'

const cms = createClient<typeof config>({ url: '/api/cms' })

export function LivePosts() {
  const { docs, ready, error } = useLive(cms, 'posts', { sort: '-createdAt', limit: 20 })
  if (!ready) return <p>Loading…</p>
  return (
    <ul>
      {docs.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  )
}
```

Pass what a Server Component loaded as the fourth argument (`initial`) to show it until the
first load. The Next.js example has this page at `/live`.

### Nuxt

`useLive` is auto-imported. It returns refs, and a reactive query subscribes again when it
changes:

```vue
<script setup lang="ts">
import { createClient } from '@easy-cms/core/client'
import type config from '~~/easy-cms.config'

const cms = createClient<typeof config>({ url: '/api/cms' })
const { docs: posts, ready } = useLive(cms, 'posts', { sort: '-createdAt', limit: 20 })
</script>
```

The Nuxt example has this page at `/live`.

### What the list does

- `create`, `update`, `publish` and `unpublish` put the document in (or replace it), in `sort`'s
  order (default `-createdAt`); with `limit` it keeps at most that many.
- `delete` and `leave` take it out. `leave` means it no longer shows for this subscriber: a
  visitor's published post was unpublished, or it no longer matches `where` or the user's access.
  Both come only for documents the subscriber could see before.
- After a `reset` it loads the list again.

## Subscribing yourself

`subscribe()` takes several subscriptions on one connection: a collection, its documents
matching `where`, or one document.

```ts
const cms = createClient<typeof config>({ url: 'https://cms.example.com/api/cms' })

const stream = cms.subscribe(
  [
    { collection: 'posts', where: { category: { equals: 'news' } } },
    { collection: 'comments', id: 42 },
  ],
  {
    onEvent: (change) => {
      if (change.collection === 'posts' && 'doc' in change) console.log(change.doc.title)
    },
    onReady: () => console.log('connected'),
    onReset: () => reloadEverything(),
    onError: (error) => console.warn(error),
  },
)
// Later:
stream.close()
```

It reads the stream with `fetch`, so the browser's session cookie and the client's `token`
(`Authorization: Bearer`) work. It reconnects by itself with backoff, and resumes where it was.
It stops when the API refuses the subscription (`400`, `401`, `403` or `404`).

## The stream

`GET <api>/realtime?s=<subscription>[&s=…]` answers `text/event-stream`. Each `s` is a path under
the API with its query, as a REST read takes it, URL-encoded as one parameter:

| `s` | Follows |
|---|---|
| `posts` | every post the subscriber may read |
| `posts/12` | post 12 |
| `posts?where[category][equals]=news` | posts matching the `where` (bracket or JSON `where=`, as the [list](./rest-api)) |
| `posts?draft=true&depth=0&locale=th` | with drafts (staff only, as over REST), depth and locale |

At most 20 per stream. To change them, open a new stream.

```
id: 812
event: update
data: {"collection":"posts","id":12,"doc":{"id":12,"title":"Hello","status":"published"}}

id: 813
event: delete
data: {"collection":"posts","id":9}
```

- `id:` is the event's id: events go out in its order. A client that reconnects sends it as
  `Last-Event-ID` and gets what it missed (EventSource does this itself).
- `event:` is `create`, `update`, `delete`, `publish`, `unpublish` or `leave`; `delete` and
  `leave` carry only `collection` and `id`.
- `ready` comes once the stream is up, after what a reconnecting client missed.
- `reset` comes when it can't resume: away longer than `retentionHours`, or more than 1,000
  events behind. Load what you show again.
- A comment line every `heartbeatMs` keeps proxies from closing a quiet stream.

Auth is the same as REST: the session cookie in a browser, an API key in the `Authorization`
header on a server. Tokens are never taken from the URL. Visitors may subscribe to what they may
read. Access is checked when the stream opens (a `where` on a field the user can't read gets
`403`, as a list would); a stream whose session ends or API key is revoked closes within a
minute, and the client reconnects as who it is now.

`leave` and `delete` go only to subscribers who could see the document before the change: its
stored state then matched the subscription (`where`, `id`) and the subscriber's read access now
(row-level `where`, drafts as it may read them). Nobody learns the id of a document they never
could read. That check runs in memory: when it can't tell (a `like`, a value in an array) it
sends nothing, so a client may keep such a document until it loads again.

## Local API

`cms.subscribe()` gives the same events in your server code, saved on this instance or any other
on the same database:

```ts
const changes = cms.subscribe('posts', { where: { status: { equals: 'published' } } })
await changes.ready
for await (const change of changes) {
  if (change.event === 'reset') continue
  console.log(change.event, change.id)
}
```

As other Local API calls it trusts the caller; pass `user` and `overrideAccess: false` to read
as a user. `after` resumes after an event's `eventId`. `close()` (or `break`) ends it.

## Options

```ts
export default defineConfig({
  realtime: {
    retentionHours: 24, // events kept for clients that reconnect
    pollMs: 1000, // how often each server reads new events
    heartbeatMs: 25_000,
    maxPerUser: 10, // open streams per user, API key or visitor IP, per server: more get 429
    maxConnections: 1000, // open streams per server: more get 503
  },
  // …
})
```

## Several instances and serverless hosts

- Each server reads new events from the database every `pollMs` (once for all its subscribers)
  and sends them to its own streams, so a save on one instance reaches subscribers on all of
  them within about `pollMs`. No Redis or LISTEN/NOTIFY: the database is the only thing instances
  share, as for jobs.
- **Cloudflare Workers** can't write to one request's stream from another, so each stream reads
  the table on its own: one query per stream every `pollMs`. Keep `pollMs` higher there, or the
  number of streams small. Limits count per isolate.
- **Serverless functions** (Vercel, Netlify) end a stream at the function's maximum duration. The
  client reconnects with `Last-Event-ID` and misses nothing; long-lived streams use up function
  time, so a server (`easy-cms serve`, Docker) suits many subscribers better.
- Rows older than `retentionHours` are removed by the jobs that run every minute (or by your
  cron's `GET <api>/jobs/run`).

## Things to know

- Database adapters that write outbox rows (`@easy-cms/db-sqlite`, `@easy-cms/db-postgres`) write
  the event in the save's transaction: no event without its save, no save without its event.
  Others write it right after the save, and the server says so at startup.
- Each event reads the document once per subscriber (visitors with the same subscription share
  one read), so many subscribers to a busy collection cost reads.
- Globals, the admin's own live updates and custom channels aren't part of realtime yet.

## Next steps

- [Access control](./access-control): what each subscriber reads.
- [Webhooks](./webhooks): changes pushed to other services instead.
