# หลายภาษา (localization) {#localization}

เนื้อหาหลายภาษา: field ที่ตั้ง localized จะเก็บค่าแยกตามภาษา ส่วน field อื่นใช้ค่าร่วมกันทุกภาษา

```ts
export default defineConfig({
  localization: { locales: ['th', 'en'], defaultLocale: 'th' },
  collections: [
    {
      slug: 'posts',
      fields: [
        { name: 'title', type: 'text', required: true, localized: true },
        { name: 'body', type: 'richText', localized: true },
        { name: 'cover', type: 'upload' }, // the same in every language
      ],
    },
  ],
})
```

| ตัวเลือก | ค่าเริ่มต้น | |
|---|---|---|
| `locales` | จำเป็น | รหัสภาษา เช่น `['th', 'en']` หรือ `['en', 'en-GB']` |
| `defaultLocale` | ภาษาแรก | ใช้เมื่อไม่ได้ระบุภาษา และค่าของภาษานี้ใช้แทนค่าที่ว่าง |
| `fallback` | `true` | เมื่อค่าของภาษาที่อ่านว่าง จะคืนค่าของภาษาเริ่มต้นแทน |

`localized: true` ใช้ได้กับ field ประเภท text, textarea, email, slug, rich text, number, boolean, date,
JSON, select, upload และ relationship ส่วน group และ array ให้ตั้งที่ field ข้างใน และ field แบบ hasMany
ยังตั้ง localized ไม่ได้

## การอ่านและเขียน {#reading-and-writing}

```ts
await cms.find('posts') // default locale
await cms.find('posts', { locale: 'en' }) // English, falling back to Thai when empty
await cms.findById('posts', id, { locale: 'en', fallbackLocale: false }) // empty stays null
await cms.findById('posts', id, { locale: 'all' }) // title: { th: '…', en: '…' }

await cms.update('posts', id, { title: 'Hello' }, { locale: 'en' }) // Thai title kept
```

- การเขียนจะตั้งค่าของภาษาที่ระบุ (ภาษาเริ่มต้นถ้าไม่ระบุ) และเก็บค่าของภาษาอื่นไว้ตามเดิม ส่วน `locale: 'all'`
  เขียนเป็น map แบบ `{ [locale]: value }` โดยตรง
- `required` และ `validate` ที่เขียนเองจะตรวจเฉพาะภาษาที่กำลังเขียน
- `where` และ `sort` ใช้ภาษาที่กำลังอ่าน เช่น `{ locale: 'en', where: { title: { like: 'x' } } }` จะค้นใน
  ชื่อภาษาอังกฤษ ถ้าต้องการระบุภาษาเองให้ใช้ `title.en`
- slug ที่ localized จะถูกสร้างและรักษาความไม่ซ้ำแยกตามภาษา ค่าที่เป็น `unique` ก็เช่นกัน
- เวอร์ชันเก็บทุกภาษา และการกู้คืนจะนำทุกภาษากลับมาพร้อมกัน

ผ่าน REST ให้เติม `?locale=en` (หรือ `all`) และ `?fallback-locale=false` ได้ทั้งการอ่านและการเขียน

## หน้า admin {#admin}

collection และ global ที่มี field แบบ localized จะมีตัวสลับภาษา และ field ที่ localized จะแสดงภาษาที่กำลัง
แก้ไข ขณะแก้ไข field ที่ยังไม่ได้แปลจะแสดงเป็นค่าว่าง ไม่ใช่ค่าจากภาษาเริ่มต้น หน้ารายการและ live preview จะใช้
ภาษาที่เลือก และ `preview` จะได้รับภาษานั้นผ่าน `locale`:

```ts
preview: ({ doc, locale }) => `/${locale}/posts/${doc.slug}`
```

## การจัดเก็บ {#storage}

field ที่ localized แต่ละตัวจะมีคอลัมน์หนึ่งคอลัมน์ต่อภาษา ภาษาเริ่มต้นใช้ชื่อคอลัมน์เดิม (`title`) ส่วนภาษาอื่น
เพิ่มคอลัมน์ใหม่ (`title__en`) ดังนั้น:

- การเปิด `localized` ให้ field ที่มีอยู่แล้วจะเก็บค่าเดิมไว้เป็นค่าของภาษาเริ่มต้น
- การเพิ่มภาษาจะเพิ่มคอลัมน์ ต้องสร้าง migration เหมือนการเปลี่ยน config อื่นๆ
- ถ้าเปลี่ยน `defaultLocale` ภายหลัง คอลัมน์ชื่อเดิมจะกลายเป็นของภาษาใหม่ ต้องย้ายข้อมูลใน migration เอง
