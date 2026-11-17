# Escape hatches {#escape-hatches}

::: info หน้านี้สอนอะไร
ทุกจุดที่โค้ด TypeScript ของคุณเข้ามาทำแทน Easy CMS ได้: route, hook, event, job, คำสั่ง, ตาราง และหน้าจอใน admin
และจุดไหนบ้างที่ข้ามกฎสิทธิ์

**ควรอ่านก่อน:** [การตั้งค่า](./configuration), [สิทธิ์การเข้าถึง](./access-control)
:::

Easy CMS ให้ collection, API และ admin จาก config ไฟล์เดียว ส่วนที่ไม่พอ คุณเขียนเองได้ในโปรเจกต์เดียวกัน
และยังใช้ผู้ใช้ role และข้อมูลชุดเดียวกัน หน้านี้รวมทุกทางไว้

หลักที่อยู่เบื้องหลัง: ทางปกติผ่าน[กฎสิทธิ์](./access-control)ของคุณทุกที่ ทางข้ามกฎมีอยู่ แต่เห็นได้ในโค้ด
(`overrideAccess` ด้านล่าง) ไม่เกิดขึ้นโดยไม่ตั้งใจ

## ฝั่งเซิร์ฟเวอร์ {#on-the-server}

| ต้องการ | ใช้ | |
|---|---|---|
| route ของคุณเอง: รายงาน, webhook รับชำระเงิน, การนำเข้า | `endpoints` | [Endpoints](./plugins#endpoints) |
| โค้ดที่รันเมื่อบันทึก ลบ หรืออ่านเอกสาร | collection hooks | [Hooks](./hooks) |
| after-hook และ webhook ที่เกิดเฉพาะเมื่อการบันทึกสำเร็จจริง | `outbox: true` | [Outbox](./hooks#outbox) |
| หา user หรือ context (tenant, เว็บไซต์) ของแต่ละ request | `onRequest` | [Multi-tenant](./multi-tenant) |
| ปุ่มใน admin ที่รันโค้ดฝั่งเซิร์ฟเวอร์ของคุณ | `actions` | [Actions](./actions) |
| งานตามตารางเวลา ที่ลองใหม่เมื่อล้มเหลว | `jobs` | [Jobs](./jobs) |
| event ของคุณเอง (`order.paid`) ส่งไป webhook และ listener | `events`, `cms.emit()`, `cms.on()` | [Event ของคุณเอง](./webhooks#your-own-events) |
| ให้หน้าเว็บตามการเปลี่ยนแปลงทันทีที่บันทึก | `realtime: true`, `subscribe()` | [Realtime](./realtime) |
| คำสั่ง `easy-cms <command>` ของคุณเอง | `cliCommands` | [CLI](./cli#commands-from-plugins) |
| ชนิด field ที่มีช่องกรอกของตัวเอง | `defineFieldType()` | [ชนิด field ของคุณเอง](./field-types) |
| หลายอย่างข้างบนรวมเป็นชิ้นเดียว | plugin: `(config) => config` | [เขียน plugin เอง](./plugins#writing-a-plugin) |

ทุกตัวได้ `cms` ซึ่งคือ [Local API](./local-api) โค้ดของคุณจึงอ่านเขียนเนื้อหาแบบเดียวกับ admin และ REST

## ตารางของคุณเอง {#your-own-tables}

Easy CMS สร้างและแก้เฉพาะตารางที่มี prefix ของมัน (`ecms_`) ตารางของแอปคุณจึงอยู่ในฐานข้อมูลเดียวกันได้
ดู[ใช้ฐานข้อมูลร่วมกับแอปของคุณ](./databases#sharing-a-database-with-your-app)

- **ข้อมูลที่อยากให้ Easy CMS ดูแล** (กฎสิทธิ์, hook, admin, REST): ทำเป็น collection
  `admin: { group: false }` ซ่อนจากเมนู
- **ตารางที่ใช้แค่ในโค้ดของคุณ:** สร้างด้วย migration ของคุณเองและ query ด้วย client ของคุณเอง
  Easy CMS ไม่ใส่กฎสิทธิ์หรือ hook ให้ตารางที่ไม่ใช่ collection

## ในหน้า admin {#in-the-admin}

admin เป็นแอปที่ build มาแล้ว ขยายด้วย **Web Components** จึงใช้ framework ไหนก็ได้ (Vue, React, Svelte หรือไม่ใช้เลย)
compile component เป็น ES module ไฟล์เดียว

| ต้องการ | ใช้ | |
|---|---|---|
| ช่องกรอกของคุณเองแทนของ field หรือกล่องใต้ field | `admin.component`, `admin.after` | [Admin components](./plugins#admin-components) |
| กล่องในคอลัมน์ข้างของหน้าแก้ไข | `admin.sidebar` | [Admin components](./plugins#admin-components) |
| หน้าของคุณเอง (POS, สต็อก, อนุมัติ) ใน `/admin` | `admin.pages` | [หน้าของ plugin และกล่องบนแดชบอร์ด](./plugins#pages-and-dashboard-panels) |
| กล่องบนแดชบอร์ด | `admin.dashboard` | [หน้าของ plugin และกล่องบนแดชบอร์ด](./plugins#pages-and-dashboard-panels) |
| สิ่งที่ element ได้รับและส่งกลับ | `value`, `api()`, `change`… | [สิ่งที่ element ได้รับ](./plugins#what-the-element-receives) |

หน้าของคุณเองฝังแอปอื่นของคุณใน `<iframe>` ได้ด้วย

## การข้ามกฎสิทธิ์ {#going-around-access-rules}

Local API เชื่อโค้ดของคุณ: `cms.find()`, `cms.update()` และอื่นๆ ข้ามกฎสิทธิ์ เว้นแต่จะส่ง user มา

```ts
// โค้ดของคุณในฐานะระบบ: ไม่มีกฎสิทธิ์
await cms.update('orders', id, { status: 'paid' })

// ทำแทนผู้ใช้คนหนึ่ง: ใช้กฎสิทธิ์ของเขา
await cms.update('orders', id, { status: 'paid' }, { user, overrideAccess: false })
```

ใน endpoint หรือ action ให้ส่ง `{ user, overrideAccess: false }` ทุกครั้งที่ request มาจากคน
เขาจะทำในนั้นไม่ได้ในสิ่งที่ admin และ REST ไม่ให้เขาทำ

## สิ่งที่จะมาถัดไป {#coming-next}

วางแผนไว้ ทำทีละชิ้นตาม [roadmap](https://github.com/maritonx/easy-cms/blob/main/docs/ROADMAP.md#m15):
transaction และ raw SQL (`cms.transaction`, `sql`), `access` ของ endpoint พร้อม `onResponse` และ `onError`,
migration แบบ SQL และ TypeScript พร้อม `easy-cms seed`, `admin: false` ทุก adapter
และ `easy-cms build:admin` ที่ compile component ของ admin จาก Vue, React และ Svelte หน้านี้จะเพิ่มแต่ละอย่างเมื่อออกแล้ว

## ขั้นต่อไป {#next-steps}

- [Plugins](./plugins): รวม escape hatch ของคุณเป็นแพ็กเกจไว้ใช้หลายโปรเจกต์
- [Hooks](./hooks): ลำดับการรันของ hook และสิ่งที่ต้องระวัง
- [Local API](./local-api): ทุก method ที่โค้ดของคุณเรียกได้
