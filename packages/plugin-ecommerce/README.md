# @easy-cms/plugin-ecommerce

A shop for Easy CMS: products with variants and prices in several currencies, carts that guests keep too, checkout with Stripe (card, PromptPay) or bank transfer, orders made exactly once, stock, customer accounts, order emails and events, and a client for pages with React hooks and Vue composables. Part of [Easy CMS](https://github.com/maritonx/easy-cms), the embedded, code-first headless CMS for Nuxt and Next.js.

## Install

```bash
npm install @easy-cms/plugin-ecommerce
```

Or `pnpm add`, `yarn add` or `bun add`. For Stripe, also install `stripe`.

## Usage

```ts
import { ecommercePlugin, manualAdapter } from '@easy-cms/plugin-ecommerce'
import { stripeAdapter } from '@easy-cms/plugin-ecommerce/stripe'

export default defineConfig({
  // …
  plugins: [
    ecommercePlugin({
      currencies: { supported: ['THB', 'USD'] },
      payments: {
        methods: [
          stripeAdapter({ secretKey: process.env.STRIPE_SECRET_KEY!, publishableKey: process.env.STRIPE_PUBLISHABLE_KEY! }),
          manualAdapter({ instructions: 'Transfer to Kasikorn Bank 123-4-56789-0' }),
        ],
      },
    }),
  ],
})
```

```tsx
'use client'
import { ShopProvider, useCart } from '@easy-cms/plugin-ecommerce/react'

function AddToCart({ product }: { product: number }) {
  const { addItem } = useCart()
  return <button onClick={() => addItem(product)}>Add to cart</button>
}
```

## Links

[Shop guide](https://maritonx.github.io/easy-cms/guide/ecommerce) · [Documentation](https://maritonx.github.io/easy-cms/) ([ภาษาไทย](https://maritonx.github.io/easy-cms/th/)) · [GitHub](https://github.com/maritonx/easy-cms)

MIT License
