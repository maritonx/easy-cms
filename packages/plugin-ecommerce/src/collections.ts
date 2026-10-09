import {
  type Access,
  type AccessArgs,
  anyone,
  type CollectionConfig,
  type Field,
  type FieldTypeDefinition,
  type ID,
  isLoggedIn,
  type Label,
  type LayoutNode,
  ValidationError,
} from '@easy-cms/core'
import { type Currency, ORDER_STATUSES, priceField, TRANSACTION_STATUSES } from './shared.js'

declare module '@easy-cms/core' {
  interface CustomFieldTypes {
    /** An amount in a currency's smallest unit (satang, cents), shown as `฿1,234.50`. */
    price: {
      value: number
      options: {
        /** ISO 4217, e.g. `THB`. */
        readonly currency?: string
        /** Digits after the point. Default 2. */
        readonly decimals?: number
        readonly symbol?: string
      }
    }
  }
}

export const PRODUCTS = 'products'
export const VARIANT_TYPES = 'variant-types'
export const VARIANT_OPTIONS = 'variant-options'
export const VARIANTS = 'variants'
export const CARTS = 'carts'
export const ADDRESSES = 'addresses'
export const ORDERS = 'orders'
export const TRANSACTIONS = 'transactions'
/** Order numbers, one counter per tenant when the shop has several. */
export const COUNTERS = 'shop-counters'

export const SHOP_COLLECTIONS = [
  PRODUCTS,
  VARIANT_TYPES,
  VARIANT_OPTIONS,
  VARIANTS,
  CARTS,
  ADDRESSES,
  ORDERS,
  TRANSACTIONS,
  COUNTERS,
] as const
export type ShopCollection = (typeof SHOP_COLLECTIONS)[number]

/**
 * `type: 'price'`: a whole number of a currency's smallest unit (`123450` for ฿1,234.50), typed
 * and shown in the admin as money.
 */
export const price: FieldTypeDefinition = {
  name: 'price',
  base: 'number',
  validate: (value) =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0
      ? true
      : 'must be a whole amount of the smallest unit, 0 or more (e.g. 12345 for 123.45)',
  admin: {
    component: 'ecms-price-field',
    cell: 'ecms-price-cell',
    module: '@easy-cms/plugin-ecommerce/admin',
    props: ['currency', 'decimals', 'symbol'],
  },
  typescript: 'number',
}

/** Staff of the admin: signed in, and not a site member (customer). */
export const staff: Access = isLoggedIn
/** Staff see everything; customers only their own documents. */
export const staffOrOwner: Access = ({ user }: AccessArgs) => {
  if (!user) return false
  if (user.member !== true) return true
  return { customer: { equals: user.id } }
}
const nobody: Access = () => false
/** Fields only the shop sets: shown in the admin, never changed there. */
const bySystem = { update: () => false }

/** What the collections need to know about the shop. */
export interface CollectionOptions {
  readonly currencies: readonly Currency[]
  readonly variants: boolean
  readonly inventory: boolean
  readonly countries: readonly string[]
  readonly addressFields: readonly Field[] | undefined
  readonly productFields: readonly Field[]
}

const priceFields = (currencies: readonly Currency[], extra: Partial<Field> = {}): Field[] =>
  currencies.map(
    (c) =>
      ({
        name: priceField(c.code),
        type: 'price',
        currency: c.code,
        decimals: c.decimals,
        symbol: c.symbol,
        label: { en: `Price (${c.code})`, th: `ราคา (${c.code})` },
        ...extra,
      }) as unknown as Field,
  )

const stockField: Field = {
  name: 'inventory',
  type: 'number',
  min: 0,
  label: { en: 'In stock (empty: not counted)', th: 'สต็อก (ว่าง: ไม่นับ)' },
  validate: (value) =>
    value === null || value === undefined || Number.isInteger(value) ? true : 'must be whole',
}

/** The fields of an address, Thai style; `addresses.fields` replaces them. */
export function addressFields(countries: readonly string[]): Field[] {
  return [
    { name: 'name', type: 'text', required: true, label: { en: 'Name', th: 'ชื่อผู้รับ' } },
    { name: 'phone', type: 'text', label: { en: 'Phone', th: 'โทรศัพท์' } },
    { name: 'line1', type: 'text', required: true, label: { en: 'Address', th: 'ที่อยู่' } },
    { name: 'line2', type: 'text', label: { en: 'Address (more)', th: 'ที่อยู่ (ต่อ)' } },
    {
      name: 'subdistrict',
      type: 'text',
      label: { en: 'Sub-district', th: 'แขวง / ตำบล' },
    },
    { name: 'district', type: 'text', label: { en: 'District', th: 'เขต / อำเภอ' } },
    { name: 'province', type: 'text', label: { en: 'Province', th: 'จังหวัด' } },
    { name: 'postalCode', type: 'text', label: { en: 'Postal code', th: 'รหัสไปรษณีย์' } },
    {
      name: 'country',
      type: 'select',
      options: [...countries],
      required: true,
      ...(countries[0] ? { defaultValue: countries[0] } : {}),
      label: { en: 'Country', th: 'ประเทศ' },
    },
  ]
}

/** A product's edit page: what it is, its prices and stock, its options. */
function productLayout(o: CollectionOptions): LayoutNode[] {
  return [
    {
      tab: { en: 'Product', th: 'ข้อมูล' },
      fields: ['title', 'slug', 'description', 'images'],
    },
    {
      tab: { en: 'Price & stock', th: 'ราคาและสต็อก' },
      fields: [
        { row: o.currencies.map((c) => priceField(c.code)) },
        { row: ['sku', ...(o.inventory ? ['inventory'] : [])] },
      ],
    },
    ...(o.variants
      ? [{ tab: { en: 'Options', th: 'ตัวเลือก' }, fields: ['variantTypes'] } as LayoutNode]
      : []),
  ]
}

export function shopCollections(o: CollectionOptions): CollectionConfig[] {
  const address = o.addressFields ?? addressFields(o.countries)
  const currencyOptions = o.currencies.map((c) => c.code)

  const products: CollectionConfig = {
    slug: PRODUCTS,
    labels: {
      singular: { en: 'Product', th: 'สินค้า' },
      plural: { en: 'Products', th: 'สินค้า' },
    },
    icon: 'shopping-bag',
    useAsTitle: 'title',
    drafts: true,
    admin: {
      group: 'shop.catalog',
      layout: productLayout(o),
      empty: {
        description: {
          en: 'Add the first product of the shop: a name, a price, then publish it.',
          th: 'เพิ่มสินค้าแรกของร้าน: ตั้งชื่อ ใส่ราคา แล้วเผยแพร่',
        },
      },
    },
    access: { read: anyone, create: staff, update: staff, delete: staff },
    fields: [
      { name: 'title', type: 'text', required: true, label: { en: 'Name', th: 'ชื่อสินค้า' } },
      { name: 'slug', type: 'slug', from: 'title', unique: true, label: 'Slug' },
      {
        name: 'description',
        type: 'richText',
        label: { en: 'Description', th: 'รายละเอียด' },
      },
      {
        name: 'images',
        type: 'upload',
        hasMany: true,
        mimeTypes: ['image/*'],
        label: { en: 'Images', th: 'รูปภาพ' },
      },
      ...priceFields(o.currencies),
      { name: 'sku', type: 'text', index: true, label: 'SKU' },
      ...(o.inventory ? [stockField] : []),
      ...(o.variants
        ? [
            {
              name: 'variantTypes',
              type: 'relationship',
              to: VARIANT_TYPES,
              hasMany: true,
              label: {
                en: 'Options (e.g. color, size)',
                th: 'ตัวเลือก (เช่น สี ขนาด)',
              },
            } as Field,
          ]
        : []),
      ...o.productFields,
    ],
  }

  const variantTypes: CollectionConfig = {
    slug: VARIANT_TYPES,
    labels: {
      singular: { en: 'Option type', th: 'ประเภทตัวเลือก' },
      plural: { en: 'Option types', th: 'ประเภทตัวเลือก' },
    },
    icon: 'sliders-horizontal',
    useAsTitle: 'name',
    editIn: 'drawer',
    admin: { group: 'shop.catalog' },
    access: { read: anyone, create: staff, update: staff, delete: staff },
    fields: [
      {
        name: 'name',
        type: 'text',
        required: true,
        label: { en: 'Name (e.g. Color)', th: 'ชื่อ (เช่น สี)' },
      },
    ],
  }

  const variantOptions: CollectionConfig = {
    slug: VARIANT_OPTIONS,
    labels: {
      singular: { en: 'Option', th: 'ตัวเลือก' },
      plural: { en: 'Options', th: 'ตัวเลือก' },
    },
    icon: 'tags',
    useAsTitle: 'label',
    editIn: 'drawer',
    admin: { group: 'shop.catalog' },
    access: { read: anyone, create: staff, update: staff, delete: staff },
    fields: [
      {
        name: 'type',
        type: 'relationship',
        to: VARIANT_TYPES,
        required: true,
        index: true,
        admin: { column: true },
        label: { en: 'Type', th: 'ประเภท' },
      },
      {
        name: 'label',
        type: 'text',
        required: true,
        label: { en: 'Label (e.g. Red)', th: 'ชื่อ (เช่น แดง)' },
      },
    ],
  }

  const variants: CollectionConfig = {
    slug: VARIANTS,
    labels: {
      singular: { en: 'Variant', th: 'สินค้าย่อย' },
      plural: { en: 'Variants', th: 'สินค้าย่อย' },
    },
    icon: 'layers',
    useAsTitle: 'title',
    admin: { group: 'shop.catalog' },
    access: { read: anyone, create: staff, update: staff, delete: staff },
    fields: [
      {
        name: 'product',
        type: 'relationship',
        to: PRODUCTS,
        required: true,
        index: true,
        admin: { column: true },
        label: { en: 'Product', th: 'สินค้า' },
      },
      {
        name: 'options',
        type: 'relationship',
        to: VARIANT_OPTIONS,
        hasMany: true,
        required: true,
        label: { en: 'Options', th: 'ตัวเลือก' },
      },
      // "Red / L": set from the options on save.
      {
        name: 'title',
        type: 'text',
        access: bySystem,
        label: { en: 'Name', th: 'ชื่อ' },
      },
      ...priceFields(o.currencies, {
        label: { en: 'Price (empty: the product’s)', th: 'ราคา (ว่าง: ตามสินค้า)' },
      }).map((f) => ({
        ...f,
        label: {
          en: `Price ${(f as { currency: string }).currency} (empty: the product’s)`,
          th: `ราคา ${(f as { currency: string }).currency} (ว่าง: ตามสินค้า)`,
        },
      })),
      { name: 'sku', type: 'text', index: true, label: 'SKU' },
      ...(o.inventory ? [stockField] : []),
    ],
    hooks: { beforeChange: [checkVariant] },
  }

  const carts: CollectionConfig = {
    slug: CARTS,
    labels: {
      singular: { en: 'Cart', th: 'ตะกร้า' },
      plural: { en: 'Carts', th: 'ตะกร้า' },
    },
    icon: 'shopping-cart',
    admin: { group: 'shop.sales', list: { sort: '-updatedAt' } },
    // Changed through the shop's endpoints only.
    access: { read: staffOrOwner, create: nobody, update: nobody, delete: staff },
    fields: [
      {
        name: 'customer',
        type: 'relationship',
        to: 'users',
        index: true,
        admin: { column: true },
        label: { en: 'Customer', th: 'ลูกค้า' },
      },
      {
        name: 'currency',
        type: 'select',
        options: currencyOptions,
        required: true,
        ...(currencyOptions[0] ? { defaultValue: currencyOptions[0] } : {}),
        label: { en: 'Currency', th: 'สกุลเงิน' },
      },
      {
        name: 'items',
        type: 'array',
        label: { en: 'Items', th: 'รายการ' },
        fields: [
          {
            name: 'product',
            type: 'relationship',
            to: PRODUCTS,
            required: true,
            label: { en: 'Product', th: 'สินค้า' },
          },
          ...(o.variants
            ? [
                {
                  name: 'variant',
                  type: 'relationship',
                  to: VARIANTS,
                  label: { en: 'Variant', th: 'สินค้าย่อย' },
                } as Field,
              ]
            : []),
          {
            name: 'quantity',
            type: 'number',
            min: 1,
            required: true,
            label: { en: 'Quantity', th: 'จำนวน' },
          },
        ],
      },
      {
        name: 'purchasedAt',
        type: 'date',
        index: true,
        admin: { column: true },
        label: { en: 'Purchased', th: 'ซื้อแล้วเมื่อ' },
      },
      // A guest's cart: its secret, hashed; the browser keeps the secret.
      { name: 'secret', type: 'text', unique: true, hidden: true },
    ],
  }

  const addresses: CollectionConfig = {
    slug: ADDRESSES,
    labels: {
      singular: { en: 'Address', th: 'ที่อยู่' },
      plural: { en: 'Addresses', th: 'ที่อยู่' },
    },
    icon: 'map-pin',
    useAsTitle: 'name',
    admin: { group: 'shop.customers' },
    access: {
      read: staffOrOwner,
      create: ({ user }) => user !== null,
      update: staffOrOwner,
      delete: staffOrOwner,
    },
    fields: [
      {
        name: 'customer',
        type: 'relationship',
        to: 'users',
        required: true,
        index: true,
        admin: { column: true },
        label: { en: 'Customer', th: 'ลูกค้า' },
      },
      ...address,
    ],
    hooks: {
      // Customers keep addresses for themselves only.
      beforeValidate: [
        ({ data, user }) => (user?.member === true ? { ...data, customer: user.id } : data),
      ],
    },
  }

  const money = (name: string, label: Label): Field =>
    ({
      name,
      type: 'price',
      access: bySystem,
      label,
    }) as unknown as Field

  const orders: CollectionConfig = {
    slug: ORDERS,
    labels: {
      singular: { en: 'Order', th: 'คำสั่งซื้อ' },
      plural: { en: 'Orders', th: 'คำสั่งซื้อ' },
    },
    icon: 'package',
    useAsTitle: 'orderNumber',
    admin: {
      group: 'shop.sales',
      list: { sort: '-createdAt' },
      // What to do next, at the top of the side column.
      sidebar: [{ tag: 'ecms-order-actions', position: 'top' }],
      // Paid orders wait to be sent.
      badge: {
        where: { status: { equals: 'paid' } },
        label: { en: 'to send', th: 'รอจัดส่ง' },
      },
      empty: {
        description: {
          en: 'Orders appear here once customers check out.',
          th: 'คำสั่งซื้อจะแสดงที่นี่เมื่อลูกค้าชำระเงิน',
        },
      },
    },
    // Made at checkout; their status changes with the order's actions (`/shop/orders/:id/…`).
    access: { read: staffOrOwner, create: nobody, update: staff, delete: staff },
    fields: [
      {
        name: 'orderNumber',
        type: 'text',
        unique: true,
        access: bySystem,
        label: { en: 'Order number', th: 'เลขที่คำสั่งซื้อ' },
      },
      {
        name: 'status',
        type: 'select',
        options: ORDER_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] })),
        required: true,
        defaultValue: 'pending',
        index: true,
        access: bySystem,
        position: 'sidebar',
        admin: { column: true },
        label: { en: 'Status', th: 'สถานะ' },
      },
      {
        name: 'customer',
        type: 'relationship',
        to: 'users',
        index: true,
        access: bySystem,
        label: { en: 'Customer', th: 'ลูกค้า' },
      },
      {
        name: 'email',
        type: 'email',
        required: true,
        access: bySystem,
        admin: { column: true },
        label: { en: 'Email', th: 'อีเมล' },
      },
      {
        name: 'currency',
        type: 'select',
        options: currencyOptions,
        required: true,
        access: bySystem,
        label: { en: 'Currency', th: 'สกุลเงิน' },
      },
      {
        name: 'items',
        type: 'array',
        access: bySystem,
        label: { en: 'Items', th: 'รายการ' },
        fields: [
          {
            name: 'product',
            type: 'relationship',
            to: PRODUCTS,
            label: { en: 'Product', th: 'สินค้า' },
          },
          ...(o.variants
            ? [
                {
                  name: 'variant',
                  type: 'relationship',
                  to: VARIANTS,
                  label: { en: 'Variant', th: 'สินค้าย่อย' },
                } as Field,
              ]
            : []),
          // As it was when bought.
          {
            name: 'title',
            type: 'text',
            required: true,
            label: { en: 'Item as bought', th: 'รายการตอนซื้อ' },
          },
          { name: 'sku', type: 'text', label: 'SKU' },
          money('unitPrice', { en: 'Price', th: 'ราคา' }),
          {
            name: 'quantity',
            type: 'number',
            required: true,
            label: { en: 'Quantity', th: 'จำนวน' },
          },
          money('total', { en: 'Total', th: 'รวม' }),
        ],
      },
      money('subtotal', { en: 'Subtotal', th: 'ยอดสินค้า' }),
      {
        name: 'adjustments',
        type: 'array',
        access: bySystem,
        label: { en: 'Shipping, tax, discounts', th: 'ค่าส่ง ภาษี ส่วนลด' },
        fields: [
          { name: 'label', type: 'text', required: true },
          { name: 'amount', type: 'number', required: true },
        ],
      },
      money('total', { en: 'Total', th: 'ยอดรวม' }),
      {
        name: 'shippingAddress',
        type: 'group',
        access: bySystem,
        label: { en: 'Ship to', th: 'ที่อยู่จัดส่ง' },
        fields: address.map((f) => {
          // An order keeps a copy: nothing in it is required afterwards.
          const {
            required: _required,
            defaultValue: _default,
            ...rest
          } = f as Field & {
            defaultValue?: unknown
          }
          return rest as Field
        }),
      },
      {
        name: 'payment',
        type: 'text',
        access: bySystem,
        label: { en: 'Paid with', th: 'ชำระด้วย' },
      },
      // The payment method's name (`payment` is its label).
      {
        name: 'paymentMethod',
        type: 'text',
        access: bySystem,
        label: { en: 'Method', th: 'วิธีชำระ' },
      },
      // The language of the checkout, for emails about the order.
      {
        name: 'locale',
        type: 'text',
        access: bySystem,
        label: { en: 'Language', th: 'ภาษา' },
      },
      // Stock ran out while the customer paid: the money is in, the items may not be.
      {
        name: 'stockShort',
        type: 'boolean',
        access: bySystem,
        label: { en: 'Not enough stock', th: 'สต็อกไม่พอ' },
      },
      {
        name: 'paidAt',
        type: 'date',
        access: bySystem,
        label: { en: 'Paid', th: 'ชำระเมื่อ' },
      },
      {
        name: 'note',
        type: 'textarea',
        label: { en: 'Note (staff only)', th: 'บันทึก (เฉพาะเจ้าหน้าที่)' },
        access: { read: ({ user }) => user !== null && user.member !== true },
      },
    ],
  }

  const transactions: CollectionConfig = {
    slug: TRANSACTIONS,
    labels: {
      singular: { en: 'Payment', th: 'การชำระเงิน' },
      plural: { en: 'Payments', th: 'การชำระเงิน' },
    },
    icon: 'ticket',
    admin: { group: 'shop.sales', list: { sort: '-createdAt' } },
    access: { read: staff, create: nobody, update: nobody, delete: nobody },
    fields: [
      {
        name: 'status',
        type: 'select',
        options: [...TRANSACTION_STATUSES],
        required: true,
        index: true,
        admin: { column: true },
        label: { en: 'Status', th: 'สถานะ' },
      },
      {
        name: 'method',
        type: 'text',
        required: true,
        admin: { column: true },
        label: { en: 'Method', th: 'วิธีชำระ' },
      },
      money('amount', { en: 'Amount', th: 'จำนวนเงิน' }),
      {
        name: 'currency',
        type: 'select',
        options: currencyOptions,
        required: true,
        label: { en: 'Currency', th: 'สกุลเงิน' },
      },
      { name: 'email', type: 'email', label: { en: 'Email', th: 'อีเมล' } },
      {
        name: 'customer',
        type: 'relationship',
        to: 'users',
        label: { en: 'Customer', th: 'ลูกค้า' },
      },
      { name: 'cart', type: 'relationship', to: CARTS, label: { en: 'Cart', th: 'ตะกร้า' } },
      {
        name: 'order',
        type: 'relationship',
        to: ORDERS,
        index: true,
        admin: { column: true },
        label: { en: 'Order', th: 'คำสั่งซื้อ' },
      },
      // What the order will be: lines, totals and address, worked out at checkout.
      { name: 'checkout', type: 'json', label: { en: 'Checkout', th: 'ข้อมูลตอนสั่งซื้อ' } },
      // The adapter's own, e.g. Stripe's payment intent.
      { name: 'data', type: 'json', label: { en: 'Provider data', th: 'ข้อมูลผู้ให้บริการ' } },
      // For finding a transaction by the provider's id (e.g. from a webhook).
      { name: 'reference', type: 'text', index: true, label: { en: 'Reference', th: 'อ้างอิง' } },
      { name: 'error', type: 'text', label: { en: 'Error', th: 'ข้อผิดพลาด' } },
    ],
  }

  const counters: CollectionConfig = {
    slug: COUNTERS,
    access: { read: nobody, create: nobody, update: nobody, delete: nobody },
    fields: [
      { name: 'key', type: 'text', required: true, unique: true },
      { name: 'value', type: 'number' },
    ],
  }

  return [
    products,
    ...(o.variants ? [variantTypes, variantOptions, variants] : []),
    carts,
    addresses,
    orders,
    transactions,
    counters,
  ]
}

const idOf = (value: unknown): ID | null => {
  if (value === null || value === undefined) return null
  if (typeof value === 'object') return ((value as Record<string, unknown>).id as ID) ?? null
  return value as ID
}

/**
 * A variant has one option of each of its product's option types, is the only one with that
 * combination, and is named after its options ("Red / L").
 */
const checkVariant: NonNullable<CollectionConfig['hooks']>['beforeChange'] extends
  | readonly (infer H)[]
  | undefined
  ? H
  : never = async ({ data, cms, originalDoc }) => {
  const fail = (field: string, message: string) =>
    new ValidationError(VARIANTS, [{ field, message }])
  const productId = idOf(data.product)
  if (productId === null) return data
  const product = (await cms
    .findById(PRODUCTS, productId, { depth: 0, draft: true })
    .catch(() => null)) as Record<string, unknown> | null
  if (!product) throw fail('product', 'was not found')
  const types = (Array.isArray(product.variantTypes) ? product.variantTypes : []).map((t) =>
    String(idOf(t)),
  )
  const ids = (Array.isArray(data.options) ? data.options : []).map(idOf).filter((v) => v !== null)
  const options = ids.length
    ? ((await cms.find(VARIANT_OPTIONS, { where: { id: { in: ids } }, limit: 0, depth: 0 }))
        .docs as Record<string, unknown>[])
    : []
  const seen = new Set<string>()
  for (const option of options) {
    const type = String(idOf(option.type))
    if (!types.includes(type))
      throw fail('options', `"${String(option.label)}" is not one of the product’s option types`)
    if (seen.has(type)) throw fail('options', 'choose one option of each type')
    seen.add(type)
  }
  if (seen.size !== types.length)
    throw fail('options', 'choose one option of each of the product’s types')
  const key = [...ids].map(String).sort().join(',')
  const siblings = await cms.find(VARIANTS, {
    where: { product: { equals: productId } },
    limit: 0,
    depth: 0,
  })
  for (const other of siblings.docs as Record<string, unknown>[]) {
    if (originalDoc && String(other.id) === String(originalDoc.id)) continue
    const theirs = (Array.isArray(other.options) ? other.options : []).map((v) => String(idOf(v)))
    if (theirs.sort().join(',') === key)
      throw fail('options', 'the product has a variant with these options')
  }
  const ordered = [...options].sort(
    (a, b) => types.indexOf(String(idOf(a.type))) - types.indexOf(String(idOf(b.type))),
  )
  return { ...data, title: ordered.map((o) => String(o.label)).join(' / ') }
}

export const STATUS_LABELS: Record<(typeof ORDER_STATUSES)[number], Label> = {
  pending: { en: 'Awaiting payment', th: 'รอชำระเงิน' },
  paid: { en: 'Paid', th: 'ชำระแล้ว' },
  fulfilled: { en: 'Fulfilled', th: 'จัดส่งแล้ว' },
  cancelled: { en: 'Cancelled', th: 'ยกเลิก' },
  refunded: { en: 'Refunded', th: 'คืนเงินแล้ว' },
}
