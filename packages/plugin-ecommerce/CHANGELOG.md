# @easy-cms/plugin-ecommerce

## 1.15.0

### Patch Changes

- Updated dependencies [fed09f5]
  - @easy-cms/core@1.15.0

## 1.14.0

### Patch Changes

- @easy-cms/core@1.14.0

## 1.13.0

### Patch Changes

- @easy-cms/core@1.13.0

## 1.12.0

### Patch Changes

- Updated dependencies [6aaad95]
  - @easy-cms/core@1.12.0

## 1.11.0

### Patch Changes

- Updated dependencies [0cd7227]
  - @easy-cms/core@1.11.0

## 1.10.0

### Patch Changes

- Updated dependencies [4007cfe]
  - @easy-cms/core@1.10.0

## 1.9.0

### Patch Changes

- Updated dependencies [15a201a]
  - @easy-cms/core@1.9.0

## 1.8.0

### Patch Changes

- Updated dependencies [26fa06b]
  - @easy-cms/core@1.8.0

## 1.7.1

### Patch Changes

- @easy-cms/core@1.7.1

## 1.7.0

### Patch Changes

- Updated dependencies [1bd5e2d]
  - @easy-cms/core@1.7.0

## 1.6.0

### Patch Changes

- 35d25ea: JSON logs and request ids. `logs: { format: 'json' }` (or `EASY_CMS_LOG_FORMAT=json`) writes one JSON object per line: `time`, `level`, `message`, the `requestId`, and `error` with its stack. Every API response has an `X-Request-Id` header, keeping a plain one from the load balancer, and with JSON logs every request gets a line with method, path, status and duration (`logs.requests: false` turns that off). Each run of the background jobs logs with its own `runId`. `easy-cms serve` follows the setting. The `Logger` methods take optional details, and `jsonLogger()` is exported; the readable default prints an error's stack under its line.
- Updated dependencies [35d25ea]
  - @easy-cms/core@1.6.0

## 1.5.0

### Patch Changes

- @easy-cms/core@1.5.0

## 1.4.3

### Patch Changes

- @easy-cms/core@1.4.3

## 1.4.2

### Patch Changes

- Updated dependencies [e34f015]
  - @easy-cms/core@1.4.2

## 1.4.1

### Patch Changes

- Updated dependencies [2d3425d]
  - @easy-cms/core@1.4.1

## 1.4.0

### Patch Changes

- Updated dependencies [234a6ae]
  - @easy-cms/core@1.4.0

## 1.3.0

### Patch Changes

- Updated dependencies [c16df9c]
  - @easy-cms/core@1.3.0

## 1.2.1

### Patch Changes

- Updated dependencies [b7657fe]
  - @easy-cms/core@1.2.1

## 1.2.0

### Patch Changes

- @easy-cms/core@1.2.0

## 1.1.0

### Minor Changes

- e470c2a: The shop's scheduled jobs now check pending payments with their provider: a payment still pending a few minutes after checkout is confirmed with the adapter's `confirm`, and gets its order if the money is in, for when the page was closed and no webhook came (or a provider doesn't retry webhooks). `expiresIn` now applies to every payment adapter, not only manual ones: past it, a payment that didn't go through is marked `failed` ("expired"); if it is paid later, the order is still made. Without `expiresIn`, payments are checked for a day.

### Patch Changes

- @easy-cms/core@1.1.0

## 1.0.1

### Patch Changes

- Updated dependencies [d7ce392]
  - @easy-cms/core@1.0.1

## 1.0.0

### Patch Changes

- Updated dependencies [0e7d00a]
  - @easy-cms/core@1.0.0

## 1.0.0-rc.0

### Patch Changes

- Updated dependencies [0e7d00a]
  - @easy-cms/core@1.0.0-rc.0

## 0.68.5

### Patch Changes

- @easy-cms/core@0.68.5

## 0.68.4

### Patch Changes

- 37bff8f: `useAddresses()` (React and Vue) no longer leaves an unhandled promise rejection when the addresses can't load as the customer signs in or out, e.g. with an expired session: the list stays empty. Calling `reload()` still throws. The React hooks and Vue composables now have tests.
- @easy-cms/core@0.68.4

## 0.68.3

### Patch Changes

- 53d40e1: `stripeAdapter({ clientConfig })` passes more settings to the Stripe client the adapter makes, e.g. `{ maxNetworkRetries: 2 }`, or the host and port of stripe-mock in tests.
- @easy-cms/core@0.68.3

## 0.68.2

### Patch Changes

- @easy-cms/core@0.68.2

## 0.68.1

### Patch Changes

- @easy-cms/core@0.68.1

## 0.68.0

### Patch Changes

- @easy-cms/core@0.68.0

## 0.67.2

### Patch Changes

- ee1c5c1: The Stripe adapter asks for a fixed Stripe API version, `STRIPE_API_VERSION` (`2026-09-30.endive`), instead of the default of whichever `stripe` package is installed, so upgrading the package no longer changes Stripe's answers under a shop. `stripeAdapter({ apiVersion })` picks another. The `stripe` peer range is now 17 to 23, the majors that are tested; create the webhook endpoint in Stripe with the same API version. With `stripe` 17 to 22 installed, a shop now talks to this newer API version; the fields the adapter uses are the same in both.
- @easy-cms/core@0.67.2

## 0.67.1

### Patch Changes

- 34731ed: Payment methods are named in the page's language: `GET <api>/shop/config?locale=th` (the shop client sends its `locale`) gives `โอนเงิน` instead of `Bank transfer`. Found testing the shop end to end with Stripe in test mode (#69).
- @easy-cms/core@0.67.1

## 0.67.0

### Patch Changes

- Updated dependencies [5742428]
  - @easy-cms/core@0.67.0

## 0.66.1

### Patch Changes

- @easy-cms/core@0.66.1

## 0.66.0

### Patch Changes

- Updated dependencies [b5390b6]
  - @easy-cms/core@0.66.0

## 0.65.0

### Minor Changes

- 0d4d401: Unpaid manual orders (bank transfer) are cancelled after 3 days and their stock put back, so unpaid orders don't hold stock (#100). `manualAdapter({ expiresIn })` sets the seconds, or `false` to wait for staff (e.g. cash on delivery). Orders get an `expiresAt` field: run `easy-cms migrate:create` in production. Orders made before the upgrade aren't affected.

### Patch Changes

- Updated dependencies [eb1dd41]
  - @easy-cms/core@0.65.0

## 0.64.0

### Patch Changes

- Updated dependencies [42b3c86]
  - @easy-cms/core@0.64.0

## 0.63.0

### Minor Changes

- 1ea78b2: Access checks (#98):
  
  - Updating or deleting a document the user may not read answers `404`, as for an id that doesn't exist; one they may read but not change still answers `403`.
  - Preview links from the admin read with the access of whoever made them (`createPreviewToken(target, { user })`); they stop working when that user is deactivated.
  - `<api>/admin/ui/media-usage` counts only documents the user may read (`cms.mediaUsage(ids, access)`).
  - Shop: `POST <api>/shop/confirm` is only for whoever paid: the customer, or the guest with the cart's secret (the client sends it); others get `404`.

### Patch Changes

- Updated dependencies [1ea78b2]
  - @easy-cms/core@0.63.0

## 0.62.0

### Patch Changes

- Updated dependencies [3530913]
  - @easy-cms/core@0.62.0

## 0.61.0

### Patch Changes

- Updated dependencies [3a8422c]
  - @easy-cms/core@0.61.0

## 0.60.0

The same code as 0.49.0, released as 0.60.0 to match the [roadmap](https://github.com/maritonx/easy-cms/blob/main/docs/ROADMAP.md):
the names and shapes for 1.0. See the [upgrade guide](https://easy-cms-website.vercel.app/docs/upgrading).

## 0.49.0

### Patch Changes

- Updated dependencies [ee496b4]
  - @easy-cms/core@0.49.0

## 0.48.0

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
