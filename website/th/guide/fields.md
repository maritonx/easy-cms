# Fields {#fields}

ทุก field มี `name` และ `type` ตัวเลือกที่ใช้ร่วมกัน:

| ตัวเลือก | |
|---|---|
| `label` | string หรือ `{ en, th }` ค่าเริ่มต้นคือชื่อ field ที่แปลงให้อ่านง่าย |
| `required` | ต้องมีค่า (ข้ามการตรวจสอบขณะบันทึก [ฉบับร่าง (draft)](./drafts)) |
| `defaultValue` | ใช้เมื่อสร้างเอกสารโดยไม่มี field นี้ |
| `unique` | เอกสารสองรายการใช้ค่าซ้ำกันไม่ได้ (field ระดับบนสุด) |
| `index` | สร้าง index ในฐานข้อมูล |
| `validate` | `(value, { data, operation }) => true \| 'error message'` เป็น async ได้ |
| `access` | `{ read, update }` [สิทธิ์](./access-control#field-access)ระดับ field |
| `hidden` | ถูกจัดเก็บ แต่ API จะไม่ส่งคืนและไม่รับเป็น input |
| `localized` | เก็บค่าแยกตามภาษา ดู [หลายภาษา](./localization) |

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
| `upload` | id ของเอกสาร `media` | ดู [การอัปโหลด](./uploads) |
| `relationship` | id ของเอกสารใน collection อื่น | `to`, `hasMany` |
| `array` | รายการของแถว แต่ละแถวมี `id` และ field ย่อย | `fields`, `minRows`, `maxRows` |
| `group` | object ซ้อน | `fields` |
| `blocks` | รายการของแถวที่มีหลายชนิด แต่ละแถวมี `id` และ `blockType` | `blocks`, `minRows`, `maxRows` |

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

### relationship {#relationship}

```ts
{ name: 'author', type: 'relationship', to: 'users' }
{ name: 'related', type: 'relationship', to: 'posts', hasMany: true }
```

id จะถูกตรวจสอบว่ามีอยู่จริงเมื่อบันทึก การอ่านจะดึงเอกสารที่เกี่ยวข้องมาแทนที่ตามจำนวนระดับ `depth`
(ค่าเริ่มต้น 1 สูงสุด 3) ที่ depth 0 จะได้เพียง id เอกสารที่ถูกลบหรืออ่านไม่ได้จะกลายเป็น `null` หรือ
ถูกตัดออกจากรายการ `hasMany`

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
block แต่ละชนิด blocks จัดเก็บเป็น JSON จึงใช้ใน `where` หรือ `sort` ไม่ได้

## วิธีจัดเก็บ field {#how-fields-are-stored}

แต่ละ collection คือตารางหนึ่งตาราง field คือคอลัมน์ (field ใน group จะถูกแผ่ออกเป็นระดับเดียว: `seo.title` →
`seo_title`) ค่าของ array และ `hasMany` อยู่ในตารางลูก ส่วน blocks เป็นคอลัมน์ JSON field สองรายการที่จะแมปไปยังคอลัมน์
เดียวกันจะถูกรายงานเป็นข้อผิดพลาดของ config
