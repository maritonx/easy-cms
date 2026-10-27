# Hooks

::: info What you'll learn
How to run your own code when documents are created, changed, read or deleted, with examples
for the common cases.

**Before this page:** [Configuration](./configuration).
:::

Hooks run your code at points of a document's life. They run for every way in: the Local API,
the REST API and the admin. Each hook is a list of functions, so plugins can add their own next
to yours.

```ts
{
  slug: 'posts',
  hooks: {
    beforeChange: [({ data }) => ({ ...data, readingTime: minutes(data.body) })],
    afterChange: [({ doc }) => notifyTeam(`Saved: ${doc.title}`)],
  },
  fields: [/* … */],
}
```

## Collection hooks

| Hook | When | Arguments | Return |
|---|---|---|---|
| `beforeValidate` | before fields are checked | `data`, `operation`, `previousDoc?` | new data, or nothing |
| `beforeChange` | after validation, before saving | `data`, `operation`, `previousDoc?` | new data, or nothing |
| `afterChange` | after saving | `doc`, `operation`, `previousDoc?` | — |
| `beforeDelete` | before deleting | `id` | — |
| `afterDelete` | after deleting | `id`, `doc` | — |
| `afterRead` | for every document returned | `doc` | new doc, or nothing |

Every hook also gets:

- `user`: who is doing it, or `null` (anonymous, or a trusted Local API call).
- `cms`: the [Local API](./local-api), to read or write other collections.
- `slug`: the collection's (or global's) slug, handy when one function serves several.

`operation` is `'create'` or `'update'`. On an update, `previousDoc` is the document before the
change, and `data` holds only what is being changed.

Globals support `beforeValidate`, `beforeChange`, `afterChange` and `afterRead`.

## Order and errors

`beforeValidate` → validation → `beforeChange` → save → `afterChange`

- A **before** hook that throws cancels the operation, and the error reaches the caller: throw
  a `ValidationError` or `ForbiddenError` from `@easy-cms/core` for a clear message in the
  admin.
- An **after** hook that throws is logged; the change stays saved.
- `afterRead` runs for every document returned, including populated relationships, before
  hidden and unreadable fields are removed.
- Hooks in a list run one after another; each sees the previous one's result.
- Hooks run outside the database transaction: an `afterChange` sees the saved document, and
  a slow one delays the response. Send long work to a queue or a [webhook](./webhooks).
  With the [outbox](#outbox), after hooks run after the response instead, and are retried.

## Outbox

By default an after hook runs in the request, right after the save. If it fails, or the process
stops in between, the change is saved but its side effects never happen: no email, no webhook,
no cache purge. Turn on the outbox to make them happen whenever the save does:

```ts
export default defineConfig({
  outbox: true,
  // ...
})
```

- Saving a document also writes an outbox entry, in the same database transaction: a save that
  commits always has one, a save that fails has none.
- A worker runs the entry right after the save, in the background: `afterChange` and
  `afterDelete` hooks, then [webhooks](./webhooks), then `httpCache.purge`. The response doesn't
  wait for them.
- What fails is retried after 1 minute, 5 minutes, 30 minutes, 2 hours and 12 hours, with the
  [scheduled jobs](./jobs) (a cron on serverless hosts). Steps that succeeded aren't run again.
  After that the entry is marked failed; **Settings → Jobs → Outbox** lists it with its error,
  and an admin can retry it.
- Several instances can run the outbox at once: each entry is claimed by one.

What changes for hooks:

- **They must be safe to run more than once.** An entry runs at least once, not exactly once: a
  retry runs the hooks again, and a worker that stops midway leaves the entry to another. Check
  before you act (has this email been sent for this order?), or use an id the other side
  ignores when it sees it again.
- They run after the response: the saving request doesn't see their effects, and their errors
  don't reach it. Entries aren't guaranteed to run in the order they were saved.
- `user` is the user who saved, as they were then; `context` is empty. `doc` and `previousDoc`
  are as saved.
- On serverless hosts, call `await cms.flushOutbox()` before the function returns, or the
  scheduled jobs pick the entries up later.

The outbox needs a migration for its table (`easy-cms migrate:create`), and `@easy-cms/db-sqlite`
or `@easy-cms/db-postgres`. In 2.0 it becomes the default.

## Recipes

### Set the author on create

```ts
beforeChange: [
  ({ data, operation, user }) =>
    operation === 'create' && user ? { ...data, author: user.id } : data,
],
```

### Keep a derived field up to date

```ts
import { richTextToPlainText } from '@easy-cms/richtext'

beforeChange: [
  ({ data }) =>
    data.body === undefined
      ? data // not changing on this update
      : { ...data, readingTime: Math.ceil(richTextToPlainText(data.body).split(/\s+/).length / 200) },
],
```

### Refresh pages after publishing (Next.js)

```ts
import { revalidatePath } from 'next/cache'

afterChange: [
  ({ doc }) => {
    revalidatePath('/')
    if (doc.slug) revalidatePath(`/posts/${doc.slug}`)
  },
],
```

For a site built elsewhere (a static site on a CDN), use [webhooks](./webhooks) instead: they
retry when the other side is down.

### Refuse to delete what is still in use

```ts
import { ForbiddenError } from '@easy-cms/core'

// On the categories collection
beforeDelete: [
  async ({ id, cms }) => {
    const totalDocs = await cms.count('posts', { where: { category: { equals: id } } })
    if (totalDocs > 0) throw new ForbiddenError(`${totalDocs} posts still use this category`)
  },
],
```

### Add a computed value to what is read

```ts
afterRead: [({ doc }) => ({ ...doc, url: `/posts/${doc.slug}` })],
```

`afterRead` values are sent to clients but not stored or searchable. Store the value with
`beforeChange` when you need to filter or sort by it.

## Pitfalls

- **Loops:** calling `cms.update()` on the same collection inside its own `afterChange` runs the
  hooks again. Change `data` in `beforeChange` instead.
- **Access:** `cms` calls inside hooks skip access rules (trusted server code). Pass
  `{ user, overrideAccess: false }` to act as the user.
- **Partial updates:** on an update, `data` has only the fields being changed; read the rest
  from `previousDoc`.

## Next steps

- [Access control](./access-control): decide who may do what, instead of checking in hooks.
- [Webhooks](./webhooks): tell other services about changes, with retries.
