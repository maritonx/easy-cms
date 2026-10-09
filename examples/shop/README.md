# Shop example

A shop on Next.js 16 with `@easy-cms/plugin-ecommerce`: products with sizes, a cart that guests
keep in the browser, checkout by bank transfer (and card or PromptPay with Stripe when its keys
are set), customer accounts, and orders in the admin.

```bash
cp .env.example .env        # then set EASY_CMS_SECRET (openssl rand -hex 32)
pnpm seed                   # an admin and three products in shop.db
pnpm dev
```

- Shop: http://localhost:3000. Pages use the React hooks of `@easy-cms/plugin-ecommerce/react`
  (`app/providers.tsx`, `useCart`, `usePayments`, `useCustomer`).
- Admin: http://localhost:3000/admin. Products, orders and the shop's numbers on the dashboard. An
  order paid by transfer waits until you press **Payment received**.
- Emails (order, sign-up) are printed in the terminal (`consoleEmail()`).

With Stripe keys in `.env`, checkout also offers card and PromptPay. Point a Stripe webhook at
`/api/cms/shop/payments/stripe/webhook` (`payment_intent.succeeded`, `payment_intent.payment_failed`)
so orders are made even when a customer closes the page.

See the [Shop guide](https://maritonx.github.io/easy-cms/guide/ecommerce).
