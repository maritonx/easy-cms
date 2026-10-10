# Shop (ecommerce)

::: info What you'll learn
How to sell on your site: products with variants and prices in several currencies, a cart that
guests keep too, checkout with Stripe or a bank transfer, orders made exactly once, stock,
customer accounts, emails and events.

**Before this page:** [Plugins](./plugins), [Site members](./members) and [Access control](./access-control).
:::

::: warning Experimental
This plugin is experimental. It has the same version number as the rest of Easy CMS, but its
options, endpoints and data may still change in a minor release, after 1.0 too: it is not covered
by the [stability promise](./versioning#experimental). The changelog and the
[upgrade guide](./upgrading) say what changed.
:::

`@easy-cms/plugin-ecommerce` turns the CMS into a shop's back office, and gives your pages a cart
and checkout. Products and orders are managed in the admin; pages use the REST API through a
small client, with hooks for React and composables for Vue.

## Set it up

```bash [pm]
npm install @easy-cms/plugin-ecommerce
```

```ts
import { ecommercePlugin, manualAdapter } from '@easy-cms/plugin-ecommerce'
import { stripeAdapter } from '@easy-cms/plugin-ecommerce/stripe'

export default defineConfig({
  // …
  email: smtp({ /* … */ }), // order emails and sign-up links
  plugins: [
    ecommercePlugin({
      currencies: { supported: ['THB', 'USD'] }, // default ['THB']
      payments: {
        methods: [
          stripeAdapter({
            secretKey: process.env.STRIPE_SECRET_KEY!,
            publishableKey: process.env.STRIPE_PUBLISHABLE_KEY!,
            webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
          }),
          manualAdapter({
            instructions: {
              en: 'Transfer to Kasikorn Bank 123-4-56789-0, then reply with the slip.',
              th: 'โอนเข้าบัญชีกสิกรไทย 123-4-56789-0 แล้วตอบกลับพร้อมสลิป',
            },
          }),
        ],
      },
      emails: { notify: 'shop@example.com' },
    }),
  ],
})
```

Then create the database's changes: `npx easy-cms migrate:create shop`.

The plugin adds, under **Shop** in the admin's menu:

| Collection | |
|---|---|
| `products` | Name, slug, description, images, a price per currency, SKU, stock, option types. Drafts: only published products are for sale. |
| `variant-types`, `variant-options` | Option types (Size) and their options (M, L), shared by products. |
| `variants` | A product in one combination of options, with its own price (or the product's), SKU and stock. Named after its options. |
| `carts` | Customers' and guests' carts. |
| `addresses` | Customers' saved addresses. |
| `orders` | What was bought, at what price, by whom, where to, and how it was paid. |
| `transactions` | Payments, with what the payment provider returned. Staff only. |

It also adds a role `customer` for [site members](./members) who sign up on the site, a `price`
field type, a dashboard panel with sales and orders waiting, and the events below.

## Prices and currencies

Prices are whole numbers of the currency's smallest unit: `25000` is ฿250.00, `1999` is $19.99.
Each currency adds a price field, `priceInTHB`, `priceInUSD`; the admin shows them as money.
There are no exchange rates: set each currency's price yourself. A product without a price in a
cart's currency can't go in that cart.

Built in: `THB`, `USD`, `EUR`, `GBP`, `JPY` (no decimals). Others: `{ code, symbol, label, decimals }`.

```ts
import { formatPrice, CURRENCIES } from '@easy-cms/plugin-ecommerce'

formatPrice(123450, CURRENCIES.THB, 'th-TH') // ฿1,234.50
```

## Pages

Pages talk to the shop's endpoints with the client. In React (Next.js):

```tsx
'use client'
import { ShopProvider } from '@easy-cms/plugin-ecommerce/react'

export function Providers({ children }) {
  return <ShopProvider locale="th">{children}</ShopProvider>
}
```

```tsx
'use client'
import { useCart, useCurrency } from '@easy-cms/plugin-ecommerce/react'

export function AddToCart({ product, variant }) {
  const { addItem, busy } = useCart()
  return <button disabled={busy} onClick={() => addItem(product, { variant })}>Add to cart</button>
}

export function CartTotal() {
  const { cart } = useCart()
  const { formatPrice } = useCurrency()
  return <span>{formatPrice(cart?.total ?? 0)}</span>
}
```

In Vue (Nuxt), `app.use(shopPlugin())` in a client plugin, then the same names as composables:

```ts
import { shopPlugin } from '@easy-cms/plugin-ecommerce/vue'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(shopPlugin({ locale: 'th' }))
})
```

| Hook | |
|---|---|
| `useCart()` | `cart` (lines, `subtotal`, `adjustments`, `total`, `count`), `addItem`, `updateItem`, `incrementItem`, `decrementItem`, `removeItem`, `clearCart`, `busy` |
| `useCurrency()` | `currency`, `currencies`, `setCurrency`, `formatPrice` |
| `usePayments()` | `paymentMethods`, `checkout`, `confirm` |
| `useCustomer()` | `user`, `login`, `logout`, `signUp`, `verifyEmail`, `forgotPassword`, `resetPassword` |
| `useAddresses()` | The customer's `addresses`, `createAddress`, `updateAddress`, `deleteAddress` |
| `useOrders()` | The customer's `orders`, newest first |

Without a framework, `createShopClient()` from `@easy-cms/plugin-ecommerce/client` has the same
methods and `subscribe(listener)`. Product pages read products as any content, with the Local API
or `GET /api/cms/products`.

A guest's cart is remembered in `localStorage` (its id and a secret). When the guest signs in,
the cart joins their account's. Turn guests off with `carts: { allowGuests: false }`.

## Checkout

```ts
const { checkout, confirm } = usePayments()

const result = await checkout({
  method: 'stripe', // or 'bank-transfer'
  email: 'guest@example.com', // guests; customers use their account's
  shippingAddress: { name: 'Somchai', line1: '99 Sukhumvit', province: 'Bangkok', country: 'TH' },
  // or address: savedAddress.id
})
```

1. The shop checks the cart (prices, stock, still for sale), works out the total with your
   `totals`, and keeps it all on a new transaction.
2. The payment method starts the payment and returns what the page needs in `result.payment`.
3. **Bank transfer** (`manualAdapter`): the order is made now, `pending`, and
   `result.payment.instructions` tells the customer where to pay. Staff press **Payment
   received** on the order when the money arrives.
4. **Stripe**: `result.payment.clientSecret` goes to Stripe.js's Payment Element (card,
   PromptPay…). After paying, the page calls `confirm(result.transaction)`; the shop asks Stripe,
   and makes the order if the money is in. Only whoever paid may confirm: the signed-in customer,
   or the guest whose cart it was (the client sends the cart's secret); others get `404`.

An order is made **exactly once** however often it is confirmed: by the page, a retry, and
Stripe's webhook at the same moment. The first claims the transaction (an update that only
succeeds while it is still `pending`); the others get the same order. Set `webhookSecret` and
point a Stripe webhook at `/api/cms/shop/payments/stripe/webhook` (events
`payment_intent.succeeded`, `payment_intent.payment_failed`), so orders are made even when a
customer closes the page.

### Shipping, tax and discounts

`totals` adds lines to (or, negative, takes them off) the subtotal. It runs for the cart and
again at checkout, with the address:

```ts
ecommercePlugin({
  totals: ({ cart, currency, shippingAddress }) => {
    const lines = []
    if (cart.subtotal < 100_000) lines.push({ label: 'Shipping', amount: 5_000 })
    if (shippingAddress?.province === 'Bangkok') lines.push({ label: 'Same-day', amount: 3_000 })
    return lines
  },
})
```

The order keeps these lines as they were.

## Orders

| Status | |
|---|---|
| `pending` | Waiting for payment (bank transfer). |
| `paid` | Paid, to be sent. |
| `fulfilled` | Sent or handed over. |
| `cancelled` | Called off before payment; items go back in stock. |
| `refunded` | Money given back (Stripe refunds it); items go back in stock. |

Staff change the status with the buttons on the order (**Payment received**, **Mark as sent**,
**Cancel order**, **Refund**), or `POST /api/cms/shop/orders/:id/:status`. Orders keep each line
as bought (title, SKU, price), so changing or deleting a product later doesn't change them.
Order numbers count up from `1001`; `orders: { number: (n) => \`A-${n}\` }` makes your own.

Customers see their own orders: `GET /api/cms/orders` (or `useOrders()`).

## Stock

With `inventory` (on by default), products and variants have **In stock**: empty means not
counted. Stock is checked when an item goes in the cart and at checkout, and taken when the
order is made, in one database statement so two buyers can't take the last one. If it ran out
while a customer paid, the order is still made (the money is in) and marked **Not enough
stock**. Cancelled and refunded orders put their items back.

## Emails and events

With [email](./email) set up, customers get an email when an order is made (with the bank
transfer instructions) and when a transfer is marked received; `emails.notify` gets new orders.
Each takes your own function, or `false`.

[Webhooks](./webhooks) can listen to the shop's events: `order.created`, `order.paid`,
`order.fulfilled`, `order.cancelled`, `order.refunded`, e.g. for a warehouse or an accounting
system:

```ts
webhooks: [{ url: 'https://erp.example.com/hook', events: ['order.paid'], secret }],
```

## Several shops

With the [multi-tenant plugin](./multi-tenant), each tenant is a shop of its own: list the
shop's collections, and add `multiTenantPlugin` after it.

```ts
import { ecommercePlugin, SHOP_COLLECTIONS } from '@easy-cms/plugin-ecommerce'

plugins: [
  ecommercePlugin({ /* … */ }),
  multiTenantPlugin({ collections: [...SHOP_COLLECTIONS, 'media'] }),
]
```

Products, carts and orders belong to the tenant of the site's domain; order numbers count per
tenant. A customer's account works on every tenant's site, and each site shows its own orders.
One Stripe account serves all tenants.

## Your own payment method

A payment adapter starts a payment, says whether it went through, and may refund it:

```ts
import { definePaymentAdapter, paymentSucceeded } from '@easy-cms/plugin-ecommerce'

export const omise = definePaymentAdapter({
  name: 'omise',
  label: { en: 'Card', th: 'บัตร' },
  async initiate({ transaction }) {
    const charge = await createCharge(transaction.amount, transaction.currency)
    return { reference: charge.id, data: { charge: charge.id }, client: { authorizeUri: charge.authorize_uri } }
  },
  async confirm({ transaction }) {
    const charge = await getCharge(transaction.data.charge)
    return charge.paid ? 'succeeded' : charge.status === 'failed' ? 'failed' : 'processing'
  },
  async refund({ transaction }) { /* … */ },
  // Served at /api/cms/shop/payments/omise/webhook
  endpoints: [{ path: '/webhook', method: 'post', handler: async (req) => {
    const event = await req.json() // check its signature first
    await paymentSucceeded(event.data.id)
    return { ok: true }
  } }],
})
```

Never trust the page: `confirm` must ask the provider.

## Options

| Option | Default | |
|---|---|---|
| `payments.methods` | — | **Required**. `stripeAdapter()`, `manualAdapter()`, your own. |
| `currencies.supported` | `['THB']` | Currency codes or `{ code, symbol, label, decimals }`. |
| `currencies.default` | the first | For new carts. |
| `products.variants` | `true` | Option types and variants. |
| `products.fields` | `[]` | More product fields. |
| `inventory` | `true` | Count stock. |
| `carts.allowGuests` | `true` | Guests can shop and pay. |
| `carts.guestCartDays` | `30` | Guests' unused carts are deleted after this. |
| `addresses.supportedCountries` | `['TH']` | Countries the shop sends to. |
| `addresses.fields` | Thai address | Name, phone, address lines, sub-district, district, province, postal code, country. |
| `customers.role` | `customer` | The role of customers' accounts. |
| `customers.signUp` | `true` | Visitors create accounts (`false` for none, or Turnstile keys). |
| `customers.pages` | — | The site's pages for email links ([Site members](./members)). |
| `totals` | — | Shipping, tax and discounts. |
| `orders.number` | `1000 + n` | Order numbers. |
| `emails` | — | `orderConfirmation`, `paymentReceived`, `newOrder`: functions or `false`; `notify`. |
| `overrides` | — | `{ products: (c) => ({ ...c, … }) }` to change a collection. |
| `group` | Shop / ร้านค้า | The label of the shop's menu group (`shop`, with Catalog, Sales and Customers). |

Not yet: Omise and other providers out of the box, Stripe Checkout (Stripe's page), reserving
stock while paying, ready-made shipping rates, VAT and coupons, subscriptions, and a Stripe
account per tenant.

## Next steps

- [Site members](./members): customers' accounts, sign-up and email links.
- [Webhooks](./webhooks): tell other systems about orders.
- The shop example: `examples/shop` (Next.js).
