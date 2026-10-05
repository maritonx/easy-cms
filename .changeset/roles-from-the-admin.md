---
"@easy-cms/core": minor
"@easy-cms/admin": minor
---

Roles from the admin (RBAC): admins add roles and tick what each may do, without code.

- Turn it on with **`auth: { rbac: true }`**. Admins get **Settings → Roles**: add, rename, copy and delete roles, and tick **Read, Create, Update, Delete and Publish** per collection and global, plus admin pages (the system status, Deliveries, and plugin pages and dashboard panels). Each role keeps a history of who changed it.
- Permissions are checked on the server **on top of access rules**: both must allow. Admins may always do everything; requests that aren't logged in are left to access rules; everyone keeps their own account; API keys can do no more than their owner's role.
- The roles in `auth.roles` always exist and can't be deleted. When roles are first turned on they get everything they could do before, so nothing changes until an admin unticks something. Collections added later are given to no role until ticked (marked **New**).
- The admin hides what a role can't do: menus, buttons, Publish (the main button saves a draft instead), and relationship and upload fields pointing to collections the role can't read (shown as they are, kept on save). The API key permissions table only offers what you may do yourself.
- `/admin/schema` now has `permissions.publish` and `views`; dashboard panels take an optional `label`, and with `rbac` each needs its own tag. New admin-only endpoints under `<api>/admin/roles`.
- Adds the internal `user-roles` table when `rbac` is on: create a migration (`easy-cms migrate:create roles`). The `user-roles` slug is now reserved.
