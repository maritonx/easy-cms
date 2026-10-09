---
'@easy-cms/plugin-multi-tenant': minor
'@easy-cms/core': minor
'@easy-cms/admin': minor
'@easy-cms/drizzle': minor
'@easy-cms/plugin-nested-docs': minor
'@easy-cms/plugin-redirects': minor
'@easy-cms/plugin-form-builder': patch
---

Multi-tenant, more complete. Uploads accept only the tenant's files, and media folders opened by an upload field's `folder` key are each tenant's own. Nested pages, redirects and forms work per tenant: paths, redirects and form slugs only differ within a tenant, `findByPath()`, `getTree()` and `resolveRedirect()` take a `context`, and documents a plugin writes take the tenant of what they point to. Admins of a tenant see its audit log. Deleting a tenant shows what goes with it and asks for its name. New documents start in the chosen tenant, and lists show a Tenant column while all tenants are shown.

New in the core, for other uses too: `filterOptions` on upload fields; `uniqueWithin` with several fields; `cms.uniqueScope()`; `audit.scope`; `admin.confirmDelete` on collections; `admin.defaultValue`, `admin.column` and `admin.allowCreate` on fields; relationship columns in lists.

Projects with `audit` get a `scope` column: create a migration (`easy-cms migrate:create`) before deploying.
