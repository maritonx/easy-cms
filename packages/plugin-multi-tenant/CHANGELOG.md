# @easy-cms/plugin-multi-tenant

## 0.45.0

### Minor Changes

- 56a926b: Multi-tenant, more complete. Uploads accept only the tenant's files, and media folders opened by an upload field's `folder` key are each tenant's own. Nested pages, redirects and forms work per tenant: paths, redirects and form slugs only differ within a tenant, `findByPath()`, `getTree()` and `resolveRedirect()` take a `context`, and documents a plugin writes take the tenant of what they point to. Admins of a tenant see its audit log. Deleting a tenant shows what goes with it and asks for its name. New documents start in the chosen tenant, and lists show a Tenant column while all tenants are shown.
  
  New in the core, for other uses too: `filterOptions` on upload fields; `uniqueWithin` with several fields; `cms.uniqueScope()`; `audit.scope`; `admin.confirmDelete` on collections; `admin.defaultValue`, `admin.column` and `admin.allowCreate` on fields; relationship columns in lists.
  
  Projects with `audit` get a `scope` column: create a migration (`easy-cms migrate:create`) before deploying.

### Patch Changes

- Updated dependencies [56a926b]
  - @easy-cms/core@0.45.0

## 0.44.0

### Minor Changes

- 40bd4bc: New plugin: `@easy-cms/plugin-multi-tenant`, several sites or clients in one CMS. A `tenants` collection, a `tenant` on the documents of the collections you name, members with a role in each tenant (Settings → Members), globals with a value per tenant, a tenant switcher in the admin, frontends that name their tenant by header, `?tenant=` or domain, API keys that keep their tenant, and `easy-cms tenants:assign`. New guide: Multi-tenant.
  
  The core gains what it is built on, for other uses too: `onRequest` in the config gives each request a `context` (and may change its user), which access rules, hooks, `filterOptions` and the Local API (`context`, `cms.forRequest(request)`) receive; `scoped` users and `isSystemAdmin()`; globals with a value per `scope`; `uniqueWithin` on any unique field, with a unique index per scope; and `admin.switcher`.
  
  The SEO plugin's sitemap and llms.txt read in the request's context (e.g. the tenant of the domain); `sitemap()`, `sitemapXml()`, `llmsTxt()` and `llmsFullTxt()` take a `context`.
  
  Projects with the nested-docs plugin get a unique index on `(parent, slug)`: create a migration (`easy-cms migrate:create`) before deploying.

### Patch Changes

- Updated dependencies [40bd4bc]
  - @easy-cms/core@0.44.0
