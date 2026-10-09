# @easy-cms/plugin-ecommerce

## 0.47.3

### Patch Changes

- @easy-cms/core@0.47.3

## 0.47.2

### Patch Changes

- Updated dependencies [43833ab]
  - @easy-cms/core@0.47.2

## 0.47.1

### Patch Changes

- c07d5e9: Republished so its peer dependency on `@easy-cms/core` is a version range: 0.45.0 and 0.47.0 went out with `workspace:^` and can't be installed.
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
