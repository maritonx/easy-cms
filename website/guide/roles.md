# Roles from the admin

::: info What you'll learn
How admins add roles and tick what each one may do, per collection, global and admin page, without
writing code.

**Before this page:** [Access control](./access-control), [Users & auth](./auth).
:::

<Screenshot name="roles" alt="Settings → Roles: the roles on the left, and a table of collections against Read, Create, Update, Delete and Publish" />

Turn it on in the config:

```ts
auth: { rbac: true },
```

Admins then find **Settings → Roles** in the admin. They can add roles (an editor team, a reviewer,
a translator…), copy one to start from, rename them, and tick what each may do:

- **Content:** each collection and global against **Read**, **Create**, **Update**, **Delete** and
  **Publish** (Publish only with [drafts](./drafts)). Ticking anything else ticks Read too; a whole
  row or column can be ticked at once. **Create** on Media means uploading.
- **Admin pages:** the system status on the dashboard, [Deliveries](./health-checks), and the pages
  and dashboard panels of [plugins](./plugins#pages-and-dashboard-panels). Backups, Email and Roles
  stay with admins: a backup holds the whole database, and Email sends mail from the site.

Users are given a role on their page under **Settings → Users**. Changes apply on the next request.
Each role keeps a history of who changed it and when.

## How it works with access rules

A user may do something when **both** their [access rules](./access-control) and their role allow
it. The rules in your code stay the outer limit, so a rule like "authors edit their own posts" keeps
working, and a role can only narrow what the code allows.

- **Admins** (`role: 'admin'`) may always do everything. Their role can't be changed or deleted.
- **Visitors who aren't logged in** are left to access rules alone: `read: () => true` stays public.
- **Everyone** sees and edits their own account (Account page), whatever their role. A role with
  Read or Update on Users gives more: the other users. A user's `role` can still be changed only by
  admins.
- **[API keys](./api-keys)** can do no more than their owner's role, now and after the role
  changes. The admin only offers what the owner may do.
- Checks run on the server, for the REST API, the [MCP server](./mcp) and the Local API with
  `overrideAccess: false`. The admin hides what a role can't do, and its main button saves a draft
  for roles without Publish.

## Roles in the config

The roles in `auth.roles` always exist. They can be renamed and their permissions changed, but not
deleted, since your code may check them (`user.role === 'editor'`). Roles added in the admin can be
deleted once no user has them.

When roles are first turned on, every role in `auth.roles` gets everything it could do before:
every collection and global, and the plugin pages and panels. The system status and Deliveries stay
with admins, as before. So turning roles on changes nothing until an admin unticks something.

Collections and globals added to the config later are **not given to any role**: only admins can
use them until someone ticks them. Settings → Roles marks them **New**.

## Fields that point elsewhere

When a role may edit posts but not read categories, a post's category field shows the value as it
is, says the user can't open categories, and keeps the value on save. Settings → Roles warns about
this when the role is saved. Upload fields need Read on Media to choose files, and Create to upload.

## Setting it up

Roles are stored in the `ecms_user_roles` table, and their history with [versions](./drafts#versions). Turning them on
adds a migration:

```sh
npx easy-cms migrate:create roles
```

Plugin dashboard panels are given to roles by their component tag; give each panel its own tag and,
optionally, a `label` for the Roles page:

```ts
admin: { dashboard: [{ component: 'ecms-sales-chart', label: { en: 'Sales', th: 'ยอดขาย' } }] }
```

## Next steps

- [Access control](./access-control): rules in code, per document and per field.
- [API keys](./api-keys): access for scripts, limited to what their owner may do.
