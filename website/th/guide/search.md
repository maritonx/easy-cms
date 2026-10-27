# ค้นหา {#search}

::: info หน้านี้สอนอะไร
ค้นเนื้อหาที่ publish แล้วแบบเรียงตามความเกี่ยวข้อง รวมถึงภาษาไทย ด้วย search adapter:
index อะไรบ้าง index ตามทันการแก้ไขอย่างไร และสิทธิ์ของผู้อ่านยังถูกใช้อย่างไร

**ควรอ่านก่อน:** [การตั้งค่า](./configuration), [ฉบับร่าง](./drafts)
:::

ตัวกรอง `like` หาเอกสารที่ field มีข้อความที่ต้องการ บน Postgres
[`index: 'trigram'`](./databases#at-1-000-000-posts) ทำให้เร็วแม้ collection ใหญ่
ทั้งภาษาไทยและภาษาอื่น ซึ่งพอสำหรับรายการใน admin หรือการกรอง field เดียว

แต่ช่องค้นหาบนเว็บต้องการมากกว่านั้น: ค้นครั้งเดียวได้หลาย field และหลาย collection
ผลที่ตรงที่สุดขึ้นก่อน และเจอคำที่อยู่ใน rich text หรือ block งานนี้คือหน้าที่ของ
**search adapter**

```ts
import { defineConfig, memorySearch } from '@easy-cms/core'

export default defineConfig({
  search: memorySearch(),
  collections: [
    {
      slug: 'posts',
      drafts: true,
      search: { fields: ['title', 'excerpt', 'body', 'seo.description'] },
      fields: [/* … */],
    },
  ],
})
```

```ts
const { hits, total } = await cms.search('น้ำท่วม', { limit: 10 })
// hits: [{ collection: 'posts', doc: { id, title, … } }, …] เรียงจากตรงที่สุด
```

## index อะไรบ้าง {#what-is-indexed}

- เฉพาะ collection ที่มี `search` โดย `fields` คือ field ที่จะ index **เรียงจากสำคัญที่สุด**:
  เจอในชื่อเรื่องจะอยู่เหนือเจอในเนื้อหา
- field แบบ text, textarea, email, slug และ select, rich text ใช้ข้อความล้วน ส่วน array,
  group และ block ใช้ข้อความทั้งหมดข้างใน path ผ่าน group ได้ เช่น `seo.description`
- **เฉพาะเอกสารที่ publish แล้ว** ถ้ามี [ฉบับร่าง](./drafts) ฉบับร่างจะไม่ถูก index
  และฉบับร่างที่บันทึกบนเอกสารที่ publish อยู่ จะไม่แทนฉบับ publish ใน index จนกว่าจะ publish
  การยกเลิก publish หรือลบเอกสารจะเอาออกจาก index
- ถ้าเปิด [หลายภาษา](./localization) แต่ละภาษาถูก index แยกกัน และค้นทีละภาษา
  (ภาษาเริ่มต้นถ้าไม่ได้ส่ง `locale`)

config ถูกตรวจตอนเริ่ม: field ที่ไม่มีอยู่หรือไม่ใช่ข้อความ หรือ collection ที่มี `search`
แต่ไม่ได้ตั้ง adapter จะหยุดพร้อมบอกเหตุผล

## ผลลัพธ์และสิทธิ์ {#results-and-access}

index รู้แค่ id: `cms.search()` ถาม index ว่าเอกสารไหนตรงที่สุด แล้วอ่านเอกสารเหล่านั้นแบบ
`find` ตามตัวเลือกสิทธิ์ที่ส่งมา

```ts
// แบบที่ผู้เข้าชมเห็น: ใช้สิทธิ์อ่านของเขา
await cms.search(q, { overrideAccess: false, user: null })
```

- เอกสารที่ผู้อ่านไม่มีสิทธิ์จะไม่อยู่ในหน้าผลลัพธ์ หน้าหนึ่งจึงอาจได้น้อยกว่า `limit`
  ส่วน `total` นับทุกเอกสารที่ตรงก่อนกรองสิทธิ์
- ตัวเลือก: `collections` (ค่าเริ่มต้นคือทุก collection ที่มี `search`), `locale`, `limit`
  (ค่าเริ่มต้น 10 สูงสุด 100), `page`, `depth`

ผ่าน REST ใช้ `GET <api>/search` รับ `q`, `collections` (คั่นด้วยจุลภาค), `locale`, `limit`,
`page` และ `depth` โดยใช้สิทธิ์ของผู้เรียก

```http
GET /api/cms/search?q=กาแฟ&collections=posts,pages&limit=5
```

command palette ของ admin (<kbd>⌘K</kbd> หรือ <kbd>Ctrl K</kbd>) แสดงผลจาก index ก่อน
แล้วตามด้วยเอกสารที่ชื่อตรง รวมถึงฉบับร่าง

## ทำให้ index ตามทัน {#keeping-the-index-current}

การบันทึก publish ยกเลิก publish และลบเอกสาร จะอัปเดต index ทันทีหลังบันทึก
โดยอ่านเอกสารใหม่แทนการใช้ข้อมูลจากตอนบันทึก การอัปเดตที่มาช้าหรือซ้ำจึงไม่เสียหาย

- ถ้าไม่ได้เปิด [outbox](./hooks#outbox) การ index ทำในเบื้องหลัง ถ้าล้มจะ log ไว้
  และ index จะค้างอยู่จนเอกสารถูกบันทึกอีกครั้งหรือสร้าง index ใหม่
- ถ้าเปิด `outbox: true` การ index เป็นขั้นหนึ่งของ outbox: retry จนสำเร็จ
  และถ้ายอมแพ้จะแสดงใน **Settings → Jobs → Outbox**

`easy-cms search:reindex [collection]` (หรือ `cms.reindexSearch()`) สร้าง index ใหม่จากฐานข้อมูล
ใช้หลังเพิ่ม `search` ให้ collection เปลี่ยน field หรือเพื่อซ่อม index

## `memorySearch()` {#memory-search}

adapter ที่มากับ Easy CMS เก็บ index ไว้ในหน่วยความจำของเซิร์ฟเวอร์

- **ภาษาไทยที่ไม่เว้นวรรคค้นได้** ตัดคำด้วย `Intl.Segmenter` ซึ่งใช้การตัดคำแบบพจนานุกรมของ ICU
  ที่มีใน Node อยู่แล้ว: `ข่าวน้ำท่วมกรุงเทพมหานคร` ค้นเจอด้วย `น้ำท่วม` หรือ `กรุงเทพ`
- ทุกคำที่ค้นต้องอยู่ในเอกสาร ที่ต้นคำหรือคร่อมหลายคำ เจอทั้งคำจะอยู่เหนือเจอแค่บางส่วน
- สร้างจากฐานข้อมูลตอนเซิร์ฟเวอร์เริ่ม (การค้นจะรอให้เสร็จ) และแต่ละ process มี index ของตัวเอง
  เหมาะกับ dev, test และเว็บเล็กที่รัน process เดียว ถ้าตั้ง `scheduler: false`
  ให้เรียก `cms.reindexSearch()` เอง
- ใน production จะ log คำเตือน: เว็บใหญ่หรือรันหลาย instance ควรใช้ adapter ของ search engine

การ์ด **System** บน dashboard แสดง adapter ที่ใช้อยู่

## เขียน adapter เอง {#writing-an-adapter}

adapter ของ search engine (Meilisearch, Typesense, OpenSearch…) implement `SearchAdapter`
จาก `@easy-cms/core` โดย Easy CMS แปลงเอกสารเป็นข้อความล้วนให้ adapter จึงไม่ต้องรู้จัก field

```ts
import type { SearchAdapter } from '@easy-cms/core'

export function mySearch(options: { url: string; apiKey: string }): SearchAdapter {
  return {
    name: 'my-engine',
    apiVersion: 1,
    // ก่อน reindex: สร้าง index และตั้ง attribute ที่ค้นได้ตามลำดับนี้
    async setup(collections) {},
    // { collection, id, locale, text: { title: '…', body: '…' } }: เพิ่มหรือแทนที่
    async index(entries) {},
    // ทุกภาษาของเอกสารเหล่านี้
    async remove(documents) {},
    async clear(collection) {},
    // { query, collections, locale, limit, offset } → { hits: [{ collection, id }], total }
    async search(query) {
      return { hits: [], total: 0 }
    },
    // แสดงให้ admin เห็น ห้ามคืน secret
    describe: () => [{ key: 'url', value: options.url }],
  }
}
```

- ใช้ลำดับ key ของ `text` เป็นน้ำหนักของแต่ละ field ซึ่งมาจาก `search.fields`
- ข้อความภาษาไทยต้องใช้ engine ที่ตัดคำไทยได้ ตรวจก่อนเลือก
- `ephemeral: true` บอกว่า index เริ่มว่างในแต่ละ process เหมือนของ `memorySearch()`

ดู [ADR-0056](https://github.com/maritonx/easy-cms/blob/main/docs/adr/0056-search-adapter.md)
ว่าทำไม search เป็น adapter แทนที่จะเป็นเซิร์ฟเวอร์ที่ Easy CMS ต้องมี
