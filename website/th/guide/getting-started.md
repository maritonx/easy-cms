# เริ่มต้นใช้งาน {#getting-started}

คุณต้องมีโปรเจกต์ Nuxt 4 หรือ Next.js 15+ และ Node.js ≥ 22.12 ใช้ framework อื่น หรือไม่ใช้เลย?
ให้รัน Easy CMS เป็น [standalone server](./standalone)

## เพิ่ม Easy CMS {#add-easy-cms}

ในไดเรกทอรีโปรเจกต์ของคุณ:

```bash
npx create-easy-cms
```

คำสั่งนี้จะตรวจหา Nuxt หรือ Next.js ถามว่าจะใช้ฐานข้อมูลใด ติดตั้งแพ็กเกจ และ:

- สร้าง `easy-cms.config.ts` พร้อมตัวอย่าง collection `posts` และ global `site`
- เพิ่ม `EASY_CMS_SECRET` แบบสุ่มลงใน `.env`
- เพิ่ม `cms.db`, `uploads/` และ `.pglite/` ลงใน `.gitignore`
- **Nuxt:** เพิ่ม `@easy-cms/nuxt` ลงใน `modules`
- **Next.js:** สร้าง `app/api/cms/[[...path]]/route.ts` และ `app/admin/[[...path]]/route.ts`
  และครอบ `next.config.ts` ด้วย `withEasyCMS()`

ตัวเลือก: `--db sqlite|postgres`, `--yes` (ใช้ค่าเริ่มต้น), `--skip-install` รันซ้ำได้อย่างปลอดภัย

## รันระบบ {#run-it}

```bash
npm run dev
```

เปิด `http://localhost:3000/admin` หากยังไม่มีผู้ใช้ หน้า admin
จะให้คุณสร้าง admin คนแรก หรือจะรัน `npx easy-cms create-admin` ก็ได้

ในช่วงพัฒนา (development) schema ของฐานข้อมูลจะเปลี่ยนตาม config ให้อัตโนมัติ แก้ไข
`easy-cms.config.ts` แล้วบันทึก หน้า admin จะแสดง field ใหม่ทันที

## อ่านเนื้อหา {#read-content}

::: code-group

```ts [Nuxt: server/api/posts.get.ts]
export default defineEventHandler(async () => {
  const cms = await useEasyCMS()
  return cms.find('posts', { sort: '-createdAt', limit: 10 })
})
```

```tsx [Next.js: app/page.tsx]
import { getEasyCMS } from '@easy-cms/next'
import config from '@/easy-cms.config'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const cms = await getEasyCMS(config)
  const { docs } = await cms.find('posts', { sort: '-createdAt', limit: 10 })
  return <ul>{docs.map((post) => <li key={post.id}>{post.title}</li>)}</ul>
}
```

:::

โดยค่าเริ่มต้น `find` จะคืนเฉพาะเอกสารที่เผยแพร่แล้ว และ `post.title` มี type เป็น `string`
เพราะ config ระบุว่า field นี้เป็นข้อความที่จำเป็นต้องกรอก

## ขั้นตอนถัดไป {#next-steps}

- ออกแบบโครงสร้างเนื้อหา: [Configuration](./configuration) และ [Fields](./fields)
- กำหนดว่าใครทำอะไรได้บ้าง: [การควบคุมสิทธิ์](./access-control)
- ก่อน deploy ครั้งแรก: [Migration และการ deploy](./deployment)
