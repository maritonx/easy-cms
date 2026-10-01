# เวลาอ่านด้วย hook {#reading-time-with-a-hook}

::: info สิ่งที่จะได้
ตัวเลข "อ่านกี่นาที" ที่ CMS คำนวณทุกครั้งที่บันทึก ผู้แก้เห็นได้แต่แก้ไม่ได้
**ใช้:** [hooks](../hooks), [สิทธิ์ระดับ field](../access-control#field-access)
:::

## 1. Field {#1-the-field}

```ts
{
  name: 'readingTime',
  type: 'number',
  label: { en: 'Reading time (min)', th: 'เวลาอ่าน (นาที)' },
  position: 'sidebar',
  // อ่านอย่างเดียวทั้งในหน้า admin และ API ส่วน hook ด้านล่างเป็นคนตั้งค่า
  access: { update: () => false },
}
```

สิทธิ์ระดับ field กรองเฉพาะสิ่งที่คนส่งมา hook ยังตั้งค่าได้

## 2. Hook {#2-the-hook}

```bash [pm]
npm install @easy-cms/richtext
```

```ts
import { richTextToPlainText } from '@easy-cms/richtext'

const WORDS_PER_MINUTE = 200

function minutes(body: unknown): number {
  const words = richTextToPlainText(body as never).split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE))
}

// ใน collection posts:
hooks: {
  beforeChange: [
    ({ data }) => (data.body === undefined ? data : { ...data, readingTime: minutes(data.body) }),
  ],
},
```

ตอน update ที่ไม่ได้แก้ `body` จะไม่มี `data.body` ค่าเดิมจึงยังอยู่

::: tip ภาษาไทย
ภาษาไทยไม่เว้นวรรคระหว่างคำ การนับคำจากช่องว่างจึงได้ตัวเลขน้อยเกินไป ให้นับตัวอักษรแทน ภาษาไทยอ่านได้ประมาณ
800–1,000 ตัวอักษรต่อนาที: `Math.round(richTextToPlainText(body).length / 900)`
:::

## 3. เติมค่าให้บทความเดิม {#3-fill-existing-posts}

hook ทำงานตอนบันทึก บทความที่มีอยู่แล้วต้องบันทึกใหม่หนึ่งครั้ง:

```ts
const cms = await getEasyCMS(config) // หรือ useEasyCMS() ใน Nuxt
const { docs } = await cms.find('posts', { limit: 0, draft: true, depth: 0 })
for (const post of docs) await cms.update('posts', post.id, { body: post.body })
```
