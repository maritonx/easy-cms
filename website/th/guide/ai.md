# AI

::: info สิ่งที่จะได้เรียนรู้
เชื่อม Claude, GPT, Gemini หรือเซิร์ฟเวอร์ของคุณเองสำหรับฟีเจอร์ AI ของ admin และคุมค่าใช้จ่ายกับความเป็นส่วนตัว

**ก่อนหน้านี้:** [การเชื่อมต่อ](./integrations)
:::

`@easy-cms/plugin-ai` เพิ่มผู้ให้บริการ AI ในหมวด **AI** ของ **Settings → การเชื่อมต่อ**: Anthropic (Claude),
OpenAI (GPT), Google Gemini และเซิร์ฟเวอร์ใดก็ได้ที่มี API แบบ OpenAI (Ollama, OpenRouter) Easy CMS
เรียกผ่าน HTTP จากเซิร์ฟเวอร์ key จึงไม่ไปถึง browser

```bash [pm]
npm install @easy-cms/plugin-ai
```

```ts
import { aiPlugin } from '@easy-cms/plugin-ai'

export default defineConfig({
  // …
  plugins: [aiPlugin()],
})
```

plugin เพิ่ม collection `ai-usage` (บันทึกการใช้งาน ไม่แสดงใน admin) ให้สร้าง migration
(`easy-cms migrate:create ai` ดู [Migrations](./deployment))

## เชื่อมผู้ให้บริการ {#connecting-a-provider}

1. **Settings → การเชื่อมต่อ → AI** แล้วกด **เชื่อมบัญชี** ที่ผู้ให้บริการ
2. อ่านและยอมรับว่าจะส่งอะไรไปให้ผู้ให้บริการ (ครั้งเดียวต่อผู้ให้บริการ ผู้ที่ยอมรับจะถูกบันทึกใน[บันทึกการใช้งาน](./audit-log))
3. วาง **API key** กด **ค้นหา Model** เพื่อเลือก model (ถ้าว่าง: ใช้ค่าเริ่มต้น) แล้ว **บันทึก** ตอนเชื่อมต่อจะถาม
   model หนึ่งคำ การ์ดจะแสดง model และ token ที่ใช้

| ผู้ให้บริการ | key ใน environment (ใช้แทนค่าใน admin) | model เริ่มต้น |
|---|---|---|
| Anthropic | `ANTHROPIC_API_KEY` | `claude-sonnet-5-5` |
| OpenAI | `OPENAI_API_KEY` | `gpt-5-mini` |
| Google Gemini | `GEMINI_API_KEY` | `gemini-flash-latest` |
| OpenAI-compatible | — (**Base URL** ถึง `/v1` และ key ถ้าต้องใช้) | — |

ถ้ามี key ใน environment ผู้ให้บริการนั้นจะมีการเชื่อมต่อ "Environment" ที่ใช้ model เริ่มต้น การ์ดของแต่ละการเชื่อมต่อแสดง
จำนวนคำขอและ token ของเดือนนี้

## ฟีเจอร์ {#features}

ฟีเจอร์ที่ใช้ AI แสดงในกล่อง **ฟีเจอร์ AI** ด้านบนของหมวด AI แต่ละฟีเจอร์ปิดได้ หรือใช้การเชื่อมต่ออื่นแทน
**การเชื่อมต่อหลัก** (ตัวแรกที่เชื่อมไว้ จนกว่าผู้ดูแลจะเลือก) plugin เพิ่มฟีเจอร์ของตัวเองใน `aiFeatures` ของ config

```ts
aiFeatures: [{ id: 'summary', label: 'สรุป', description: 'เขียนเกริ่นนำของโพสต์', default: true }]
```

## Alt text {#alt-text}

เมื่อเชื่อมผู้ให้บริการแล้ว ช่อง **ข้อความแทนรูป** ของรูปในคลังสื่อจะมีปุ่ม **เขียนด้วย AI** model จะดูรูปแล้วเขียนหนึ่งประโยค
ไม่เกิน 125 ตัวอักษร ในภาษาที่กำลังแก้ (ถ้าไม่มีใช้ภาษาหลัก) ข้อความจะไปอยู่ในช่องให้ตรวจ มีป้าย "เขียนโดย AI" และปุ่ม **เลิกทำ**
อยู่ข้าง ๆ จะยังไม่บันทึกจนกว่าคุณกดบันทึก ในช่อง upload รูปที่ยังไม่มี alt text จะมีป้าย **ยังไม่มี alt text** กดแล้วเปิดไฟล์นั้นเพื่อเพิ่ม

ปุ่มนี้แสดงเฉพาะผู้ใช้ที่แก้ไฟล์นั้นได้ และเมื่อฟีเจอร์ **เขียน alt text** เปิดอยู่ กดหนึ่งครั้งนับเป็นหนึ่งคำขอใน limit ประจำวันของผู้ใช้

## Limit {#limits}

ผู้ใช้แต่ละคนส่งได้ไม่เกิน **100 คำขอต่อวัน** (ตาม `timeZone`) คำขอที่ 101 จะถูกปฏิเสธ ผู้ดูแลเปลี่ยนตัวเลขได้ในกล่อง
ฟีเจอร์ AI และกำหนดแยกต่อ role ได้ใน **Settings → Roles** (ใส่ 0: role นั้นใช้ AI ไม่ได้) ในโค้ด:

```ts
aiPlugin({ limits: { perUserPerDay: 50, roles: { editor: 20 } } })
```

กล่องนี้แสดงจำนวนคำขอและ token ของเดือนนี้ แยกตามผู้ใช้และตามฟีเจอร์ ไม่เก็บ prompt หรือคำตอบ เก็บแค่ใครถาม ฟีเจอร์
การเชื่อมต่อ token และเวลา เป็นเวลา 90 วัน

## ในโค้ดของคุณ {#in-your-code}

ถ้าไม่มี plugin `cms.ai` เป็น `null` บนเซิร์ฟเวอร์:

```ts
const result = await cms.ai?.generate(
  {
    feature: 'summary', // หนึ่งใน aiFeatures ที่เปิดอยู่
    system: 'You write short, plain excerpts.',
    prompt: `Summarize in one sentence:\n\n${post.text}`,
    images: [{ media: post.cover }], // หรือ { data: base64, mediaType }
    json: { type: 'object', properties: { excerpt: { type: 'string' } } }, // รูปแบบของคำตอบ
    maxTokens: 300, // ค่าเริ่มต้น 1024
  },
  { user, about: { collection: 'posts', id: post.id } }, // นับเข้า limit ของผู้ใช้
)
result.json // { excerpt: '…' } และมี result.text, result.usage, result.connection
```

ผู้ให้บริการที่ไม่ว่าง (429, 5xx) จะถูกถามซ้ำอีกหนึ่งครั้ง คำขอหนึ่งใช้เวลาได้ไม่เกิน 60 วินาที key ที่ถูกปฏิเสธ (401, 403)
จะทำเครื่องหมายที่การเชื่อมต่อ ขึ้นบนแดชบอร์ด และส่ง [`integration.failed`](./webhooks#when-something-fails)
เช่นไปยัง[การแจ้งเตือน](./notifications) ไม่มี REST endpoint สำหรับ prompt แต่ละฟีเจอร์มี endpoint ของตัวเองที่กำหนด prompt
ไว้บนเซิร์ฟเวอร์

## ตัวเลือก {#options}

| ตัวเลือก | ค่าเริ่มต้น | |
|---|---|---|
| `providers` | ทั้งสี่เจ้า | `'anthropic'`, `'openai'`, `'gemini'`, `'openai-compatible'` |
| `limits.perUserPerDay` | `100` | จำนวนคำขอต่อคนต่อวัน |
| `limits.roles` | — | แยกต่อ role เช่น `{ editor: 20 }` |

## ขั้นต่อไป {#next-steps}

- [การเชื่อมต่อ](./integrations): การเชื่อมต่อ secret และการยอมรับนโยบาย
- [Roles](./roles): limit AI ของ role
