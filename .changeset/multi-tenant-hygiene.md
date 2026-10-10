---
"@easy-cms/core": minor
"@easy-cms/admin": minor
"@easy-cms/plugin-multi-tenant": minor
---

Multi-tenant hygiene (#102):

- Staff of a tenant see others' memberships in that tenant only; people still see all their own.
- Checking the audit log's integrity is for admins of the whole system (not of one tenant); the admin hides the button for others.
- A plugin's collections listed only partly per tenant (forms without their submissions, some of the shop's) log a warning on the first request.
- `unique` on a field inside a group, array or block logs a config warning: it is enforced on top-level fields only.
