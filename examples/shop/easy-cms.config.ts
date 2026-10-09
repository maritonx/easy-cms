import { consoleEmail, defineConfig } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { ecommercePlugin, manualAdapter } from '@easy-cms/plugin-ecommerce'
import { stripeAdapter } from '@easy-cms/plugin-ecommerce/stripe'

/** Card and PromptPay through Stripe, when its keys are set. */
const stripe = process.env.STRIPE_SECRET_KEY
  ? [
      stripeAdapter({
        secretKey: process.env.STRIPE_SECRET_KEY,
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? '',
        ...(process.env.STRIPE_WEBHOOK_SECRET
          ? { webhookSecret: process.env.STRIPE_WEBHOOK_SECRET }
          : {}),
      }),
    ]
  : []

export default defineConfig({
  secret: process.env.EASY_CMS_SECRET ?? '',
  db: sqlite({ url: process.env.DATABASE_URL ?? 'file:./shop.db' }),
  admin: { locale: 'th', siteURL: '/' },
  // Order and sign-up emails are printed in the terminal; use smtp() from @easy-cms/email-smtp.
  email: consoleEmail(),
  plugins: [
    ecommercePlugin({
      currencies: { supported: ['THB', 'USD'] },
      payments: {
        methods: [
          ...stripe,
          manualAdapter({
            instructions: {
              en: 'Transfer the total to Kasikorn Bank 123-4-56789-0 (Easy Shop), then reply to the order email with the slip.',
              th: 'โอนยอดรวมเข้าบัญชีกสิกรไทย 123-4-56789-0 (Easy Shop) แล้วตอบกลับอีเมลคำสั่งซื้อพร้อมสลิป',
            },
          }),
        ],
      },
      // ฿50 shipping, free from ฿1,000; $5 abroad.
      totals: ({ cart, currency }) => {
        if (currency.code === 'USD') return [{ label: 'Shipping', amount: 500 }]
        return cart.subtotal >= 100_000 ? [] : [{ label: 'Shipping', amount: 5_000 }]
      },
      customers: { pages: { verifyEmail: '/account/verify', resetPassword: '/account/reset' } },
      emails: { notify: 'shop@example.com' },
    }),
  ],
})
