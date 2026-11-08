# โพสต์โซเชียล

::: info สิ่งที่จะได้เรียนรู้
เขียนโพสต์ครั้งเดียว ส่งไปหลายช่องทาง แต่ละช่องทางมีข้อความของตัวเองได้ โพสต์ทันทีหรือตั้งเวลา และดูผลของแต่ละช่องทาง

**ก่อนหน้านี้:** [การเชื่อมต่อ](./integrations)
:::

`@easy-cms/plugin-social` (ทดลอง) เพิ่ม **โพสต์โซเชียล** ในเมนู Content โพสต์หนึ่งมีข้อความ ลิงก์ รูป และช่องทางที่จะส่ง
แต่ละช่องทางมีข้อความของตัวเองได้ ช่องทางคือบัญชีที่เชื่อมไว้ใน **Settings → การเชื่อมต่อ** ช่องทางแรกคือ **webhook**
คือ URL ที่รับแต่ละโพสต์เป็น JSON ที่ลงลายเซ็น เช่น scenario ของ Make, n8n หรือ Zapier ที่โพสต์ต่อไปยัง LinkedIn, Threads, Discord
หรือที่อื่น ส่วน [Facebook Page](#facebook-page) และ [LINE Official Account](#line-oa) เป็นช่องทางในตัว

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

**Settings → การเชื่อมต่อ → โซเชียลและแชต → Webhook (โซเชียล) → เชื่อมบัญชี** ตั้งชื่อ (เช่น "Make → LinkedIn") วาง URL
ของ scenario และใส่ secret ถ้าต้องการลงลายเซ็น ตอนเชื่อมต่อจะส่ง `{ "test": true }` ไปให้ ซึ่ง scenario ข้ามไปได้
การเชื่อมต่อหนึ่งเท่ากับหนึ่งช่องทาง

แต่ละโพสต์ส่งไปเป็น:

```json
{
  "post": 12,
  "channel": "social-webhook:Make → LinkedIn",
  "text": "คู่มือใหม่ออกแล้ว",
  "link": "https://example.com/posts/guide",
  "image": { "url": "https://example.com/api/cms/media/file/guide.png", "alt": "รูปปก" },
  "source": { "collection": "posts", "id": 7 }
}
```

พร้อม `x-easy-cms-signature-v2` และ `x-easy-cms-timestamp` แบบเดียวกับ[webhook](./webhooks#checking-the-signature)
ของ Easy CMS จึงตรวจด้วย `verifyWebhook(body, headers, secret)` ได้ ตอบ `2xx` ถือว่าโพสต์แล้ว ถ้าตอบ `{ "url": "…" }`
โพสต์จะลิงก์ไปที่นั่น

## Facebook Page {#facebook-page}

โพสต์ไปยังเพจที่คุณดูแล ผ่าน **Meta app** ของคุณเอง:

1. ที่ [developers.facebook.com](https://developers.facebook.com/apps) สร้างแอป (ประเภท **Business**)
   แล้วเพิ่ม **Facebook Login for Business**
2. ในการตั้งค่า เพิ่ม redirect URI
   `https://example.com/api/cms/admin/integrations/facebook-page/callback` (ตาม `serverURL` ของคุณ)
3. ตั้ง id และ secret ของแอปบนเซิร์ฟเวอร์:

```bash
META_APP_ID=1234567890
META_APP_SECRET=…
```

จากนั้น **Settings → การเชื่อมต่อ → Facebook Page → เชื่อมกับ Facebook Page** Facebook จะให้ล็อกอินและอนุญาตให้แอป
จัดการเพจ กลับมาที่หน้า admin แล้วเลือกเพจ เพจหนึ่งเท่ากับหนึ่งช่องทาง admin จะได้ Page token ที่ไม่หมดอายุ
เว้นแต่คุณถอนสิทธิ์แอปหรือเปลี่ยนรหัสผ่าน Facebook ซึ่งการ์ดจะแสดงข้อผิดพลาด และต้องเชื่อมเพจใหม่

โพสต์ที่มีรูปจะขึ้นเป็นรูป โดยมีข้อความและลิงก์เป็นคำบรรยาย ถ้าไม่มีรูปจะเป็นโพสต์ลิงก์ พร้อมตัวอย่างลิงก์ของ Facebook
แผงโพสต์มีลิงก์ไปยังโพสต์

::: warning Development mode และ App Review
แอปใหม่อยู่ใน **Development mode** ใช้ได้กับคนที่มีบทบาทในแอป (admin, developer, tester) และเพจที่พวกเขาดูแล
ซึ่งพอสำหรับเว็บของคุณเอง ถ้าจะให้คนอื่นเชื่อมเพจของเขา ต้องผ่าน **App Review** สำหรับ `pages_manage_posts`,
`pages_read_engagement` และ `pages_show_list` และยืนยันธุรกิจ
:::

`FACEBOOK_GRAPH_VERSION` เลือก Graph API เวอร์ชันอื่น (ค่าเริ่มต้น `v26.0`)

## LINE OA {#line-oa}

ส่งโพสต์ถึงเพื่อนทุกคนของ LINE Official Account เป็นการ์ด: รูป หัวข้อ ข้อความ และปุ่มไปยังลิงก์

1. ใน [LINE Official Account Manager](https://manager.line.biz) เปิด **Messaging API** ของบัญชี
   (**ตั้งค่า → Messaging API**) ระบบจะสร้าง channel ใน [LINE Developers Console](https://developers.line.biz/console/)
2. ใน console เปิดแท็บ **Messaging API** ของ channel แล้วออก **channel access token (long-lived)**

**Settings → การเชื่อมต่อ → LINE OA → เชื่อมบัญชี** วาง token และใส่ข้อความบนปุ่มถ้าต้องการ (ค่าเริ่มต้น "Read more")
ตอนเชื่อมจะตรวจ token กับบัญชีและแสดงชื่อ หรือตั้ง `LINE_CHANNEL_ACCESS_TOKEN` บนเซิร์ฟเวอร์ก็ได้

::: warning เพื่อนหนึ่งคนที่ได้รับ = หนึ่งข้อความ
broadcast นับหนึ่งข้อความต่อเพื่อนหนึ่งคนที่ได้รับ เข้าโควตารายเดือนของแพ็กเกจ แพ็กเกจฟรีมีโควตาน้อย ส่วนที่เกิน
จะคิดเงินหรือส่งไม่ได้ แล้วแต่แพ็กเกจ (ดูราคาของ LINE ในประเทศของคุณ) ก่อนโพสต์ แผงจะแสดงจำนวนเพื่อนที่ได้รับโดยประมาณ
และข้อความที่ใช้ไปในเดือนนี้ และเตือนเมื่อโพสต์จะเกินโควตา
:::

ข้อความบนการ์ดตัดที่ 300 ตัวอักษร และรูปต้องเป็น URL `https` LINE ไม่มีลิงก์ของ broadcast แผงจึงแสดงว่าโพสต์แล้วโดยไม่มีลิงก์

## เขียนและแชร์ {#writing-and-sharing}

ปุ่ม **แชร์ไปโซเชียล** ในหน้าแก้เอกสาร (collection ใน `collections`) สร้างโพสต์โซเชียลจากเอกสารนั้น: title, textarea ช่องแรก
(คำโปรย), `url`, รูปแรก และทุกช่องทางที่เชื่อมไว้ ตั้ง `share: ({ doc, collection }) => ({ title, text, link, image })`
เพื่อเติมแบบของคุณเองได้ ลบช่องทางที่ไม่ต้องการออก ข้อความเฉพาะช่องทางจะใช้แทนข้อความของโพสต์ในช่องทางนั้น

## เขียนด้วย AI {#writing-with-ai}

เมื่อใช้ [AI plugin](./ai) ข้อความของโพสต์และข้อความเฉพาะช่องทางจะมีปุ่ม **เขียนด้วย AI** เขียนจากเอกสารที่แชร์ (title และข้อความ
ถ้ายังไม่ได้แชร์อะไรจะใช้ title ของโพสต์) ตามความยาวของช่องทาง (LINE 300 ตัวอักษร ช่องทางอื่น 500) ในภาษาหลัก ข้อความไปอยู่ในช่องให้ตรวจ
พร้อมปุ่ม **เลิกทำ** ถ้ามีข้อความอยู่แล้วจะถามก่อนแทนที่ เป็นฟีเจอร์ **โพสต์โซเชียล** ในการตั้งค่า AI กดหนึ่งครั้งนับเป็นหนึ่งคำขอใน limit ประจำวันของผู้ใช้

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

## ค่าใช้จ่าย {#costs}

ค่าใช้จ่ายในการโพสต์ของแต่ละช่องทาง ณ พฤศจิกายน 2026 ราคาเปลี่ยนได้ ให้ดูหน้าราคาของผู้ให้บริการ

| ช่องทาง | ค่าใช้จ่าย |
|---|---|
| Facebook Page | ฟรี การโพสต์ไปยังเพจของคุณผ่าน Graph API ไม่มีค่าใช้จ่าย |
| LINE OA | หนึ่งข้อความต่อเพื่อนหนึ่งคนที่ได้รับ หักจากโควตารายเดือนของแพ็กเกจ แพ็กเกจฟรีมีโควตาน้อย ([ราคาของ LINE](https://developers.line.biz/en/docs/messaging-api/pricing/) ในประเทศของคุณ) แผงจะแสดงโควตาก่อนโพสต์ |
| Webhook | ตามค่าใช้จ่ายของ scenario แพ็กเกจฟรีของ Make มี 1,000 credit ต่อเดือน ประมาณหนึ่ง credit ต่อการรันหนึ่งโมดูล |
| X | ยังไม่มีในตัว API ของ X จ่ายตามการใช้งาน ไม่มีแพ็กเกจฟรี: [$0.015 ต่อโพสต์ และ $0.20 ถ้ามีลิงก์](https://docs.x.com/x-api/getting-started/pricing) จ่ายจากเครดิตที่ซื้อไว้ก่อน และ Make [เลิกมีแอป X แล้ว](https://help.make.com/x-formerly-twitter-app-integration-discontinued) webhook ไป Make จึงโพสต์ไป X ไม่ได้ |

**โพสต์ที่ตั้งเวลาและการลองซ้ำต้องมีการรันงานบ่อย ๆ** ช่องทางที่ล้มจะลองใหม่หลัง 1, 5 และ 30 นาที และโพสต์ที่ตั้งเวลาจะส่งในการรันครั้งแรกหลังถึงเวลา
บนแพลน Hobby ของ Vercel ที่ cron รันวันละครั้ง ให้เรียก endpoint ของงานจาก [GitHub Actions](./drafts#scheduled-publishing) ทุกไม่กี่นาที

**รูป** รูปของโพสต์คือไฟล์ในคลังสื่อ ถ้าเอกสารที่แชร์ไม่มีรูป (เช่น รูปแชร์ถูกสร้างอัตโนมัติ) โพสต์ก็ไม่มีรูป Facebook ยังแสดงตัวอย่างลิงก์ได้
แต่การ์ด LINE จะไม่มีรูป บทความที่สำคัญควรใส่รูปปก

## ตัวเลือก {#options}

| ตัวเลือก | ค่าเริ่มต้น | |
|---|---|---|
| `collections` | `[]` | collection ที่หน้าแก้เอกสารมีปุ่มแชร์ และเป็นเอกสารต้นทางของโพสต์ได้ |
| `url` | — | `({ doc, collection }) => string`: ลิงก์ของเอกสารที่แชร์ |
| `share` | title, textarea แรก, `url`, รูปแรก | `({ doc, collection, cms }) => ({ title, text, link, image })` |
| `channels` | `[webhook, facebook, line]` | ช่องทางที่ส่งโพสต์ (adapter) |
| `slug` | `social-posts` | collection |

## ขั้นต่อไป {#next-steps}

- [การเชื่อมต่อ](./integrations): การเชื่อมต่อและ secret
- [การแจ้งเตือน](./notifications): ข้อความ Telegram เมื่อโพสต์ไม่สำเร็จ
