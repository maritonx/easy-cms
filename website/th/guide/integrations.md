# การเชื่อมต่อ (Integrations) {#integrations}

**ตั้งค่า → การเชื่อมต่อ** คือที่ที่ผู้ดูแลเว็บเชื่อมบัญชีกับผู้ให้บริการภายนอก เช่น bot ของ Telegram, ผู้ให้บริการ AI หรือเพจ Facebook
plugin เป็นตัวประกาศผู้ให้บริการ ส่วนผู้ดูแลเชื่อมบัญชีได้โดยไม่ต้องแก้ environment variable


## หน้านี้มีอะไร {#the-page}

- **หมวด** ใช้กรองหน้า: โซเชียลและแชท, AI, แจ้งเตือน, อัตโนมัติ และ **ตั้งในโค้ด** ซึ่งแสดง adapter ของอีเมล ที่เก็บไฟล์
  การค้นหา การเข้าสู่ระบบ และการชำระเงินที่ config ตั้งไว้ (อ่านอย่างเดียว)
- **การ์ดต่อผู้ให้บริการ** ที่ plugin เพิ่มเข้ามา: เปิดหรือปิด เชื่อมบัญชี **ทดสอบ** ตั้งเป็นค่าเริ่มต้น แก้ไข หรือ **ตัดการเชื่อม**
  เมื่อปิด plugin จะใช้ไม่ได้ แต่บัญชียังเก็บไว้
- **หลายบัญชีต่อผู้ให้บริการ** ตั้งชื่อแต่ละบัญชีได้ (เพจ Facebook สองเพจ, OpenAI key สองชุด) บัญชีแรกเป็นค่าเริ่มต้น
- plugin ทางการที่ยังไม่ได้ติดตั้งแสดงคำสั่ง `npm install` เพราะ admin ติดตั้ง package เองไม่ได้
- การเชื่อมต่อที่ทดสอบไม่ผ่านหรือใช้งานล่าสุดล้มเหลวจะขึ้นใน "ต้องจัดการ" บนแดชบอร์ด

admin เห็นหน้านี้ รวมถึง [บทบาท](./roles) ที่ได้สิทธิ์ **การเชื่อมต่อ** ส่วนผู้ใช้ที่ถูกจำกัดอยู่ในบางส่วนของเว็บ (tenant) จะไม่เห็น
การเชื่อม แก้ไข ตัดการเชื่อม และเปิด/ปิดผู้ให้บริการ บันทึกลง [audit log](./audit-log)

## Secret {#secrets}

ค่าที่ตั้ง `secret` จะถูกเข้ารหัสในฐานข้อมูล (AES-256-GCM ด้วย key ที่ได้จาก `secret`) และไม่ถูกส่งกลับไปที่ admin
ซึ่งแสดงเป็น `••••1234` เวลาแก้การเชื่อมต่อ ถ้าไม่พิมพ์ secret ใหม่จะใช้ค่าเดิม

หลัง[หมุน secret](./security#rotating-the-secret) การเชื่อมต่อจะอ่านด้วย `previousSecrets` ได้ และเข้ารหัสใหม่ด้วย secret ใหม่ตอนถูกใช้
รัน `easy-cms secrets:rotate` เพื่อทำทั้งหมดในครั้งเดียว แล้วค่อยลบ secret เก่าออก หน้านี้บอกว่ายังเหลือกี่รายการที่ใช้ secret เก่า

**environment variable** ที่ระบุใน `env` ใช้ก่อนค่าใน admin ถ้าตั้งครบทุกช่อง ผู้ให้บริการจะมีการเชื่อมต่อชื่อ "Environment" ที่แก้ใน admin ไม่ได้

## ประกาศ integration {#declaring-an-integration}

plugin เพิ่มของตัวเองใน `integrations` (เว็บประกาศเองก็ได้):

```ts
import { definePlugin } from '@easy-cms/core'

export const telegramPlugin = () =>
  definePlugin((config) => ({
    ...config,
    integrations: [
      ...(config.integrations ?? []),
      {
        id: 'telegram',
        label: 'Telegram',
        category: 'notifications',
        plugin: '@acme/easy-cms-telegram',
        docs: 'https://example.com/guide',
        kind: 'fields',
        fields: [
          { name: 'botToken', label: 'Bot token', secret: true, required: true },
          { name: 'chatId', label: 'Chat ID', required: true },
        ],
        env: { botToken: 'TELEGRAM_BOT_TOKEN' },
        // ตรวจค่าโดยไม่โพสต์อะไร ตอนเชื่อมจะรันก่อนเสมอ
        test: async ({ botToken }) => {
          const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`)
          const body = await res.json()
          return body.ok ? { ok: true, account: body.result.username } : { ok: false, message: body.description }
        },
      },
    ],
  }))
```

plugin อ่านการเชื่อมต่อฝั่ง server และแจ้งผลการใช้งาน:

```ts
const telegram = await cms.integrations.get('telegram') // ค่าเริ่มต้น หรือใส่ { name } เพื่อเลือกตัวอื่น
if (telegram) {
  try {
    await send(telegram.values.botToken, telegram.values.chatId, text)
    await cms.integrations.markUsed('telegram')
  } catch (error) {
    await cms.integrations.markError('telegram', String(error)) // ขึ้นบนการ์ดและแดชบอร์ด
  }
}
```

`get` คืน `null` เมื่อยังไม่ได้เชื่อมหรือผู้ให้บริการถูกปิด
`cms.integrations.all('telegram')` คืนการเชื่อมต่อทั้งหมด (ของ environment ก่อน) เช่นเพื่อส่งไปทุกแชต

### ค้นหาค่า และติ๊กตัวเลือก {#finding-a-value-ticking-options}

ช่องที่มี `lookup` จะมีปุ่ม **ค้นหา** อยู่ข้าง ๆ Easy CMS รัน `lookup` ด้วยค่าที่กรอกไว้แล้ว (ตอนแก้การเชื่อมต่อ
จะใช้ secret ที่เก็บไว้แทนช่องที่เว้นว่าง) แล้วผู้ดูแลเลือกจากรายการ เช่นแชตที่มีคนส่งข้อความหาบอท ช่อง
`multiselect` เป็นกลุ่ม checkbox เก็บเป็น `a,b,c`

```ts
fields: [
  { name: 'botToken', label: 'Bot token', secret: true, required: true },
  {
    name: 'chatId',
    label: 'Chat ID',
    lookup: async ({ botToken }) => (await chatsOf(botToken)).map((c) => ({ value: String(c.id), label: c.title })),
  },
  { name: 'events', type: 'multiselect', options: [{ value: 'order.created', label: 'คำสั่งซื้อใหม่' }, 'form.submitted'] },
]
```

ข้อผิดพลาดที่ `lookup` throw จะขึ้นใต้ช่อง แสดงได้ไม่เกิน 100 รายการ

### OAuth {#oauth}

`kind: 'oauth'` มีปุ่ม **เชื่อม** แทนช่องกรอก Easy CMS เซ็น `state` (ใช้ได้ 10 นาที) แล้วพาผู้ดูแลไปที่ `authorizeUrl`
ผู้ให้บริการพากลับมาที่ `<api>/admin/integrations/<id>/callback` และ `exchange` แลก code เป็นค่าต่างๆ
ถ้ามีหลายบัญชี (เพจทั้งหมดของผู้ใช้) ผู้ดูแลจะเลือกหนึ่งบัญชี:

```ts
{
  id: 'facebook-page',
  label: 'Facebook Page',
  category: 'social',
  kind: 'oauth',
  oauth: {
    authorizeUrl: ({ redirectUri, state }) =>
      `https://www.facebook.com/v21.0/dialog/oauth?client_id=${process.env.META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=pages_manage_posts`,
    exchange: async ({ code, redirectUri }) => {
      const pages = await pagesFor(code, redirectUri) // API ของผู้ให้บริการ
      return { accounts: pages.map((p) => ({ id: p.id, name: p.name, values: { token: p.access_token } })) }
    },
  },
}
```

ทุกอย่างที่ `exchange` คืนมาถูกเข้ารหัส ส่วน id และ secret ของแอปเก็บไว้ใน environment variable

### การยอมรับนโยบาย {#consent}

`consent: { text, policy? }` แสดงก่อนการเชื่อมต่อครั้งแรก เช่นบอกว่าข้อความที่ส่งไปให้ผู้ให้บริการ AI จะออกจากเว็บ
ผู้ดูแลยอมรับครั้งเดียว (**ยอมรับและเชื่อมต่อ**) และผู้ที่ยอมรับถูกบันทึกใน audit log ถ้ายังไม่ยอมรับจะเชื่อมต่อไม่ได้ ส่วน `test`
จะได้ `name` ของการเชื่อมต่อด้วย

### โลโก้ {#logo}

`icon` คือโลโก้ของผู้ให้บริการที่แสดงในแถวและใน drawer เป็น path ของ SVG เช่นจาก
[simple-icons](https://simpleicons.org) (CC0) หรือชื่อไอคอนของ admin (`'globe'`) ถ้าไม่มีจะแสดงตัวอักษรแรก

```ts
import { siTelegram } from 'simple-icons' // ใส่เป็น devDependency: bundler เก็บไว้แค่ไอคอนนี้

icon: { paths: [{ d: siTelegram.path }], color: `#${siTelegram.hex}` }
```

path ที่ไม่มี `fill` ใช้สี `color` หรือสีตัวอักษรถ้าสีแบรนด์มองไม่เห็น (เช่นโลโก้ดำในโหมดมืด) ส่วน `viewBox` ค่าเริ่มต้นคือ
`0 0 24 24` รับเฉพาะ path และสีแบบ `#rrggbb` admin ไม่วาดอย่างอื่น โลโก้เป็นเครื่องหมายการค้าของเจ้าของ ใช้เพื่อบอกว่าเป็นบริการใด
โลโก้ของปลั๊กอินทางการมาจาก simple-icons และของ OpenAI มาจากชุด `logos` ของ Iconify (ทั้งสองเป็น CC0)

## ขั้นต่อไป {#next-steps}

- [Plugins](./plugins): เขียน plugin
- [ความปลอดภัย](./security): secret และการหมุน secret
