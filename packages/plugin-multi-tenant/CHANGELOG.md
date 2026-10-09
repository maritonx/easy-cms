# @easy-cms/plugin-multi-tenant

## 0.44.0

### Minor Changes

- 40bd4bc: New plugin: `@easy-cms/plugin-multi-tenant`, several sites or clients in one CMS. A `tenants` collection, a `tenant` on the documents of the collections you name, members with a role in each tenant (Settings → Members), globals with a value per tenant, a tenant switcher in the admin, frontends that name their tenant by header, `?tenant=` or domain, API keys that keep their tenant, and `easy-cms tenants:assign`. New guide: Multi-tenant.
  
  The core gains what it is built on, for other uses too: `onRequest` in the config gives each request a `context` (and may change its user), which access rules, hooks, `filterOptions` and the Local API (`context`, `cms.forRequest(request)`) receive; `scoped` users and `isSystemAdmin()`; globals with a value per `scope`; `uniqueWithin` on any unique field, with a unique index per scope; and `admin.switcher`.
  
  The SEO plugin's sitemap and llms.txt read in the request's context (e.g. the tenant of the domain); `sitemap()`, `sitemapXml()`, `llmsTxt()` and `llmsFullTxt()` take a `context`.
  
  Projects with the nested-docs plugin get a unique index on `(parent, slug)`: create a migration (`easy-cms migrate:create`) before deploying.

### Patch Changes

- Updated dependencies [40bd4bc]
  - @easy-cms/core@0.44.0
