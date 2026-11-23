---
'@easy-cms/plugin-analytics': minor
'@easy-cms/plugin-ecommerce': minor
---

GA4 events in Tag Manager's `dataLayer` (ADR-0073), with no code on the site:

- `generate_lead` (with `form_id`) when an `<easy-form>` is sent.
- The shop's client pushes GA4 ecommerce events as the cart and checkout go: `add_to_cart` and `remove_from_cart` for every change to the cart, `begin_checkout`, and `purchase` once per order (the order number as `transaction_id`, also after a card payment's redirect), in the currency's main unit. `shop.viewItem(product)` sends `view_item`; `login` and `sign_up` are pushed too. `analytics: false` turns them off.
