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
JSON, select, upload, relationship (รวมถึง `hasMany`), array และ blocks field แบบ array หรือ blocks ที่ localized
จะเก็บรายการทั้งชุดแยกตามภาษา หากไม่ต้องการเช่นนั้นให้ตั้ง localized ที่ field ข้างในแทน group ตั้ง localized
ไม่ได้ ให้ตั้งที่ field ข้างใน field ที่อยู่ในรายการที่ localized แล้วจะตั้ง localized ซ้ำอีกไม่ได้

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

หน้าแก้ไขของ collection และ global ที่มี field แบบ localized จะมีตัวเลือก **ภาษาของเนื้อหา** field ที่ localized
จะแสดงภาษาที่กำลังแก้ไข และภาษาที่เอกสารยังไม่ได้แปลจะมีจุดบอก ขณะแก้ไข field ที่ยังไม่ได้แปลจะแสดงเป็นค่าว่าง
ไม่ใช่ค่าจากภาษาเริ่มต้น live preview ใช้ภาษาที่เลือก และ `preview` จะได้รับภาษานั้นผ่าน `locale`:

```ts
preview: ({ doc, locale }) => `/${locale}/posts/${doc.slug}`
```

หน้ารายการแสดงภาษาเริ่มต้น พร้อมคอลัมน์ **คำแปล** ภาษาหนึ่งนับว่าแปลแล้วเมื่อทุก field ที่ localized และกรอกไว้
ในภาษาเริ่มต้น ถูกกรอกในภาษานั้นด้วย

ภาษาของหน้าจอ admin เอง (ไทยหรืออังกฤษ) แยกจากภาษาของเนื้อหา ผู้ใช้แต่ละคนสลับได้ที่ท้ายเมนูหรือในหน้าบัญชีของฉัน

## เพิ่มภาษาใหม่ {#adding-a-language}

ภาษาเป็นส่วนหนึ่งของ schema (field ที่ localized จะมีคอลัมน์ต่อภาษา) จึงเพิ่มใน config และ deploy พร้อม migration
ไม่ใช่เพิ่มจากหน้า admin:

1. เพิ่มรหัสภาษา: `localization: { locales: ['th', 'en', 'ja'], defaultLocale: 'th' }`
2. รัน `npx easy-cms migrate:create add-japanese` แล้วตรวจคอลัมน์ `*__ja` ที่เพิ่มขึ้น
3. deploy แล้วรัน `easy-cms migrate`

จากนั้นหน้า admin จะแสดงภาษาใหม่ทุกที่ โดยชื่อภาษาแสดงตามภาษาหน้าจอของผู้ใช้ (日本語 / Japanese / ญี่ปุ่น)
และเอกสารเดิมจะขึ้นว่ายังไม่ได้แปล การลบภาษาจะลบคอลัมน์และข้อความของภาษานั้น ควร backup ก่อน

## การจัดเก็บ {#storage}

field ที่ localized แต่ละตัวจะมีคอลัมน์หนึ่งคอลัมน์ต่อภาษา ภาษาเริ่มต้นใช้ชื่อคอลัมน์เดิม (`title`) ส่วนภาษาอื่น
เพิ่มคอลัมน์ใหม่ (`title__en`) ดังนั้น:

- การเปิด `localized` ให้ field ที่มีอยู่แล้วจะเก็บค่าเดิมไว้เป็นค่าของภาษาเริ่มต้น
- array และ field แบบ `hasMany` ที่ localized จะเก็บแถวไว้ในตารางลูกพร้อมคอลัมน์ `_locale`
  แถวที่มีอยู่เดิมจะกลายเป็นของภาษาเริ่มต้น
- การเพิ่มภาษาจะเพิ่มคอลัมน์ ต้องสร้าง migration เหมือนการเปลี่ยน config อื่นๆ
- ถ้าเปลี่ยน `defaultLocale` ภายหลัง ค่าจะถูกย้ายระหว่างคอลัมน์ให้แต่ละภาษายังได้ค่าของตัวเอง:
  migration ที่สร้างขึ้น (และ development push) จะเพิ่มคอลัมน์ใหม่ คัดลอกค่าด้วยคำสั่ง `UPDATE`
  แล้วค่อยลบคอลัมน์เก่า ควรตรวจก่อน deploy ส่วน migration ที่สร้างก่อน 0.7 ไม่ได้บันทึกภาษาไว้
  การเปลี่ยนครั้งแรกหลังอัปเกรดจึงควรสร้าง migration (`easy-cms migrate:create`) ก่อนเปลี่ยน `defaultLocale`
