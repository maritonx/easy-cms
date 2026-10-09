import { notFound } from 'next/navigation'
import { baht, cms, imageOf } from '@/lib'
import { AddToCart } from './add-to-cart'

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const local = await cms()
  const product = (
    await local.find('products', { where: { slug: { equals: slug } }, limit: 1, depth: 1 })
  ).docs[0]
  if (!product) notFound()
  // Its variants (colors, sizes…), each with its own price and stock.
  const variants = (
    await local.find('variants', { where: { product: { equals: product.id } }, limit: 0 })
  ).docs.map((v) => ({
    id: v.id,
    title: String(v.title ?? ''),
    price: typeof v.priceInTHB === 'number' ? v.priceInTHB : (product.priceInTHB ?? null),
    inventory: typeof v.inventory === 'number' ? v.inventory : null,
  }))
  return (
    <article>
      {/* biome-ignore lint/performance/noImgElement: CMS media URLs; next/image would need remotePatterns */}
      {imageOf(product) ? <img className="cover" src={imageOf(product) as string} alt="" /> : null}
      <h1>{product.title}</h1>
      <p className="price">{baht(product.priceInTHB)}</p>
      <AddToCart
        product={product.id}
        variants={variants.map((v) => ({ ...v, label: `${v.title} · ${baht(v.price)}` }))}
        inventory={typeof product.inventory === 'number' ? product.inventory : null}
      />
    </article>
  )
}
