# ร้านค้า (ecommerce)

::: info สิ่งที่จะได้เรียนรู้
วิธีขายของบนเว็บ: สินค้าที่มีตัวเลือกและราคาหลายสกุลเงิน ตะกร้าที่ผู้เยี่ยมชมใช้ได้ด้วย ชำระเงินผ่าน Stripe
หรือโอนเงิน คำสั่งซื้อที่สร้างครั้งเดียวแน่นอน สต็อก บัญชีลูกค้า อีเมล และ event

**อ่านก่อนหน้านี้:** [Plugins](./plugins), [สมาชิกของเว็บ](./members) และ [การควบคุมสิทธิ์](./access-control)
:::

`@easy-cms/plugin-ecommerce` ทำให้ CMS เป็นหลังร้าน และให้หน้าเว็บมีตะกร้ากับหน้าชำระเงิน สินค้าและคำสั่งซื้อ
จัดการในระบบจัดการ ส่วนหน้าเว็บเรียก REST API ผ่าน client ตัวเล็ก ๆ ที่มี hook สำหรับ React และ composable
สำหรับ Vue

## ติดตั้ง {#set-it-up}

```bash [pm]
npm install @easy-cms/plugin-ecommerce
```

```ts
import { ecommercePlugin, manualAdapter } from '@easy-cms/plugin-ecommerce'
import { stripeAdapter } from '@easy-cms/plugin-ecommerce/stripe'

export default defineConfig({
  // …
  email: smtp({ /* … */ }), // อีเมลคำสั่งซื้อและลิงก์สมัครสมาชิก
  plugins: [
    ecommercePlugin({
      currencies: { supported: ['THB', 'USD'] }, // ค่าเริ่มต้น ['THB']
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

จากนั้นสร้างการเปลี่ยนแปลงของฐานข้อมูล: `npx easy-cms migrate:create shop`

plugin เพิ่มเมนูกลุ่ม **ร้านค้า** ในระบบจัดการ:

| Collection | |
|---|---|
| `products` | ชื่อ slug รายละเอียด รูป ราคาต่อสกุลเงิน SKU สต็อก ประเภทตัวเลือก มีฉบับร่าง: ขายเฉพาะสินค้าที่เผยแพร่แล้ว |
| `variant-types`, `variant-options` | ประเภทตัวเลือก (ขนาด) และตัวเลือก (M, L) ใช้ร่วมกันได้หลายสินค้า |
| `variants` | สินค้าในตัวเลือกชุดหนึ่ง มีราคา (หรือใช้ราคาสินค้า) SKU และสต็อกของตัวเอง ตั้งชื่อตามตัวเลือก |
| `carts` | ตะกร้าของลูกค้าและผู้เยี่ยมชม |
| `addresses` | ที่อยู่ที่ลูกค้าบันทึกไว้ |
| `orders` | สิ่งที่ซื้อ ราคา ผู้ซื้อ ที่อยู่จัดส่ง และวิธีชำระเงิน |
| `transactions` | การชำระเงินและข้อมูลจากผู้ให้บริการ เฉพาะเจ้าหน้าที่ |

และเพิ่ม role `customer` สำหรับ[สมาชิกของเว็บ](./members)ที่สมัครเอง field ชนิด `price` แผงยอดขายและคำสั่งซื้อที่รอ
บนแดชบอร์ด และ event ด้านล่าง

## ราคาและสกุลเงิน {#prices-and-currencies}

ราคาเป็นจำนวนเต็มในหน่วยย่อยที่สุดของสกุลเงิน: `25000` คือ ฿250.00, `1999` คือ $19.99 แต่ละสกุลเงินเพิ่ม field
ราคาหนึ่งช่อง `priceInTHB`, `priceInUSD` ระบบจัดการแสดงเป็นเงิน ไม่มีการแปลงค่าเงิน: ตั้งราคาแต่ละสกุลเอง สินค้าที่ไม่มี
ราคาในสกุลเงินของตะกร้าใส่ตะกร้านั้นไม่ได้

มีให้: `THB`, `USD`, `EUR`, `GBP`, `JPY` (ไม่มีทศนิยม) สกุลอื่น: `{ code, symbol, label, decimals }`

```ts
import { formatPrice, CURRENCIES } from '@easy-cms/plugin-ecommerce'

formatPrice(123450, CURRENCIES.THB, 'th-TH') // ฿1,234.50
```

## หน้าเว็บ {#pages}

หน้าเว็บคุยกับ endpoint ของร้านผ่าน client ใน React (Next.js):

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
  return <button disabled={busy} onClick={() => addItem(product, { variant })}>ใส่ตะกร้า</button>
}

export function CartTotal() {
  const { cart } = useCart()
  const { formatPrice } = useCurrency()
  return <span>{formatPrice(cart?.total ?? 0)}</span>
}
```

ใน Vue (Nuxt) ใช้ `app.use(shopPlugin())` ใน client plugin แล้วเรียก composable ชื่อเดียวกัน:

```ts
import { shopPlugin } from '@easy-cms/plugin-ecommerce/vue'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(shopPlugin({ locale: 'th' }))
})
```

| Hook | |
|---|---|
| `useCart()` | `cart` (รายการ, `subtotal`, `adjustments`, `total`, `count`), `addItem`, `updateItem`, `incrementItem`, `decrementItem`, `removeItem`, `clearCart`, `busy` |
| `useCurrency()` | `currency`, `currencies`, `setCurrency`, `formatPrice` |
| `usePayments()` | `paymentMethods`, `checkout`, `confirm` |
| `useCustomer()` | `user`, `login`, `logout`, `signUp`, `verifyEmail`, `forgotPassword`, `resetPassword` |
| `useAddresses()` | `addresses` ของลูกค้า, `createAddress`, `updateAddress`, `deleteAddress` |
| `useOrders()` | `orders` ของลูกค้า ล่าสุดก่อน |

ถ้าไม่ใช้ framework ใช้ `createShopClient()` จาก `@easy-cms/plugin-ecommerce/client` ซึ่งมีเมธอดเดียวกันและ
`subscribe(listener)` หน้าสินค้าอ่านสินค้าเหมือนเนื้อหาอื่น ด้วย Local API หรือ `GET /api/cms/products`

ตะกร้าของผู้เยี่ยมชมจำไว้ใน `localStorage` (id และรหัสลับ) เมื่อล็อกอิน ตะกร้าจะรวมเข้ากับบัญชี ปิดการซื้อแบบไม่ล็อกอินได้ด้วย
`carts: { allowGuests: false }`

## ชำระเงิน {#checkout}

```ts
const { checkout, confirm } = usePayments()

const result = await checkout({
  method: 'stripe', // หรือ 'bank-transfer'
  email: 'guest@example.com', // ผู้เยี่ยมชม ส่วนลูกค้าใช้อีเมลของบัญชี
  shippingAddress: { name: 'สมชาย', line1: '99 ถนนสุขุมวิท', province: 'กรุงเทพฯ', country: 'TH' },
  // หรือ address: savedAddress.id
})
```

1. ร้านตรวจตะกร้า (ราคา สต็อก ยังขายอยู่) คำนวณยอดรวมด้วย `totals` ของคุณ แล้วเก็บทั้งหมดไว้ใน transaction ใหม่
2. วิธีชำระเงินเริ่มการชำระ และส่งสิ่งที่หน้าเว็บต้องใช้มาใน `result.payment`
3. **โอนเงิน** (`manualAdapter`): สร้างคำสั่งซื้อทันทีเป็น `pending` และ `result.payment.instructions` บอกลูกค้าว่าโอนที่ไหน
   เจ้าหน้าที่กด **ได้รับเงินแล้ว** ในคำสั่งซื้อเมื่อเงินเข้า
4. **Stripe**: ส่ง `result.payment.clientSecret` ให้ Payment Element ของ Stripe.js (บัตร พร้อมเพย์…) หลังจ่าย หน้าเว็บเรียก
   `confirm(result.transaction)` ร้านถาม Stripe และสร้างคำสั่งซื้อเมื่อได้เงินแล้ว

คำสั่งซื้อถูกสร้าง**ครั้งเดียวแน่นอน** ไม่ว่าจะยืนยันกี่ครั้ง: จากหน้าเว็บ การลองใหม่ และ webhook ของ Stripe พร้อมกัน
ครั้งแรกจะจอง transaction ไว้ (update ที่สำเร็จเฉพาะตอนยังเป็น `pending`) ครั้งอื่นได้คำสั่งซื้อเดิม ตั้ง `webhookSecret`
และชี้ webhook ของ Stripe มาที่ `/api/cms/shop/payments/stripe/webhook` (event `payment_intent.succeeded`,
`payment_intent.payment_failed`) เพื่อให้มีคำสั่งซื้อแม้ลูกค้าปิดหน้าไปก่อน

### ค่าส่ง ภาษี และส่วนลด {#shipping-tax-and-discounts}

`totals` เพิ่มรายการเข้าไปในยอดสินค้า (หรือหักออกถ้าติดลบ) ทำงานกับตะกร้า และอีกครั้งตอนชำระเงินพร้อมที่อยู่:

```ts
ecommercePlugin({
  totals: ({ cart, currency, shippingAddress }) => {
    const lines = []
    if (cart.subtotal < 100_000) lines.push({ label: 'ค่าส่ง', amount: 5_000 })
    if (shippingAddress?.province === 'กรุงเทพฯ') lines.push({ label: 'ส่งด่วนในวัน', amount: 3_000 })
    return lines
  },
})
```

คำสั่งซื้อเก็บรายการเหล่านี้ไว้ตามตอนสั่ง

## คำสั่งซื้อ {#orders}

| สถานะ | |
|---|---|
| `pending` | รอชำระเงิน (โอนเงิน) |
| `paid` | ชำระแล้ว รอจัดส่ง |
| `fulfilled` | จัดส่งหรือส่งมอบแล้ว |
| `cancelled` | ยกเลิกก่อนชำระ สินค้ากลับเข้าสต็อก |
| `refunded` | คืนเงินแล้ว (Stripe คืนให้) สินค้ากลับเข้าสต็อก |

เจ้าหน้าที่เปลี่ยนสถานะด้วยปุ่มในคำสั่งซื้อ (**ได้รับเงินแล้ว**, **จัดส่งแล้ว**, **ยกเลิกคำสั่งซื้อ**, **คืนเงิน**) หรือ
`POST /api/cms/shop/orders/:id/:status` คำสั่งซื้อเก็บแต่ละรายการตามตอนซื้อ (ชื่อ SKU ราคา) การแก้หรือลบสินค้าภายหลัง
จึงไม่กระทบ เลขที่คำสั่งซื้อเริ่มที่ `1001` ตั้งเองได้ด้วย `orders: { number: (n) => \`A-${n}\` }`

ลูกค้าเห็นคำสั่งซื้อของตัวเอง: `GET /api/cms/orders` (หรือ `useOrders()`)

## สต็อก {#stock}

เมื่อเปิด `inventory` (ค่าเริ่มต้น) สินค้าและสินค้าย่อยมีช่อง **สต็อก** เว้นว่างคือไม่นับ ระบบตรวจสต็อกตอนใส่ตะกร้าและตอนชำระเงิน
และตัดสต็อกตอนสร้างคำสั่งซื้อด้วยคำสั่งฐานข้อมูลคำสั่งเดียว ผู้ซื้อสองคนจึงแย่งชิ้นสุดท้ายกันไม่ได้ ถ้าสต็อกหมดระหว่างที่ลูกค้า
กำลังจ่าย ระบบยังสร้างคำสั่งซื้อ (เพราะได้เงินแล้ว) และทำเครื่องหมาย **สต็อกไม่พอ** คำสั่งซื้อที่ยกเลิกหรือคืนเงินจะคืนสต็อก

## อีเมลและ event {#emails-and-events}

เมื่อตั้งค่า[อีเมล](./email)แล้ว ลูกค้าได้อีเมลเมื่อสร้างคำสั่งซื้อ (พร้อมวิธีโอนเงิน) และเมื่อเจ้าหน้าที่ยืนยันว่าได้รับเงิน
ส่วน `emails.notify` ได้รับแจ้งคำสั่งซื้อใหม่ แต่ละฉบับใส่ฟังก์ชันของคุณเองหรือ `false` ได้

[Webhooks](./webhooks) ฟัง event ของร้านได้: `order.created`, `order.paid`, `order.fulfilled`, `order.cancelled`,
`order.refunded` เช่น ส่งให้ระบบคลังสินค้าหรือระบบบัญชี:

```ts
webhooks: [{ url: 'https://erp.example.com/hook', events: ['order.paid'], secret }],
```

## หลายร้าน {#several-shops}

เมื่อใช้ [plugin multi-tenant](./multi-tenant) แต่ละ tenant เป็นร้านของตัวเอง: ใส่ collection ของร้านและวาง
`multiTenantPlugin` ไว้หลัง

```ts
import { ecommercePlugin, SHOP_COLLECTIONS } from '@easy-cms/plugin-ecommerce'

plugins: [
  ecommercePlugin({ /* … */ }),
  multiTenantPlugin({ collections: [...SHOP_COLLECTIONS, 'media'] }),
]
```

สินค้า ตะกร้า และคำสั่งซื้อเป็นของ tenant ตามโดเมนของเว็บ เลขที่คำสั่งซื้อนับแยกต่อ tenant บัญชีลูกค้าหนึ่งบัญชีใช้ได้ทุกเว็บ
และแต่ละเว็บแสดงคำสั่งซื้อของตัวเอง บัญชี Stripe หนึ่งบัญชีใช้ร่วมทุก tenant

## วิธีชำระเงินของคุณเอง {#your-own-payment-method}

payment adapter เริ่มการชำระ บอกว่าชำระสำเร็จไหม และคืนเงินได้:

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
  // อยู่ที่ /api/cms/shop/payments/omise/webhook
  endpoints: [{ path: '/webhook', method: 'post', handler: async (req) => {
    const event = await req.json() // ตรวจลายเซ็นก่อน
    await paymentSucceeded(event.data.id)
    return { ok: true }
  } }],
})
```

อย่าเชื่อหน้าเว็บ: `confirm` ต้องถามผู้ให้บริการเสมอ

## ตัวเลือก {#options}

| ตัวเลือก | ค่าเริ่มต้น | |
|---|---|---|
| `payments.methods` | — | **จำเป็น** `stripeAdapter()`, `manualAdapter()` หรือของคุณเอง |
| `currencies.supported` | `['THB']` | รหัสสกุลเงิน หรือ `{ code, symbol, label, decimals }` |
| `currencies.default` | ตัวแรก | สำหรับตะกร้าใหม่ |
| `products.variants` | `true` | ประเภทตัวเลือกและสินค้าย่อย |
| `products.fields` | `[]` | field เพิ่มเติมของสินค้า |
| `inventory` | `true` | นับสต็อก |
| `carts.allowGuests` | `true` | ผู้เยี่ยมชมซื้อและจ่ายได้ |
| `carts.guestCartDays` | `30` | ตะกร้าของผู้เยี่ยมชมที่ไม่ได้ใช้จะถูกลบหลังจากนี้ |
| `addresses.supportedCountries` | `['TH']` | ประเทศที่ร้านส่งของ |
| `addresses.fields` | ที่อยู่แบบไทย | ชื่อ โทร ที่อยู่ แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์ ประเทศ |
| `customers.role` | `customer` | role ของบัญชีลูกค้า |
| `customers.signUp` | `true` | ผู้เยี่ยมชมสมัครบัญชีเอง (`false` คือไม่ให้สมัคร หรือใส่คีย์ Turnstile) |
| `customers.pages` | — | หน้าของเว็บสำหรับลิงก์ในอีเมล ([สมาชิกของเว็บ](./members)) |
| `totals` | — | ค่าส่ง ภาษี และส่วนลด |
| `orders.number` | `1000 + n` | เลขที่คำสั่งซื้อ |
| `emails` | — | `orderConfirmation`, `paymentReceived`, `newOrder`: ฟังก์ชันหรือ `false` และ `notify` |
| `overrides` | — | `{ products: (c) => ({ ...c, … }) }` เพื่อปรับ collection |
| `group` | Shop / ร้านค้า | ชื่อกลุ่มร้านค้าในเมนู (`shop` มีแคตตาล็อก การขาย และลูกค้า) |

ยังไม่มี: Omise และผู้ให้บริการอื่นแบบสำเร็จรูป, Stripe Checkout (หน้าจ่ายเงินของ Stripe), การจองสต็อกระหว่างจ่าย, ค่าส่ง
VAT และคูปองแบบสำเร็จรูป, สมาชิกรายเดือน และบัญชี Stripe แยกต่อ tenant

## ขั้นต่อไป {#next-steps}

- [สมาชิกของเว็บ](./members): บัญชีลูกค้า การสมัคร และลิงก์ในอีเมล
- [Webhooks](./webhooks): แจ้งระบบอื่นเรื่องคำสั่งซื้อ
- ตัวอย่างร้าน: `examples/shop` (Next.js)
