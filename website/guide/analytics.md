# Analytics & consent

::: info What you'll learn
Add Google Tag Manager to your site from the admin, ask visitors for consent the way PDPA and
GDPR expect (Consent Mode v2), and keep proof of their choice.

**Before this page:** [Plugins](./plugins).
:::

::: warning Experimental
This plugin is experimental. It has the same version number as the rest of Easy CMS, but its
options, endpoints and data may still change in a minor release, after 1.0 too: it is not covered
by the [stability promise](./versioning#experimental). The changelog and the
[upgrade guide](./upgrading) say what changed.
:::

`@easy-cms/plugin-analytics` puts Google Tag Manager on your pages with one script, set up in
**Settings → Analytics & consent**. Marketing can change the container or the banner's text
without a deploy, and tags only fire once visitors agree.

```bash [pm]
npm install @easy-cms/plugin-analytics
```

```ts
import { defineConfig } from '@easy-cms/core'
import { analyticsPlugin } from '@easy-cms/plugin-analytics'

export default defineConfig({
  // …
  plugins: [analyticsPlugin({ defaults: { gtm: process.env.GTM_ID } })],
})
```

`defaults.gtm` is used until an admin saves the settings; leave it out to set the container in the
admin only.

## Add the script to your pages {#the-script}

Everything runs from one script the API serves, `<api>/analytics.js`. It sets the consent
defaults, shows the banner, loads Tag Manager and defines `easyConsent` and `easyAnalytics`.

::: code-group

```ts [Nuxt]
// Nothing to do: the module adds the script to every page when the plugin is installed.
```

```tsx [Next.js: app/layout.tsx]
import { EasyAnalytics } from '@easy-cms/next/analytics'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <EasyAnalytics />
      </body>
    </html>
  )
}
```

```html [Any other site]
<script src="https://cms.example.com/api/cms/analytics.js" async></script>
```

:::

Changes in the admin reach pages within a minute (the script is cached for 60 seconds).

**Never in the admin or previews.** In the admin's live preview, and on pages opened with
`?preview=`, the script loads nothing: editors' visits never show up in your reports.

## Settings {#settings}

**Settings → Analytics & consent** holds:

| Setting | |
|---|---|
| Google Tag Manager container | `GTM-XXXXXXX`. Empty: no Tag Manager; the banner and `dataLayer` still work |
| Show the consent banner | Off when you use your own consent tool (see below) |
| Banner title, text | Empty: the built-in text, in English or Thai to match the page |
| Privacy policy page | Linked from the banner, e.g. `/privacy` |
| Ask for consent | Everywhere (recommended), or only in the EU/EEA, UK, Switzerland and Thailand |
| Keep consent records, for (days) | See [Consent records](#consent-records). Default on, 730 days |

With [localization](./localization), the title, text and privacy page have a value per language.
With [multi-tenant](./multi-tenant), list `analytics` in the plugin's `globals` and
`consent-records` in its `collections`: each site has its own container, banner and records.

## Consent {#consent}

The script uses Google's [Consent Mode v2](https://developers.google.com/tag-platform/security/guides/consent):
everything is **denied** until the visitor chooses, so Google tags send no cookies before then.

| In the banner | Consent Mode |
|---|---|
| Necessary (always on) | none: remembering the choice |
| Analytics | `analytics_storage` |
| Marketing | `ad_storage`, `ad_user_data`, `ad_personalization` |

The banner has **Accept all** and **Reject all** side by side, of the same weight, and **Settings**
to choose per category. The choice is kept for 12 months in a first-party cookie, `easy_consent`.
Changing the banner's title, text or privacy page asks everyone again.

Let visitors change their mind with any element marked `data-easy-consent`, e.g. in the footer:

```html
<a href="#" data-easy-consent>Cookie settings</a>
```

The banner takes your colors from CSS variables: `--easy-consent-accent`, `--easy-consent-bg` and
`--easy-consent-fg`.

### Your own consent tool {#own-consent-tool}

Using Cookiebot, OneTrust or your own banner? Turn **Show the consent banner** off. The defaults
stay denied, and your tool grants consent with `gtag('consent', 'update', …)`, which most do
already, or with:

```js
window.easyConsent.set({ analytics: true, marketing: false })
window.easyConsent.get() // { analytics: true, marketing: false }, or null before a choice
```

## Consent records {#consent-records}

PDPA and GDPR ask you to show that a visitor agreed. Each choice is kept in **Consent records**:
a random ID (the one in the visitor's cookie), the categories, the banner's version and the time.
No IP address and nothing that names the person. Admins can read them; nobody can edit them. They
are deleted after the days set in the settings.

## Events {#events}

Easy CMS pushes events to Tag Manager's `dataLayer` with
[GA4's names](https://developers.google.com/analytics/devguides/collection/ga4/reference/events),
so a GA4 tag in Tag Manager picks them up with no code on your site. Consent Mode decides what the
tags then send.

| Event | When | Data |
|---|---|---|
| `generate_lead` | An [`<easy-form>`](./forms) is sent | `form_id`: the form's slug |
| `login`, `sign_up` | A customer signs in or signs up with the [shop's client](./ecommerce) | `method: 'email'` |
| `view_item` | `shop.viewItem(product)` on a product page | `ecommerce`: the product, its price |
| `add_to_cart`, `remove_from_cart` | The cart changes: add, quantity up or down, remove, clear | `ecommerce`: what changed |
| `begin_checkout` | `shop.checkout()` | `ecommerce`: the cart |
| `purchase` | An order is placed (`checkout()` for a bank transfer, `confirm()` after a card); not with [GA4 from the server](#server-purchases) | `ecommerce`: `transaction_id` (the order number), the cart |
| `easy_consent` | A visitor chooses in the banner | `consent: { analytics, marketing }` |

Shop events carry `currency`, `value` and `items` (`item_id`, `item_name`, `item_variant`, `price`,
`quantity`) in the currency's main unit (baht, not satang). `purchase` is sent once per order,
also when a card payment comes back from the bank. Turn the shop's events off with
`createShopClient({ analytics: false })` (or the same option on `ShopProvider` and `provideShop`).

Push your own, e.g. a search or a sign-up on your own form:

```js
window.easyAnalytics.track('search', { search_term: query })
window.easyAnalytics.track('sign_up', { method: 'email' })
```

## Purchases from the server {#server-purchases}

The page reports a purchase when the order is placed, before a bank transfer is paid, and only if
Tag Manager loads. Connect **Google Analytics 4** in Settings → Integrations (Analytics) to have the
server send it instead, through GA4's
[Measurement Protocol](https://developers.google.com/analytics/devguides/collection/protocol/ga4),
when the money arrives:

| Integration field | Where |
|---|---|
| Measurement ID | Google Analytics → Admin → Data streams → your web stream (`G-…`) |
| API secret | The same stream → Measurement Protocol API secrets → Create |

**Test** checks both with GA4's validation server. Or set `GA4_MEASUREMENT_ID` and
`GA4_API_SECRET`.

Then:

- At checkout, the shop's client sends the Google Analytics IDs from the `_ga` cookies (client and
  session), with the customer's consent. They are kept on the order, read by staff only, and only
  when the customer agreed to **Analytics**; otherwise nothing is kept and nothing is sent.
- When the order is paid (`order.paid`: a card payment confirmed, a transfer marked received),
  the server sends `purchase`; when it is refunded, `refund`. Once per order, with the order number
  as `transaction_id`, in the currency's main unit. `ad_user_data` and `ad_personalization` follow
  the customer's **Marketing** choice.
- The page stops pushing its own `purchase`, so it isn't counted twice. The cart and checkout
  events stay.
- A hit Google doesn't take (a network error, a 5xx) is tried again after 1, 5 and 30 minutes
  by the `analytics:ga4` job; after that the integration shows the error.

## Content Security Policy {#csp}

If your site sends a Content Security Policy, allow Tag Manager, and anything your tags load:

```
script-src 'self' https://www.googletagmanager.com;
```

## Next steps

- [SEO](./seo): meta tags, sitemaps and structured data for the same pages
- [Forms](./forms): forms in the admin, with spam protection
