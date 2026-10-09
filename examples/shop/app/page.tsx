import Link from 'next/link'
import { baht, cms, imageOf } from '@/lib'

export default async function Home() {
  const products = await (await cms()).find('products', { sort: 'title', limit: 50 })
  return (
    <>
      <h1>สินค้า</h1>
      {products.docs.length === 0 ? (
        <p>ยังไม่มีสินค้า: เพิ่มได้ที่ /admin หรือรัน pnpm seed</p>
      ) : (
        <ul className="grid">
          {products.docs.map((product) => (
            <li key={product.id}>
              <Link href={`/products/${product.slug}`} className="card">
                {/* biome-ignore lint/performance/noImgElement: CMS media URLs; next/image would need remotePatterns */}
                {imageOf(product) ? <img src={imageOf(product) as string} alt="" /> : null}
                <strong>{product.title}</strong>
                <span>{baht(product.priceInTHB)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
