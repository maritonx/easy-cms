# @easy-cms/plugin-multi-tenant

## 0.48.0

### Minor Changes

- db47c50: Security changes that may need a step when you upgrade:
  
  - **SVG is no longer included in `image/*`** (it can carry scripts). To keep allowing it, list it: `upload.mimeTypes: ['image/*', 'image/svg+xml']`. After a direct upload, the type the storage serves the file with must be the one checked (S3 reports it).
  - **Users changing their own password or email send their current password** (`currentPassword`); the account page asks for it. Admins changing other users don't. Accounts without a password can't change their own email.
  - **Single sign-on no longer signs existing staff in by email** until they link the provider from their account page, unless the provider has `linkByEmail: true` (for providers whose emails your organization controls). Site members are still matched by email. `microsoft()` no longer uses the user principal name as an email.
  - **`trustProxy` takes the last `X-Forwarded-For` address** (the one your proxy added), not the first, which the client can write. On Vercel and Netlify the client IP is found without it; Nuxt uses the connection's address otherwise. A warning is logged in production when logins have no client IP.
  - **In production, a `secret` that looks like an example or a repeated pattern is refused.** The Next.js starter no longer falls back to a fixed secret in production: without `EASY_CMS_SECRET` (and without a database URL) it uses a random one per process and says so.
  - **Multi-tenant: the people of a tenant, its admins included, no longer change shared collections and globals** (those not listed in `collections`/`globals`). List the ones they may change in `editShared`. The deliveries page is for system admins only.

### Patch Changes

- Updated dependencies [db47c50]
  - @easy-cms/core@0.48.0

## 0.47.4

### Patch Changes

- 76e22e3: Security fixes:
  
  - Site members never read drafts, through any API (the Local API now applies the rule REST already had).
  - A sign-up for an account still waiting for its email takes the new password and sends a new link; signing in with a provider confirms such an account and drops the password set before. Email confirmation links work once.
  - Only system admins unlink someone else's single sign-on account.
  - Request bodies sent without a length are refused once past the limit, instead of being read whole first. Endpoints get `req.text()` for raw bodies (at most 1 MB).
  - Upload from URL also refuses IPv4 addresses inside IPv6 (NAT64, `::a.b.c.d`) that are private.
  - Shop: changing an order's status (paid, sent, cancelled, refunded) needs update access to the order.
  - Multi-tenant: a tenant's admins can't add site members or people with access to all tenants to it; adding someone who already has an account answers as for someone new and emails them.
- Updated dependencies [76e22e3]
  - @easy-cms/core@0.47.4

## 0.47.3

### Patch Changes

- b753c14: Security fix: site members (`auth.members`, such as shop customers) never get the rights of users with access to all tenants, whatever `publicReads` is, and see only their own user record. Update now if you use the multi-tenant plugin together with members.
- @easy-cms/core@0.47.3

## 0.47.2

### Patch Changes

- Updated dependencies [43833ab]
  - @easy-cms/core@0.47.2

## 0.47.1

### Patch Changes

- @easy-cms/core@0.47.1

## 0.47.0

### Minor Changes

- 203e359: The admin grows with your plugins. The menu has groups that fold, two levels deep (`admin.nav`, and `admin.group` on collections, globals and pages): Content, the media library, each plugin's group (Shop › Catalog, Sales, Customers; Forms) and Settings › Site, Users & access, System. Each person can fold groups, pin items and collapse the menu to icons. Badges show what needs attention (`admin.badge`, e.g. orders to send), and a **+** creates a document from the menu.
  
  ⌘K opens search and commands: go anywhere, create, find documents by title in every collection, reopen recent ones, and run commands, plugins' too (`admin.commands`). Shortcuts: ⌘S saves, ⌘⇧P publishes, `[` collapses the menu, `?` lists them.
  
  Edit pages take tabs, sections that fold and rows (`admin.layout`, by field name), help below fields (`admin.description`), widths (`admin.width`) and fields shown only when they apply (`admin.condition`, which the server reads too: a hidden field isn't required). A failed save lists what to fix and opens the right tab; unsaved changes are kept in the browser and offered back. The SEO plugin puts its fields in an SEO tab (`tab: false` keeps them below). Lists remember their filters and scroll, and say what a collection is for while empty (`admin.empty`).
  
  Configs keep working as they are; nothing changes in the database.

### Patch Changes

- Updated dependencies [203e359]
  - @easy-cms/core@0.47.0

## 0.46.0

### Minor Changes

- 6938928: A shop: `@easy-cms/plugin-ecommerce`. Products with variants and prices in several currencies, carts that guests keep too, checkout with Stripe (card, PromptPay) or bank transfer, orders made exactly once however often a payment is confirmed, stock taken safely and put back on cancel or refund, customer accounts, order emails, `order.*` events, a dashboard panel, and a client for pages with React hooks and Vue composables. With the multi-tenant plugin, each tenant is a shop of its own.
  
  New in the core, for other uses too: site members (`auth.members`) who sign in on the site and never get into the admin, with sign-up, email confirmation and the site's own pages for email links (`isLoggedIn` no longer counts them; `isSignedIn` does); `update()` with `where` (compare and set) and `cms.increment()`; `jobs` that run with the scheduled jobs; `events` and `cms.emit()` for webhooks; menu headings of your own (`admin.group` with a label); list cells get their row's `doc`; plugin collections are typed in configs without `collections`. The form builder's spam checks moved to the core (`formToken`, `checkFormToken`, `rateKeys`, `honeypotName`, `verifyTurnstile`).
  
  Signing up adds an `emailVerified` field to users: create a migration (`easy-cms migrate:create`) before deploying.

### Patch Changes

- Updated dependencies [6938928]
  - @easy-cms/core@0.46.0

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
