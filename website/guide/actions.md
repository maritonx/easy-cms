# Actions

::: info What you'll learn
Add buttons that run your code on a document, such as confirm a booking, send a quote or refund an
order: on its edit page, a list row, or every selected document, with who may press them, a form,
and what happened.

**Before this page:** [Configuration](./configuration), [Access control](./access-control).
:::

An action is a function on a collection with a button in the admin. Easy CMS checks who may press
it and whether it applies to the document, asks for its form or a confirmation, runs it on the
server, records it in the [audit log](./audit-log) and tells the user what it did. The same action runs
over REST and from code.

```ts
// easy-cms.config.ts
export default defineConfig({
  collections: [
    {
      slug: 'bookings',
      fields: [
        { name: 'status', type: 'select', options: ['pending', 'confirmed', 'cancelled'] },
        // …
      ],
      actions: [
        {
          name: 'confirm',
          label: { en: 'Confirm booking', th: 'ยืนยันการจอง' },
          on: ['document', 'row', 'bulk'],
          when: ({ doc }) => doc.status === 'pending',
          fields: [{ name: 'note', type: 'textarea', label: 'Note to the guest' }],
          primary: true,
          run: async ({ doc, cms, input }) => {
            await cms.update('bookings', doc.id, { status: 'confirmed' })
            await cms.sendEmail({ to: String(doc.email), subject: 'Confirmed', text: String(input.note ?? '') })
            return { message: 'Confirmed' }
          },
        },
      ],
    },
  ],
})
```

## Where the buttons are

`on` lists where an action's button is (default `['document', 'row']`):

- `document`: the edit page's **Actions** menu, beside Save. `primary: true` makes it a button of its
  own. While the page is open, ⌘K lists it too.
- `row`: a list row's **…** menu.
- `bulk`: the bar that shows when documents are selected. It runs on each of them, and on every
  document matching the list when you select all of them ([bulk actions](./admin#lists)).

An action runs on what is saved. With unsaved changes, pressing it asks to save them first (as a
draft, where there are drafts); if saving fails, it doesn't run.

## The document, `when` and the result

`run({ doc, input, user, cms, collection })` runs once per document. `doc` is the document as its
edit page shows it: the draft, when there is one (`doc.status` says which). It may return:

- `{ message }`: said to the user.
- `{ open: url }`: a page to open, e.g. a quote's PDF or the provider's page, with **Open** beside the
  message.
- nothing: the user sees "done".

The page and the list load the document again after it runs, so what `run` changed shows.

`when({ doc, user })` says whether the button shows for a document, e.g. only while a booking is
pending. The server checks it again when the action runs; in bulk, documents it says no to are
skipped and counted as such.

```ts
import { ActionError } from '@easy-cms/core'

run: async ({ doc }) => {
  if (Date.parse(String(doc.date)) < Date.now()) throw new ActionError('Too late to cancel')
  // …
}
```

`throw new ActionError(message)` tells the user why it can't, in your words. Other errors are logged
on the server and the user sees that the action failed.

## A form, and asking first

`fields` is a small form asked before running; its values are `input`, checked like a document's
fields. It takes `text`, `textarea`, `number`, `select`, `boolean`, `date`, `email` and
`relationship` fields. A form counts as asking.

Without a form, `confirm: true` asks before running, and `confirm: { text, danger: true }` says what
it does and makes the button red. In bulk, Easy CMS always asks, saying how many documents it runs on.

## Who may press it

- **By default**, whoever may update the document (its collection's `update` access).
- `access({ doc, user })` decides it yourself, e.g. only the booking's own staff member.
- **With roles from the admin** (`auth.rbac`), `default` decides where the right comes from:
  - `'admins'` (default): a right of its own under the collection in **Settings → Roles**. Only admins
    have it until a role is given it: what moves money shouldn't come with the right to edit.
  - `'editors'`: every role that may update the collection.

The server checks all of these, and `when`, every time the action runs: a hidden button is not the
only guard.

## Over REST and from code

```http
POST /api/cms/bookings/12/actions/confirm
{ "input": { "note": "See you at 9" } }
→ { "message": "Confirmed" }

POST /api/cms/bookings/actions/confirm
{ "ids": [12, 13], "input": { … } }        → { "done": 2, "skipped": [], "failed": [] }
{ "where": { … }, "input": { … } }         → 202, a background operation (as bulk actions)
```

```ts
await cms.runAction('bookings', 'confirm', { id: 12 }, { user, input: { note: 'See you at 9' } })
```

The same checks apply: your site's own page (a guest's **Cancel booking**) can call the same action
with the guest's session.

## Good to know

- An action runs in the request. Work that takes long (more than about 10 seconds) is better put in
  a [job](./jobs): `run` queues it and answers at once.
- Pressing twice is stopped in the admin while it runs, not on the server. An action that must not
  run twice (a refund) claims the document first: `cms.update('orders', doc.id, { status:
  'refunding' }, { where: { status: { equals: 'paid' } } })` saves only while it is still `paid`, and
  returns `null` for the second press.
- Each run is in the audit log as `action.<name>`, with the form's values and the result.
- Actions are on collections; globals don't have them yet.

## Next steps

- [Access control](./access-control): who may update what.
- [Roles from the admin](./roles): giving actions to roles.
- [Jobs](./jobs): work that takes long.
