# Studio

::: info สิ่งที่จะได้เรียนรู้
ลองใช้ Easy CMS ในเบราว์เซอร์ที่ [studio.easycms.dev](https://studio.easycms.dev) เริ่มจากเทมเพลต แก้ config
แล้วดูหน้า admin เปลี่ยนตาม ดูในมุมของแต่ละ role แล้วนำ config ไปใช้ในโปรเจกต์ด้วยคำสั่งเดียว

**อ่านก่อนหน้านี้:** ไม่ต้อง **อ่านต่อ:** [เริ่มใช้งาน](./getting-started)
:::

Studio แสดง `easy-cms.config.ts` ทางซ้าย และหน้า admin ที่ config นั้นสร้างทางขวา ทุกครั้งที่แก้ (หลังหยุดพิมพ์ครู่หนึ่ง)
Studio จะเริ่ม CMS ใหม่ด้วย config ใหม่ และหน้า admin แสดงผลโดยอยู่หน้าเดิม ไม่ต้องติดตั้งอะไรและไม่ต้องมีบัญชี
Easy CMS ตัวจริงรันในเบราว์เซอร์บนฐานข้อมูลในหน่วยความจำ และสิ่งที่คุณพิมพ์ไม่ถูกส่งไปที่ server

## เริ่มจากเทมเพลต {#templates}

Studio เปิดมาด้วย Blog ปุ่ม **Templates** ในแถบด้านบนมีเทมเพลต 10 แบบ แบบละประเภทระบบ แต่ละแบบมีข้อมูลตัวอย่างของตัวเอง

| เทมเพลต | สิ่งที่แสดง | ลิงก์ |
| --- | --- | --- |
| Blog | draft, หมวดหมู่, plugin SEO | [`?template=blog`](https://studio.easycms.dev/?template=blog) |
| Company website | หน้าเว็บที่จัดจาก block, global, plugin SEO | [`?template=company`](https://studio.easycms.dev/?template=company) |
| Online shop | สินค้า ลูกค้า และคำสั่งซื้อพร้อมรายการ (array, relationship) | [`?template=shop`](https://studio.easycms.dev/?template=shop) |
| Booking | บริการ พนักงาน และการจองที่ใครก็จองได้แต่เฉพาะพนักงานที่เห็น | [`?template=booking`](https://studio.easycms.dev/?template=booking) |
| CRM | บริษัท ผู้ติดต่อ และดีลตามขั้นตอนการขาย | [`?template=crm`](https://studio.easycms.dev/?template=crm) |
| Job board | ตำแหน่งงานและใบสมัคร พร้อมกฎสิทธิ์ | [`?template=jobs`](https://studio.easycms.dev/?template=jobs) |
| Restaurant | เมนูภาษาไทยและอังกฤษ ([หลายภาษา](./localization)) | [`?template=restaurant`](https://studio.easycms.dev/?template=restaurant) |
| Online courses | คอร์ส บทเรียน ผู้สอน และผู้เรียน (has many) | [`?template=courses`](https://studio.easycms.dev/?template=courses) |
| Real estate | ประกาศขายหรือเช่าที่ใช้ group, ตัวแทน, ข้อความสอบถาม | [`?template=real-estate`](https://studio.easycms.dev/?template=real-estate) |
| Multi-tenant SaaS | ลูกค้าแต่ละรายเห็นเฉพาะโปรเจกต์ของตัวเอง ([multi-tenant](./multi-tenant)) | [`?template=saas`](https://studio.easycms.dev/?template=saas) |

เลือกเทมเพลตแล้ว โค้ดจะถูกแทนที่ และฐานข้อมูลจะเริ่มใหม่พร้อมข้อมูลตัวอย่างของเทมเพลตนั้น ถ้าคุณแก้โค้ดไว้ Studio จะถามก่อน
และมีปุ่มให้คัดลอกโค้ดเก็บไว้ ปุ่ม **↺** ในแถบด้านบนคืนข้อมูลตัวอย่างโดยไม่แตะโค้ด

## แก้ config {#edit}

editor รู้จัก type ทั้งหมดของ Easy CMS มีคำแนะนำขณะพิมพ์ และขีดเส้นใต้จุดที่ผิด

- **config ที่ใช้ไม่ได้** (compile ไม่ผ่าน, ไม่ valid หรือ CMS เริ่มไม่ได้) หน้า admin ที่ใช้ได้ล่าสุดจะยังอยู่ และ error
  แสดงใต้โค้ดพร้อมเลขบรรทัด
- **type problem** ที่ config ยังรันได้ จะแสดงเป็นตัวเลขข้างสถานะ คลิกแล้วไปที่จุดแรก
- **Console** ใต้โค้ดแสดงสิ่งที่ Easy CMS log ไว้ เช่น schema ที่ push, ข้อมูลตัวอย่างที่เพิ่ม และอีเมลที่ hook ส่ง

## ดูหน้า admin ในมุมของแต่ละ role {#view-as}

ช่อง **View as** ในแถบด้านบนแสดงหน้า admin ในฐานะผู้ใช้ของแต่ละ role ใน config (`auth.roles` ค่าเริ่มต้นคือ Admin
และ Editor บวก role ที่คุณเพิ่ม) สลับแล้วอยู่หน้าเดิม จึงเห็นผลของกฎสิทธิ์ในมุมของแต่ละ role ได้ทันที เช่น collection
ที่ให้แค่ admin สร้าง จะไม่มีปุ่ม **Create new** เมื่อดูเป็น Editor ดู [กำหนดสิทธิ์](./access-control)

## แชร์ และนำไปใช้ในโปรเจกต์ {#share}

ที่อยู่ในแถบเบราว์เซอร์เก็บ config ไว้เสมอ โดยบีบอัดไว้ในส่วน `#…` พร้อมเวอร์ชันของ Easy CMS ที่ใช้รัน ลิงก์จึงคือ config
นั่นเอง ปุ่ม **Share link** (หรือ ⌘S / Ctrl+S) คัดลอกลิงก์ให้ และส่วน `#…` ไม่ถูกส่งไปที่ server

ปุ่ม **Use in a project** ให้คำสั่งที่สร้างโปรเจกต์จากลิงก์นั้น:

```bash
npm create easy-cms@latest -- --from "https://studio.easycms.dev/#v=…&c=…"
```

คำสั่งนี้เขียน `easy-cms.config.ts` ตามลิงก์ (ถ้ามีไฟล์อยู่แล้วจะเขียนไว้ข้างกันเป็น `easy-cms.config.studio.ts`) ใช้ฐานข้อมูลตาม
adapter ใน config และติดตั้งแพ็กเกจ `@easy-cms` ทุกตัวที่ config import โดยติดตั้งอย่างน้อยเวอร์ชันที่ลิงก์ทำไว้
ถ้าเวอร์ชันนั้นใหม่กว่า `create-easy-cms` ดู [เริ่มใช้งาน](./getting-started#from-a-config-made-in-studio) และ [CLI](./cli)

## config import อะไรได้บ้าง {#imports}

| แพ็กเกจ | ใน Studio |
| --- | --- |
| `@easy-cms/core`, `fields`, `db-memory` | ตัวจริง |
| `plugin-seo`, `plugin-redirects`, `plugin-multi-tenant`, `plugin-nested-docs`, `plugin-form-builder`, `plugin-social` | ตัวจริง พร้อมแผงและหน้าใน admin |
| `db-sqlite`, `db-postgres` | ใช้ SQLite ในหน่วยความจำแทน |
| `storage-s3`, `storage-vercel-blob`, `storage-netlify-blobs` | เก็บไฟล์ในหน่วยความจำแทน |
| `email-smtp` | อีเมลแสดงใน console |
| `auth-oauth` | ปิด single sign-on |
| plugin อื่น (AI, analytics, backups, ecommerce, email, GraphQL, MCP, notify) | ยังรันในเบราว์เซอร์ไม่ได้ จึงไม่เปลี่ยน config และ console จะบอกไว้ |

การ `import` จากแพ็กเกจอื่นจะขึ้น error ใน Studio แต่ในโปรเจกต์จริงใช้ได้ตามปกติ

## ควรรู้ {#limits}

- **ทุกอย่างอยู่ในหน่วยความจำ** reload หน้าแล้วโค้ดยังอยู่ (เก็บไว้ในที่อยู่และในเบราว์เซอร์) แต่ข้อมูลจะเริ่มใหม่จากข้อมูลตัวอย่าง
- **ไม่มี environment variable** `process.env` ว่าง ถ้า config ไม่มี secret ยาว 32 ตัวอักษร Studio จะใส่ secret ของตัวเองให้
- **บนมือถือ** ดูหน้า admin และเลือกเทมเพลตได้ ส่วนการแก้โค้ดต้องใช้คอมพิวเตอร์
- **Full screen** (⤢ หรือ ⌘\ / Ctrl+\ นอกหน้า admin) ให้หน้า admin กว้างเต็มจอ เส้นแบ่งระหว่างโค้ดกับ admin
  ลากได้ (หรือใช้ปุ่มลูกศร)
- **ธีม** Studio และหน้า admin ตามธีมของระบบ หรือเลือกเองได้ที่ปุ่มธีมในแถบด้านบน
