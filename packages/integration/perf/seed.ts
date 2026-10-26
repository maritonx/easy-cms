// Seeds the load-test posts through the Local API, as an app would write them: each post in Thai
// with its English title, drafts and versions included. Resumes where an earlier run stopped.
import type { EasyCMS } from '@easy-cms/core'
import { TAGS } from './schema.ts'

type Tag = (typeof TAGS)[number]

async function pool(count: number, parallel: number, run: (i: number) => Promise<unknown>) {
  let next = 0
  await Promise.all(
    Array.from({ length: parallel }, async () => {
      while (next < count) await run(next++)
    }),
  )
}

// biome-ignore lint/suspicious/noExplicitAny: the schema's typed instance, from any of its configs
export async function seed(cms: EasyCMS<any>, docs: number, parallel = 16): Promise<void> {
  const authors = (await cms.find('authors', { limit: 0 })).docs.map((d) => d.id as number)
  const categories = (await cms.find('categories', { limit: 0 })).docs.map((d) => d.id as number)
  const existing = await cms.count('posts', { draft: true } as never)
  if (existing >= docs) return
  const started = performance.now()
  if (authors.length === 0) {
    for (let i = 0; i < 50; i++)
      authors.push((await cms.create('authors', { name: `Author ${i}` })).id as number)
    for (let i = 0; i < 20; i++)
      categories.push((await cms.create('categories', { name: `หมวด ${i}` })).id as number)
  }
  await pool(docs - existing, parallel, async (n) => {
    const i = existing + n
    const post = await cms.create('posts', {
      title: `บทความที่ ${i}`,
      excerpt: 'เนื้อหาย่อ '.repeat(10),
      views: (i * 7919) % 10_000,
      publishedAt: new Date(Date.UTC(2024, 0, 1) + i * 60_000).toISOString(),
      author: authors[i % authors.length],
      category: categories[i % categories.length],
      tags: [TAGS[i % 4] as Tag, TAGS[(i + 1) % 4] as Tag],
      seo: { description: `คำอธิบาย ${i}` },
      layout: [
        { blockType: i % 10 === 0 ? 'hero' : 'text', heading: `หัวข้อ ${i}`, body: 'ย่อหน้า' },
        { blockType: 'gallery', items: [{ caption: `ภาพ ${i}` }, { caption: 'ภาพสอง' }] },
      ],
      status: i % 5 === 0 ? 'draft' : 'published',
    } as never)
    await cms.update('posts', post.id, { title: `Post ${i}` } as never, { locale: 'en' })
    if ((n + 1) % 10_000 === 0) {
      const rate = (n + 1) / ((performance.now() - started) / 1000)
      console.log(`  seeded ${n + 1} (${rate.toFixed(0)}/s)`)
    }
  })
  console.log(
    `seeded ${docs - existing} posts in ${((performance.now() - started) / 1000).toFixed(0)}s`,
  )
}
