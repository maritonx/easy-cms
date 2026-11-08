# โพสต์โซเชียล

::: info สิ่งที่จะได้เรียนรู้
เขียนโพสต์ครั้งเดียว ส่งไปหลายช่องทาง แต่ละช่องทางมีข้อความของตัวเองได้ โพสต์ทันทีหรือตั้งเวลา และดูผลของแต่ละช่องทาง

**ก่อนหน้านี้:** [การเชื่อมต่อ](./integrations)
:::

`@easy-cms/plugin-social` (ทดลอง) เพิ่ม **โพสต์โซเชียล** ในเมนู Content โพสต์หนึ่งมีข้อความ ลิงก์ รูป และช่องทางที่จะส่ง
แต่ละช่องทางมีข้อความของตัวเองได้ ช่องทางคือบัญชีที่เชื่อมไว้ใน **Settings → การเชื่อมต่อ** ช่องทางแรกคือ **webhook**
คือ URL ที่รับแต่ละโพสต์เป็น JSON ที่ลงลายเซ็น เช่น scenario ของ Make, n8n หรือ Zapier ที่โพสต์ต่อไปยัง X, LinkedIn
หรือที่อื่น ส่วน Facebook Page และ LINE จะตามมา

```bash [pm]
npm install @easy-cms/plugin-social
```

```ts
import { socialPlugin } from '@easy-cms/plugin-social'

export default defineConfig({
  serverURL: 'https://example.com', // ช่องทางดึงรูปจาก URL สาธารณะ
  // …
  plugins: [
    socialPlugin({
      collections: ['posts'], // หน้าแก้เอกสารของ collection เหล่านี้มีปุ่มแชร์
      url: ({ doc }) => `https://example.com/posts/${doc.slug}`, // ลิงก์ของโพสต์
    }),
  ],
})
```

plugin เพิ่ม collection `social-posts` ให้สร้าง migration (`easy-cms migrate:create social` ดู [Migrations](./deployment))
และต้องมีอะไรสักอย่างรันงานตั้งเวลา เพื่อส่งโพสต์ที่ตั้งเวลาไว้และลองซ้ำ ([งานตั้งเวลา](./jobs))

## เชื่อม webhook {#connecting-a-webhook}

**Settings → การเชื่อมต่อ → โซเชียลและแชต → Webhook (โซเชียล) → เชื่อมบัญชี** ตั้งชื่อ (เช่น "Make → X") วาง URL
ของ scenario และใส่ secret ถ้าต้องการลงลายเซ็น ตอนเชื่อมต่อจะส่ง `{ "test": true }` ไปให้ ซึ่ง scenario ข้ามไปได้
การเชื่อมต่อหนึ่งเท่ากับหนึ่งช่องทาง

แต่ละโพสต์ส่งไปเป็น:

```json
{
  "post": 12,
  "channel": "social-webhook:Make → X",
  "text": "คู่มือใหม่ออกแล้ว",
  "link": "https://example.com/posts/guide",
  "image": { "url": "https://example.com/api/cms/media/file/guide.png", "alt": "รูปปก" },
  "source": { "collection": "posts", "id": 7 }
}
```

พร้อม `x-easy-cms-signature-v2` และ `x-easy-cms-timestamp` แบบเดียวกับ[webhook](./webhooks#checking-the-signature)
ของ Easy CMS จึงตรวจด้วย `verifyWebhook(body, headers, secret)` ได้ ตอบ `2xx` ถือว่าโพสต์แล้ว ถ้าตอบ `{ "url": "…" }`
โพสต์จะลิงก์ไปที่นั่น

## เขียนและแชร์ {#writing-and-sharing}

ปุ่ม **แชร์ไปโซเชียล** ในหน้าแก้เอกสาร (collection ใน `collections`) สร้างโพสต์โซเชียลจากเอกสารนั้น: title, textarea ช่องแรก
(คำโปรย), `url`, รูปแรก และทุกช่องทางที่เชื่อมไว้ ตั้ง `share: ({ doc, collection }) => ({ title, text, link, image })`
เพื่อเติมแบบของคุณเองได้ ลบช่องทางที่ไม่ต้องการออก ข้อความเฉพาะช่องทางจะใช้แทนข้อความของโพสต์ในช่องทางนั้น

## การโพสต์ {#posting}

แผง **การโพสต์** ข้างโพสต์แสดงแต่ละช่องทาง: ยังไม่โพสต์, ตั้งเวลาไว้, กำลังส่ง, โพสต์แล้ว (พร้อมลิงก์ไปที่โพสต์) หรือ
ไม่สำเร็จ (พร้อมสาเหตุ) แผงนี้โพสต์ตามที่บันทึกไว้

- **โพสต์เลย** ส่งทันที **ตั้งเวลา** ส่งตามเวลาที่ตั้ง
- แต่ละช่องทางส่งแยกกัน ช่องที่ไม่สำเร็จจะลองใหม่หลัง 1, 5 และ 30 นาที แล้วเลิกลอง กด **ลองอีกครั้ง** เพื่อส่งใหม่ ช่องทางอื่นไม่ต้องรอ
  และช่องทางที่โพสต์แล้วจะไม่ถูกโพสต์ซ้ำ ข้อความของช่องทางนั้นคงไว้ตามที่โพสต์
- ก่อนกด แผงจะบอกสิ่งที่จะทำให้โพสต์ไม่ได้: รูปที่ช่องทางดึงไม่ได้ (ไม่มี `serverURL`, ไฟล์ private หรือเป็น localhost) หรือเอกสารต้นทาง
  ที่ยังไม่เผยแพร่ โพสต์ที่ตั้งเวลาไว้จะรอให้เอกสารต้นทางเผยแพร่สูงสุด 1 ชั่วโมง แล้วขึ้นเป็นไม่สำเร็จ

การเขียนโพสต์ต้องมีสิทธิ์สร้างและแก้โพสต์โซเชียล ส่วน **การโพสต์** ต้องมีสิทธิ์ `publish` ของ collection ซึ่งเป็นสิทธิ์แยกใน
**Settings → Roles** editor จึงร่างได้ แล้วให้อีกคนเป็นคนกดโพสต์

ช่องทางที่เลิกลองแล้วจะส่ง `social.failed` และโพสต์ที่สำเร็จส่ง `social.posted` ไปยัง[webhook](./webhooks#your-own-events)
ที่ระบุไว้และ `cms.on` ส่วน [notify plugin](./notifications) จะแจ้งในแชตเมื่อโพสต์ไม่สำเร็จ

## ตัวเลือก {#options}

| ตัวเลือก | ค่าเริ่มต้น | |
|---|---|---|
| `collections` | `[]` | collection ที่หน้าแก้เอกสารมีปุ่มแชร์ และเป็นเอกสารต้นทางของโพสต์ได้ |
| `url` | — | `({ doc, collection }) => string`: ลิงก์ของเอกสารที่แชร์ |
| `share` | title, textarea แรก, `url`, รูปแรก | `({ doc, collection, cms }) => ({ title, text, link, image })` |
| `channels` | `[webhook]` | ช่องทางที่ส่งโพสต์ (adapter) |
| `slug` | `social-posts` | collection |

## ขั้นต่อไป {#next-steps}

- [การเชื่อมต่อ](./integrations): การเชื่อมต่อและ secret
- [การแจ้งเตือน](./notifications): ข้อความ Telegram เมื่อโพสต์ไม่สำเร็จ
