# Escape hatches

::: info What you'll learn
Every place where your own TypeScript takes over from Easy CMS: routes, hooks, events, jobs,
commands, tables and admin screens, and which of them go around access rules.

**Before this page:** [Configuration](./configuration), [Access control](./access-control).
:::

Easy CMS gives you collections, an API and an admin from one config. When that is not enough,
you write the part yourself, in the same project, and it still runs with the same users, roles
and data. Each way out is listed here.

The rule behind them: the usual paths respect your [access rules](./access-control) everywhere.
A way around them exists, but you can see it in the code (`overrideAccess`, below), never by
accident.

## On the server

| You want | Use | |
|---|---|---|
| A route of your own: a report, a payment webhook, an import | `endpoints` | [Endpoints](./plugins#endpoints) |
| Several writes that all happen or none do | `cms.transaction()` | [Transactions](./local-api#transactions) |
| Joins, totals and queries the Local API can't express | `` cms.sql`…` `` | [Raw SQL](./local-api#raw-sql) |
| Code that runs when a document is saved, deleted or read | Collection hooks | [Hooks](./hooks) |
| After-hooks and webhooks that happen only if the save did | `outbox: true` | [Outbox](./hooks#outbox) |
| To work out the user or a context (a tenant, a site) per request | `onRequest` | [Multi-tenant](./multi-tenant) |
| A button in the admin that runs your server code | `actions` | [Actions](./actions) |
| Work on a schedule, retried when it fails | `jobs` | [Jobs](./jobs) |
| Events of your own (`order.paid`), to webhooks and listeners | `events`, `cms.emit()`, `cms.on()` | [Your own events](./webhooks#your-own-events) |
| Your site's pages to follow changes as they are saved | `realtime: true`, `subscribe()` | [Realtime](./realtime) |
| `easy-cms <command>` commands of your own | `cliCommands` | [CLI](./cli#commands-from-plugins) |
| A field type with its own input | `defineFieldType()` | [Custom field types](./field-types) |
| Several of these, shipped together | A plugin: `(config) => config` | [Writing a plugin](./plugins#writing-a-plugin) |

All of them get `cms`, the [Local API](./local-api), so your code reads and writes content the
same way the admin and REST do.

## Your own tables

Easy CMS creates and changes only tables with its prefix (`ecms_`), so your app's own tables can
live in the same database. See [Sharing a database with your app](./databases#sharing-a-database-with-your-app).

- **Data Easy CMS should look after** (access rules, hooks, the admin, REST): make it a
  collection. `admin: { group: false }` keeps it out of the menu.
- **Tables only your code uses:** create them with your own migrations and query them with
  `` cms.sql`…` `` (or your own client). Easy CMS adds no access rules or hooks to tables that are
  not collections.

## In the admin

The admin is a prebuilt app. You extend it with **Web Components**, so any framework works
(Vue, React, Svelte or none): compile your component to one ES module.

| You want | Use | |
|---|---|---|
| Your own input instead of a field's, or a panel below it | `admin.component`, `admin.after` | [Admin components](./plugins#admin-components) |
| Panels in the edit page's side column | `admin.sidebar` | [Admin components](./plugins#admin-components) |
| Pages of your own (a POS, stock, approvals) inside `/admin` | `admin.pages` | [Pages and dashboard panels](./plugins#pages-and-dashboard-panels) |
| Panels on the dashboard | `admin.dashboard` | [Pages and dashboard panels](./plugins#pages-and-dashboard-panels) |
| What an element receives and sends back | `value`, `api()`, `change`… | [What the element receives](./plugins#what-the-element-receives) |

A page of your own can also embed another app of yours in an `<iframe>`.

## Going around access rules

The Local API trusts your code: `cms.find()`, `cms.update()` and the rest skip access rules
unless you pass the user.

```ts
// Your code, as the system: no access rules.
await cms.update('orders', id, { status: 'paid' })

// On behalf of someone: their access rules apply.
await cms.update('orders', id, { status: 'paid' }, { user, overrideAccess: false })
```

In an endpoint or action, pass `{ user, overrideAccess: false }` whenever the request comes from a
person, so they can't do there what the admin and REST would refuse them.

`cms.sql` always goes around them, and around hooks, validation and versions too: use it for
reports and your own tables, and check who is asking before you run it for someone.

## Coming next

Planned, one at a time, in the [roadmap](https://github.com/maritonx/easy-cms/blob/main/docs/ROADMAP.md#m15):
`access` on endpoints with `onResponse` and
`onError`, SQL and TypeScript data migrations with `easy-cms seed`, `admin: false` everywhere,
and `easy-cms build:admin` to compile Vue, React and Svelte admin components. This page lists
each when it ships.

## Next steps

- [Plugins](./plugins): package your escape hatches to use in several projects.
- [Hooks](./hooks): the order hooks run in, and what to watch for.
- [Local API](./local-api): every method your code can call.
