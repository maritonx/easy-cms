// Seeds an admin and a few products: `pnpm seed`
import { createEasyCMS } from '@easy-cms/core'
import config from '../easy-cms.config.ts'

const cms = await createEasyCMS(config)
if ((await cms.count('users')) > 0) {
  console.log('Already seeded.')
} else {
  await cms.create('users', {
    email: 'admin@example.com',
    password: 'change-me-please',
    role: 'admin',
    name: 'Admin',
  })
  await cms.create('products', {
    title: 'ชาไทยออร์แกนิก',
    slug: 'thai-tea',
    priceInTHB: 18_000,
    priceInUSD: 600,
    inventory: 50,
    sku: 'TEA-001',
    status: 'published',
  })
  await cms.create('products', {
    title: 'แก้วเซรามิก',
    slug: 'mug',
    priceInTHB: 35_000,
    priceInUSD: 1_100,
    inventory: 12,
    sku: 'MUG-001',
    status: 'published',
  })
  // A shirt in two sizes: each size has its own stock; L costs more.
  const size = await cms.create('variant-types', { name: 'Size' })
  const m = await cms.create('variant-options', { type: size.id, label: 'M' })
  const l = await cms.create('variant-options', { type: size.id, label: 'L' })
  const shirt = await cms.create('products', {
    title: 'เสื้อยืด',
    slug: 'shirt',
    priceInTHB: 39_000,
    priceInUSD: 1_200,
    variantTypes: [size.id],
    status: 'published',
  })
  await cms.create('variants', { product: shirt.id, options: [m.id], inventory: 10, sku: 'SH-M' })
  await cms.create('variants', {
    product: shirt.id,
    options: [l.id],
    inventory: 5,
    sku: 'SH-L',
    priceInTHB: 42_000,
  })
  console.log('Seeded: admin@example.com / change-me-please, and 3 products.')
}
await cms.destroy()
