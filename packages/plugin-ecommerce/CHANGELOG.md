# @easy-cms/plugin-ecommerce

## 0.46.0

### Minor Changes

- 6938928: A shop: `@easy-cms/plugin-ecommerce`. Products with variants and prices in several currencies, carts that guests keep too, checkout with Stripe (card, PromptPay) or bank transfer, orders made exactly once however often a payment is confirmed, stock taken safely and put back on cancel or refund, customer accounts, order emails, `order.*` events, a dashboard panel, and a client for pages with React hooks and Vue composables. With the multi-tenant plugin, each tenant is a shop of its own.
  
  New in the core, for other uses too: site members (`auth.members`) who sign in on the site and never get into the admin, with sign-up, email confirmation and the site's own pages for email links (`isLoggedIn` no longer counts them; `isSignedIn` does); `update()` with `where` (compare and set) and `cms.increment()`; `jobs` that run with the scheduled jobs; `events` and `cms.emit()` for webhooks; menu headings of your own (`admin.group` with a label); list cells get their row's `doc`; plugin collections are typed in configs without `collections`. The form builder's spam checks moved to the core (`formToken`, `checkFormToken`, `rateKeys`, `honeypotName`, `verifyTurnstile`).
  
  Signing up adds an `emailVerified` field to users: create a migration (`easy-cms migrate:create`) before deploying.

### Patch Changes

- Updated dependencies [6938928]
  - @easy-cms/core@0.46.0
