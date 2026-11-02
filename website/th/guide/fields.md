# Fields {#fields}

::: info หน้านี้สอนอะไร
field ทุกประเภท ตัวเลือก หน้าตาในหน้า admin และวิธีจัดเก็บ

**ควรอ่านก่อน:** [การตั้งค่า](./configuration)
:::

ทุก field มี `name` และ `type` ตัวเลือกที่ใช้ร่วมกัน:

| ตัวเลือก | |
|---|---|
| `label` | string หรือ `{ en, th }` ค่าเริ่มต้นคือชื่อ field ที่แปลงให้อ่านง่าย |
| `required` | ต้องมีค่า (ข้ามการตรวจสอบขณะบันทึก [ฉบับร่าง (draft)](./drafts)) |
| `defaultValue` | ใช้เมื่อสร้างเอกสารโดยไม่มี field นี้ |
| `unique` | เอกสารสองรายการใช้ค่าซ้ำกันไม่ได้ ใช้ได้กับ field ระดับบนสุดเท่านั้น ถ้าอยู่ใน group, array หรือ block จะไม่มีผล และการตรวจ config จะเตือน |
| `index` | สร้าง index ในฐานข้อมูล |
| `validate` | `(value, { data, operation }) => true \| 'error message'` เป็น async ได้ |
| `access` | `{ read, create, update }` [สิทธิ์](./access-control#field-access)ระดับ field |
| `hidden` | ถูกจัดเก็บ แต่ API จะไม่ส่งคืนและไม่รับเป็น input |
| `localized` | เก็บค่าแยกตามภาษา ดู [หลายภาษา](./localization) |
| `admin` | การแสดงในหน้า admin: `{ position: 'sidebar' }` แสดงในแถบข้างของหน้าแก้ไข (สำหรับ field ระดับบนสุด เช่น หมวดหมู่ แท็ก หรือวันที่) ส่วน `{ component, after }` คือ [admin components](./plugins#admin-components) แทนช่องกรอก และต่อท้าย field |

## ประเภท {#types}

| ประเภท | ค่า | ตัวเลือก |
|---|---|---|
| `text` | `string` | `minLength`, `maxLength` |
| `textarea` | `string` | `minLength`, `maxLength` |
| `email` | `string` จัดเก็บเป็นตัวพิมพ์เล็ก | |
| `number` | `number` | `min`, `max` |
| `boolean` | `boolean` | |
| `date` | `string` แบบ ISO 8601 (รับ `Date` ได้) | |
| `select` | หนึ่งในตัวเลือก หรือ array เมื่อใช้ `hasMany` | `options`, `hasMany` |
| `slug` | `string` ที่ปลอดภัยสำหรับ URL และไม่ซ้ำภายใน collection | `from` |
| `json` | ค่า JSON ใดก็ได้ | |
| `richText` | เอกสาร JSON ของ Tiptap | ดู [Rich text](./rich-text) |
| `upload` | id ของเอกสาร `media` หรือ array เมื่อใช้ `hasMany` | `hasMany`, `mimeTypes` ดู [การอัปโหลด](./uploads#several-files-galleries) |
| `relationship` | id ของเอกสารใน collection อื่น หรือ `{ relationTo, value }` เมื่อชี้ได้หลาย collection | `to`, `hasMany`, `minRows`, `maxRows` |
| `array` | รายการของแถว แต่ละแถวมี `id` และ field ย่อย | `fields`, `minRows`, `maxRows` |
| `group` | object ซ้อน | `fields` |
| `blocks` | รายการของแถวที่มีหลายชนิด แต่ละแถวมี `id` และ `blockType` | `blocks`, `minRows`, `maxRows` |
| `ui` | ไม่มี: component ในฟอร์มแก้ไข | `admin.component` (จำเป็น) ดู [ui](#ui) |

### select {#select}

```ts
{ name: 'kind', type: 'select', options: ['news', { label: { en: 'Blog', th: 'บล็อก' }, value: 'blog' }] }
{ name: 'tags', type: 'select', options: ['vue', 'react'], hasMany: true }
```

### slug {#slug}

```ts
{ name: 'slug', type: 'slug', from: 'title' }
```

เติมค่าจาก `title` เมื่อว่าง ตัวอักษรของทุกภาษาจะถูกเก็บไว้ (`สวัสดี ชาวโลก` →
`สวัสดี-ชาวโลก`) ค่าที่ซ้ำจะได้ `-2`, `-3` การเปลี่ยน title ภายหลังจะไม่เปลี่ยน slug

`uniqueWithin: 'parent'` ทำให้ slug ห้ามซ้ำเฉพาะเอกสารที่มีค่าของอีก field เหมือนกัน เช่น หน้าที่อยู่ใต้หน้าแม่เดียวกัน
(แบบที่ plugin [หน้าย่อย](./nested-docs) ใช้)

### relationship {#relationship}

```ts
{ name: 'author', type: 'relationship', to: 'users' }
{ name: 'related', type: 'relationship', to: 'posts', hasMany: true }
```

ในหน้า admin ช่องนี้ค้นหาใน collection ปลายทางขณะพิมพ์ ครั้งละ 10 รายการ และมีปุ่ม **แสดงเพิ่ม** สำหรับ 10 รายการถัดไป
ถ้ายังไม่พิมพ์อะไร เอกสารที่เพิ่งเลือกไปใน collection นั้นจะขึ้นก่อน (เก็บในเบราว์เซอร์ ไม่ใช้กับช่องที่มี `filterOptions`)

id จะถูกตรวจสอบว่ามีอยู่จริงเมื่อบันทึก การอ่านจะดึงเอกสารที่เกี่ยวข้องมาแทนที่ตามจำนวนระดับ `depth`
(ค่าเริ่มต้น 1 สูงสุด 3) ที่ depth 0 จะได้เพียง id เอกสารที่ถูกลบหรืออ่านไม่ได้จะกลายเป็น `null` หรือ
ถูกตัดออกจากรายการ `hasMany`

`filterOptions` จำกัดว่า relationship ชี้ไปเอกสารใดได้บ้าง ทำงานฝั่ง server โดยได้รับ id ของเอกสาร
(`undefined` ตอนสร้าง) และผู้ใช้ แล้วคืน `where` ของ collection ปลายทาง หรือ `true` ถ้าเลือกได้ทุกเอกสาร
ช่องเลือกใน admin แสดงเฉพาะเอกสารเหล่านั้น และตรวจซ้ำตอนบันทึก

```ts
{
  name: 'manager',
  type: 'relationship',
  to: 'users',
  filterOptions: ({ id }) => ({ role: { equals: 'admin' } }),
}
```

#### หลาย collection {#several-collections}

ถ้า `to` เป็นรายการ relationship จะชี้ไปเอกสารของ collection ไหนในรายการก็ได้ เช่น เมนูที่ลิงก์ไปบทความหรือหน้า
ค่าแต่ละตัวเป็น `{ relationTo, value }` คือ collection กับ id ของเอกสาร (เป็นตัวเอกสารเมื่อ populate แล้ว):

```ts
{ name: 'link', type: 'relationship', to: ['posts', 'pages'] }
{ name: 'featured', type: 'relationship', to: ['posts', 'pages'], hasMany: true }
```

```ts
await cms.create('menu-items', { link: { relationTo: 'pages', value: 3 } })
const item = await cms.findById('menu-items', 1) // link: { relationTo: 'pages', value: { id: 3, … } }
if (item.link?.relationTo === 'pages') item.link.value // type เป็นหน้า (หรือ id ของมัน)
```

ค่าแต่ละตัว populate จาก collection ของมันเอง ด้วยสิทธิ์ของ collection นั้น ตอนบันทึกส่งค่าแบบที่อ่านมาได้เลย
จะ populate แล้วหรือไม่ก็ได้ ถ้า `relationTo` ไม่อยู่ใน `to` จะถูกปฏิเสธ

id ซ้ำกันได้ระหว่าง collection ดังนั้น filter ต้องระบุ collection:

| Filter | ตรงกับ |
|---|---|
| `'link.pages': { in: [3, 4] }` | ลิงก์ไปหน้า 3 หรือ 4 |
| `'link.pages': { exists: true }` | ลิงก์ไปหน้าใดก็ได้ |
| `'link.relationTo': { equals: 'pages' }` | เหมือนกัน โดยดูแค่ collection |
| `'link.value': { equals: 3 }` | id 3 ใน collection ไหนก็ได้ |
| `link: { exists: false }` | ไม่มีลิงก์ |

ในรายการ `hasMany` `'featured.pages': { equals: 3 }` ตรงกับค่าที่เป็นหน้า 3 ส่วนการแยกเงื่อนไข
`featured.relationTo` กับ `featured.value` อาจตรงกับค่าคนละตัวกัน ใน blocks ให้ใช้ `.relationTo` และ `.value`
ส่วน `link: { equals: 3 }` จะถูกปฏิเสธ เพราะไม่ได้บอกว่าเป็น collection ไหน

ใน admin ช่องเลือกมีรายการ collection อยู่ข้างช่องค้นหา chip และคอลัมน์ในหน้า list แสดงเป็น "หน้า · เกี่ยวกับเรา"
และแผง filter มีให้เลือกทีละ collection ("ลิงก์ › หน้า") `filterOptions` ได้ `relationTo` คือ collection
ที่กำลังกรองตัวเลือก และคืน `where` ของ collection นั้น

relationship ที่เพิ่ม collection ยังเก็บลิงก์เดิมไว้: migration ย้าย id ไปเป็นของ collection แรกใน `to`
จึงต้องใส่ collection เดิมไว้ก่อน (`to: 'posts'` → `to: ['posts', 'pages']`) ถ้าเปลี่ยนกลับเป็น collection เดียว
ลิงก์ไป collection อื่นจะถูกลบ (`migrate:create` แจ้งไว้) ใน GraphQL field แบบนี้ยังเป็น JSON อยู่

### array และ group {#array-and-group}

```ts
{
  name: 'links',
  type: 'array',
  maxRows: 5,
  fields: [
    { name: 'label', type: 'text', required: true },
    { name: 'url', type: 'text' },
  ],
}
{ name: 'seo', type: 'group', fields: [{ name: 'title', type: 'text' }] }
```

การอัปเดต array จะแทนที่แถวทั้งหมด หากต้องการคงตัวตนของแถวไว้ ให้คง `id` ของแถวนั้นไว้

### blocks {#blocks}

แถวที่มีหลายชนิด สำหรับหน้าที่ผู้แก้ไขเนื้อหาจัดวางเอง:

```ts
{
  name: 'layout',
  type: 'blocks',
  blocks: [
    {
      slug: 'hero',
      labels: { singular: 'Hero' },
      fields: [
        { name: 'heading', type: 'text', required: true },
        { name: 'image', type: 'upload' },
      ],
    },
    { slug: 'text', fields: [{ name: 'body', type: 'richText' }] },
  ],
}
```

แต่ละแถวคือ `{ id, blockType, ...fields }` โดย `blockType` ใช้เลือก block แถวจะถูกตรวจสอบความถูกต้อง
relationship และ upload ภายในแถวจะถูก populate และ type ที่สร้างขึ้นจะเป็น union ของ
block แต่ละชนิด

blocks จัดเก็บเป็น JSON และ `where` ค้นข้างในได้: ชื่อ field หมายถึง field นั้นในบล็อกชนิดใดก็ตามที่มี
และเอกสารจะตรงเงื่อนไขเมื่อมีบล็อกใดบล็อกหนึ่งตรง

```ts
await cms.find('pages', { where: { 'layout.blockType': { equals: 'hero' } } })
await cms.find('pages', { where: { 'layout.heading': { like: 'sale' } } })
await cms.find('pages', { where: { 'layout.heading.en': { equals: 'Hello' } } }) // ระบุภาษา
await cms.find('pages', { where: { layout: { exists: false } } }) // ไม่มีบล็อกเลย
```

list ที่อยู่ในบล็อกก็ค้นได้แบบเดียวกัน โดยต้องมีบางแถวตรงเงื่อนไข

```ts
await cms.find('pages', { where: { 'layout.meta.tone': { equals: 'warm' } } }) // group
await cms.find('pages', { where: { 'layout.items.title': { equals: 'One' } } }) // array
await cms.find('pages', { where: { 'layout.tags': { in: ['sale'] } } }) // ค่า hasMany
await cms.find('pages', { where: { 'layout.content.blockType': { equals: 'quote' } } }) // blocks
```

`sort` ใช้ค่าแรกที่พบ โดยไล่ตามลำดับบล็อก (และแถวของ list ข้างในบล็อก): `sort: '-layout.columns'`,
`sort: 'layout.items.title'` การค้นแบบนี้ต้องอ่าน JSON ของทุกเอกสาร จึงเหมาะกับการกรองมากกว่ารายการใหญ่ที่ถูกเรียกบ่อย

#### ค้นในบล็อกบน collection ขนาดใหญ่ {#queries-inside-blocks-on-large-collections}

Postgres ต้องอ่าน JSON ของทุกเอกสารเพื่อหาบล็อก บน collection ขนาดใหญ่ให้คัดค่าที่ใช้กรองออกมาเป็น field ของตัวเอง
ซึ่ง index หาได้ แล้วใช้ hook ตั้งค่าทุกครั้งที่บันทึก

```ts
{
  slug: 'posts',
  drafts: true,
  hooks: {
    beforeChange: [
      ({ data }) => ({
        ...data,
        hasHero: Array.isArray(data.layout) && data.layout.some((b) => b.blockType === 'hero'),
      }),
    ],
  },
  fields: [
    // ...
    { name: 'hasHero', type: 'boolean', index: true },
  ],
}
```

จากนั้นกรองด้วย `where: { hasHero: { equals: true } }` ที่ 1,000,000 บทความบน Postgres การนับลดจาก 1.2 s เหลือ 2 ms
ใน migration ที่เพิ่ม field นี้ (`easy-cms migrate:create`) ให้เติมค่าของเอกสารที่บันทึกไว้ก่อน ถ้าเอกสารที่ตรงแทบไม่มีอันไหน
publish เลย Postgres อาจยังเดาว่ามีเยอะและไล่หาทั้งรายการ สถิติของสองคอลัมน์นี้ช่วยให้มันรู้ และ query เดียวกันใช้เวลาไม่ถึง
1 มิลลิวินาที

```sql
UPDATE ecms_posts SET has_hero = layout @> '[{"blockType":"hero"}]';
CREATE STATISTICS ecms_posts_has_hero_status (mcv) ON has_hero, status FROM ecms_posts;
```

### ui {#ui}

field ที่ไม่เก็บค่าอะไร เป็น component ในฟอร์มแก้ไข เช่น ตัวคำนวณ ตัวอย่าง หรือปุ่ม

```ts
{ name: 'readingTime', type: 'ui', label: 'เวลาอ่าน', admin: { component: 'acme-reading-time', position: 'sidebar' } }
```

ไม่มีคอลัมน์ในฐานข้อมูล ไม่อยู่ใน API และ type ที่สร้างให้ และไม่ถูก validate วางได้ทุกที่ที่ field อื่นวางได้: ใน `admin.layout`,
ใน group, ในแถวของ array หรือ block, ในแผงด้านข้าง และใช้กับ `admin.condition` ได้ [component](/th/guide/plugins#admin-components)
ได้รับสถานะของหน้าแก้ไข (เอกสารขณะที่กำลังพิมพ์) และตั้งค่า field อื่นได้ ถ้าไม่มี `label` จะแสดงแค่ component
ตัวเลือกเกี่ยวกับค่า (`required`, `defaultValue`, `access`…) ใช้ไม่ได้ และ group หรือ array ต้องมี field ที่เก็บค่าอยู่ด้วย

## วิธีจัดเก็บ field {#how-fields-are-stored}

แต่ละ collection คือตารางหนึ่งตาราง field คือคอลัมน์ (field ใน group จะถูกแผ่ออกเป็นระดับเดียว: `seo.title` →
`seo_title` และ relationship ที่ชี้หลาย collection เป็น `link_relation_to` กับ `link_value`) ค่าของ array และ `hasMany` อยู่ในตารางลูก ส่วน blocks เป็นคอลัมน์ JSON field สองรายการที่จะแมปไปยังคอลัมน์
เดียวกันจะถูกรายงานเป็นข้อผิดพลาดของ config

## ขั้นต่อไป {#next-steps}

- [ชนิด field เพิ่มเติม](./field-types): ชนิดอื่นจากแพ็กเกจ เช่น `color` หรือเขียนเอง
- [การควบคุมสิทธิ์](./access-control): สิทธิ์ระดับ field
- [Rich text](./rich-text): แสดง rich text บนหน้าเว็บ
