# Studio

::: info What you'll learn
Try Easy CMS in your browser at [studio.easycms.dev](https://studio.easycms.dev): start from a
template, edit the config and watch its admin follow, see it as each role, then take the config
into a project with one command.

**Before this page:** nothing. **After it:** [Getting started](./getting-started).
:::

Studio puts an `easy-cms.config.ts` on the left and the admin it makes on the right. Every edit,
after a short pause, starts the CMS again with the new config, and the admin shows the change
without losing its place. Nothing to install and no account: the real Easy CMS runs in your
browser, on an in-memory database, and nothing you type is sent to a server.

## Start from a template {#templates}

Studio opens with the Blog. **Templates** in the bar opens ten, one per kind of system, each with
sample data of its own:

| Template | What it shows | Link |
| --- | --- | --- |
| Blog | Drafts, categories, the SEO plugin | [`?template=blog`](https://studio.easycms.dev/?template=blog) |
| Company website | Pages laid out from blocks, a global, the SEO plugin | [`?template=company`](https://studio.easycms.dev/?template=company) |
| Online shop | Products, customers, orders with their lines (arrays, relationships) | [`?template=shop`](https://studio.easycms.dev/?template=shop) |
| Booking | Services, staff, bookings anyone may make and only staff see | [`?template=booking`](https://studio.easycms.dev/?template=booking) |
| CRM | Companies, contacts, deals through a pipeline | [`?template=crm`](https://studio.easycms.dev/?template=crm) |
| Job board | Positions and applications, with access rules | [`?template=jobs`](https://studio.easycms.dev/?template=jobs) |
| Restaurant | A menu in Thai and English ([localization](./localization)) | [`?template=restaurant`](https://studio.easycms.dev/?template=restaurant) |
| Online courses | Courses, lessons, instructors, students (has many) | [`?template=courses`](https://studio.easycms.dev/?template=courses) |
| Real estate | Listings with groups, agents, enquiries | [`?template=real-estate`](https://studio.easycms.dev/?template=real-estate) |
| Multi-tenant SaaS | Each customer sees only its own projects ([multi-tenant](./multi-tenant)) | [`?template=saas`](https://studio.easycms.dev/?template=saas) |

Picking one replaces the code and starts from an empty database with its samples. If you changed
the code, Studio asks first, and offers to copy your code before it goes. **↺** in the bar brings
the samples back without touching the code.

## Edit the config {#edit}

The editor knows every Easy CMS type: completions, and errors under what's wrong.

- **A config that fails** (it doesn't compile, isn't valid, or the CMS won't start) leaves the last
  admin that worked in place; the error shows under the code, with its line.
- **Type problems** the config still runs with show as a count beside the status; click it to go
  to the first.
- **Console** under the code shows what Easy CMS logged: the schema it pushed, the sample data it
  added, and emails your hooks send.

## View the admin as each role {#view-as}

**View as** in the bar shows the admin as a user with each role of the config (`auth.roles`:
Admin and Editor by default, and any you add). Switching keeps the page you're on, so an access
rule shows as each role meets it: a collection only admins may create in has no **Create new**
for an Editor. See [access control](./access-control).

## Share it, and take it into a project {#share}

The address always holds the config, compressed into its `#…` part with the Easy CMS version it
ran with, so the link is the config. **Share link** (or ⌘S / Ctrl+S) copies it; the `#…` part is
never sent to a server.

**Use in a project** gives the command that sets up a project from it:

```bash
npm create easy-cms@latest -- --from "https://studio.easycms.dev/#v=…&c=…"
```

It writes that `easy-cms.config.ts` (beside an existing one, as `easy-cms.config.studio.ts`), takes
the database from its adapter, and installs every `@easy-cms` package it imports: at least the
version the link was made with, when that's newer than `create-easy-cms`. See
[Getting started](./getting-started#from-a-config-made-in-studio) and the [CLI](./cli).

## What a config can import {#imports}

| Package | In Studio |
| --- | --- |
| `@easy-cms/core`, `fields`, `db-memory` | The real ones |
| `plugin-seo`, `plugin-redirects`, `plugin-multi-tenant`, `plugin-nested-docs`, `plugin-form-builder`, `plugin-social` | The real ones, with their admin panels and pages |
| `db-sqlite`, `db-postgres` | SQLite in memory instead |
| `storage-s3`, `storage-vercel-blob`, `storage-netlify-blobs` | Files kept in memory instead |
| `email-smtp` | Emails show in the console |
| `auth-oauth` | Single sign-on is off |
| Other plugins (AI, analytics, backups, ecommerce, email, GraphQL, MCP, notify) | Don't run in a browser yet: they leave the config as it is, and the console says so |

Anything else (`import` from another package) is an error in Studio; in a project it works as
usual.

## Good to know {#limits}

- **It's all in memory.** Reloading keeps the code (it's in the address and the browser) but
  starts the data again from the samples.
- **No environment variables:** `process.env` is empty, and a config without a 32-character
  secret gets Studio's own.
- **Phones** show the admin and the templates; editing wants a computer.
- **Full screen** (⤢, or ⌘\ / Ctrl+\ outside the admin) gives the admin the whole width; the
  divider between code and admin drags (or moves with the arrow keys).
- **Theme**: Studio and its admin follow your system, or the theme button in the bar.
