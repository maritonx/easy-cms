# @easy-cms/plugin-mcp

## 0.47.2

### Patch Changes

- 73a2ef0: Needs `@modelcontextprotocol/sdk` 1.31.0 or newer, which fixes an advisory where the OAuth client could send credentials to an authorization server chosen by the MCP server (GHSA-6qxp-vccf-f47h). The Next.js starter template now asks for Next.js 16.3.8 or newer.
- Updated dependencies [43833ab]
  - @easy-cms/core@0.47.2

## 0.47.1

### Patch Changes

- @easy-cms/core@0.47.1

## 0.47.0

### Patch Changes

- Updated dependencies [203e359]
  - @easy-cms/core@0.47.0

## 0.46.0

### Patch Changes

- Updated dependencies [6938928]
  - @easy-cms/core@0.46.0

## 0.45.0

### Patch Changes

- Updated dependencies [56a926b]
  - @easy-cms/core@0.45.0

## 0.44.0

### Patch Changes

- 40bd4bc: New plugin: `@easy-cms/plugin-multi-tenant`, several sites or clients in one CMS. A `tenants` collection, a `tenant` on the documents of the collections you name, members with a role in each tenant (Settings → Members), globals with a value per tenant, a tenant switcher in the admin, frontends that name their tenant by header, `?tenant=` or domain, API keys that keep their tenant, and `easy-cms tenants:assign`. New guide: Multi-tenant.
  
  The core gains what it is built on, for other uses too: `onRequest` in the config gives each request a `context` (and may change its user), which access rules, hooks, `filterOptions` and the Local API (`context`, `cms.forRequest(request)`) receive; `scoped` users and `isSystemAdmin()`; globals with a value per `scope`; `uniqueWithin` on any unique field, with a unique index per scope; and `admin.switcher`.
  
  The SEO plugin's sitemap and llms.txt read in the request's context (e.g. the tenant of the domain); `sitemap()`, `sitemapXml()`, `llmsTxt()` and `llmsFullTxt()` take a `context`.
  
  Projects with the nested-docs plugin get a unique index on `(parent, slug)`: create a migration (`easy-cms migrate:create`) before deploying.
- Updated dependencies [40bd4bc]
  - @easy-cms/core@0.44.0

## 0.43.0

### Patch Changes

- @easy-cms/core@0.43.0

## 0.42.0

### Patch Changes

- Updated dependencies [4afac22]
  - @easy-cms/core@0.42.0

## 0.41.0

### Patch Changes

- Updated dependencies [7a43c55]
  - @easy-cms/core@0.41.0

## 0.40.0

### Patch Changes

- Updated dependencies [e24dbd1]
  - @easy-cms/core@0.40.0

## 0.39.0

### Patch Changes

- Updated dependencies [72758f0]
  - @easy-cms/core@0.39.0

## 0.38.0

### Patch Changes

- Updated dependencies [5a71c12]
  - @easy-cms/core@0.38.0

## 0.37.2

### Patch Changes

- Updated dependencies [63f0116]
  - @easy-cms/core@0.37.2

## 0.37.1

### Patch Changes

- @easy-cms/core@0.37.1

## 0.37.0

### Patch Changes

- Updated dependencies [cbf800c]
  - @easy-cms/core@0.37.0

## 0.36.1

### Patch Changes

- @easy-cms/core@0.36.1

## 0.36.0

### Patch Changes

- Updated dependencies [7fbd37e]
  - @easy-cms/core@0.36.0

## 0.35.0

### Patch Changes

- Updated dependencies [892f6cf]
  - @easy-cms/core@0.35.0

## 0.34.0

### Patch Changes

- Updated dependencies [f3c65cd]
- Updated dependencies [3e33a26]
  - @easy-cms/core@0.34.0

## 0.33.0

### Patch Changes

- Updated dependencies [a26533e]
  - @easy-cms/core@0.33.0

## 0.32.0

### Patch Changes

- Updated dependencies [281435f]
  - @easy-cms/core@0.32.0

## 0.31.0

### Patch Changes

- Updated dependencies [36fc19b]
  - @easy-cms/core@0.31.0

## 0.30.0

### Patch Changes

- Updated dependencies [f9d5512]
  - @easy-cms/core@0.30.0

## 0.29.0

### Minor Changes

- 5e92063: The dashboard tells admins what needs attention, and what the system is.
  
  - **Needs attention** (admins only, shown only when something is wrong): webhook deliveries that failed in the last 7 days, emails waiting over an hour or failed, scheduled publishing over 10 minutes late (nothing calls `jobs/run`), no `email`, and no `serverURL` in production. Each links to the new Health checks guide.
  - **System** (admins only): the Easy CMS version, database, file storage, email adapter, plugins with their versions, and field types.
  - Both come from the new `GET <api>/admin/status`, for admins only. Easy CMS doesn't check for new versions.
  - **`definePlugin(plugin, { name, version })`** names a plugin for the dashboard; the official plugins name themselves. `EmailAdapter` gets an optional `name` (`smtp`, `console`). Core exports `VERSION`.
  - In development, the admin's HTML is read on each request, so a rebuilt admin shows up without a restart.

### Patch Changes

- Updated dependencies [5e92063]
  - @easy-cms/core@0.29.0

## 0.28.0

### Patch Changes

- Updated dependencies [479e17a]
  - @easy-cms/core@0.28.0

## 0.27.0

### Patch Changes

- Updated dependencies [ffa2f84]
  - @easy-cms/core@0.27.0

## 0.26.0

### Patch Changes

- Updated dependencies [bcf3c0c]
  - @easy-cms/core@0.26.0

## 0.25.0

### Patch Changes

- Updated dependencies [434599a]
  - @easy-cms/core@0.25.0

## 0.24.0

### Patch Changes

- Updated dependencies [230a347]
  - @easy-cms/core@0.24.0

## 0.23.0

### Minor Changes

- 0107902: Image galleries: upload fields with several files.
  
  - **`upload` with `hasMany: true`** keeps several files in the order editors arrange them, e.g. a gallery on a post. In the admin editors drop several files at once, pick several from the media library, drag them into order (or use the arrow buttons) and remove them. Reads return the media documents in order; it can be `localized`, and queries like `where: { gallery: { in: [id] } }` work. Needs a migration for the new field.
  - **`mimeTypes`** on upload fields, e.g. `['image/*']`: the media picker offers only those files, and saving refuses others ("must be an image").
  - **`minRows` / `maxRows`** on upload and relationship fields with `hasMany`.
  - An empty list now counts as fewer than `minRows` (arrays and blocks too); drafts may still be incomplete.

### Patch Changes

- Updated dependencies [0107902]
  - @easy-cms/core@0.23.0

## 0.22.2

### Patch Changes

- @easy-cms/core@0.22.2

## 0.22.1

### Patch Changes

- d742afc: Package READMEs: what each package does, how to install it with npm, pnpm, Yarn or Bun, a short example and links to its guide.
- Updated dependencies [d742afc]
  - @easy-cms/core@0.22.1

## 0.22.0

### Patch Changes

- Updated dependencies [63995c6]
  - @easy-cms/core@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies [0e69436]
  - @easy-cms/core@0.21.0

## 0.20.1

### Patch Changes

- @easy-cms/core@0.20.1

## 0.20.0

### Patch Changes

- Updated dependencies [b7564cb]
  - @easy-cms/core@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [34d5e66]
  - @easy-cms/core@0.19.0

## 0.18.0

### Patch Changes

- @easy-cms/core@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [0507a14]
  - @easy-cms/core@0.17.0

## 0.16.1

### Patch Changes

- Updated dependencies [8b14b83]
  - @easy-cms/core@0.16.1

## 0.16.0

### Minor Changes

- e6e4abb: New: `@easy-cms/plugin-mcp`, an MCP server (Streamable HTTP, stateless) at `<api>/mcp` for AI assistants such as Claude, Cursor and VS Code. Assistants connect with an API key and get tools for exactly what it allows: find, get, create, update, delete, publish, schedule and upload for each collection, and read, update and publish for globals. Collections with drafts are always saved as drafts; only the publish tool puts them live. Rich text accepts plain text, and uploads come as base64.

### Patch Changes

- @easy-cms/core@0.16.0
