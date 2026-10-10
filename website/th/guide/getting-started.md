# เริ่มต้นใช้งาน {#getting-started}

::: info หน้านี้สอนอะไร
เพิ่ม Easy CMS ให้โปรเจกต์ Nuxt หรือ Next.js (หรือรันแยกเอง) สร้างผู้ดูแลคนแรก และดึงเนื้อหาไปแสดงในหน้าเว็บ

**ควรอ่านก่อน:** [Easy CMS คืออะไร](./what-is-easy-cms)
:::

<Screenshot name="dashboard" alt="แดชบอร์ดของหน้า admin หลัง login" />

คุณต้องมีโปรเจกต์ Nuxt 4 หรือ Next.js 15+ และ Node.js 22.12 ขึ้นไป (ถ้าใช้ Nuxt ต้อง 22.19 ขึ้นไป) ใช้ framework อื่น หรือไม่ใช้เลย?
ให้รัน Easy CMS เป็น [standalone server](./standalone)

## เพิ่ม Easy CMS {#add-easy-cms}

ในไดเรกทอรีโปรเจกต์ของคุณ:

```bash [pm]
npx create-easy-cms
```

คำสั่งนี้จะตรวจหา Nuxt หรือ Next.js ถามว่าจะใช้ฐานข้อมูลใด ติดตั้งแพ็กเกจ และ:

- สร้าง `easy-cms.config.ts` พร้อมตัวอย่าง collection `posts` และ global `site`
- เพิ่ม `EASY_CMS_SECRET` แบบสุ่มลงใน `.env`
- เพิ่ม `cms.db`, `uploads/`, `backups/` และ `.pglite/` ลงใน `.gitignore`
- **Nuxt:** เพิ่ม `@easy-cms/nuxt` ลงใน `modules`
- **Next.js:** สร้าง `app/api/cms/[[...path]]/route.ts` และ `app/admin/[[...path]]/route.ts`
  และครอบ `next.config.ts` ด้วย `withEasyCMS()`

ตัวเลือก: `--db sqlite|postgres`, `--pm npm|pnpm|yarn|bun`, `--yes` (ใช้ค่าเริ่มต้น), `--skip-install` รันซ้ำได้อย่างปลอดภัย คำสั่งในเอกสารมีแท็บของแต่ละ package manager และจำตัวที่คุณเลือกไว้

## รันระบบ {#run-it}

```bash [pm]
npm run dev
```

เปิด `http://localhost:3000/admin` หากยังไม่มีผู้ใช้ หน้า admin
จะให้คุณสร้าง admin คนแรก หรือจะรัน `npx easy-cms admin:create` ก็ได้

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
import { connection } from 'next/server'
import { Suspense } from 'react'
import { getEasyCMS } from '@easy-cms/next'
import config from '@/easy-cms.config'

export default function Home() {
  return (
    <Suspense fallback={<p>กำลังโหลด…</p>}>
      <Posts />
    </Suspense>
  )
}

async function Posts() {
  // อ่านใหม่ทุก request หน้าเว็บจึงแสดงสิ่งที่เพิ่งเผยแพร่
  await connection()
  const cms = await getEasyCMS(config)
  const { docs } = await cms.find('posts', { sort: '-createdAt', limit: 10 })
  return <ul>{docs.map((post) => <li key={post.id}>{post.title}</li>)}</ul>
}
```

:::

**Nuxt:** ถ้าโฟลเดอร์ `server/` เพิ่งสร้างใหม่ ให้รีสตาร์ต `npm run dev` เพื่อให้ Nuxt เห็นโฟลเดอร์นี้

**Next.js:** หน้านี้อ่าน CMS ใหม่ทุก request ด้วย `await connection()` ใน component ที่อยู่ใน
`<Suspense>` วิธีนี้ใช้ได้ทั้งตอนที่เปิดและไม่เปิด `cacheComponents` ใน `next.config.ts` (แอปใหม่จาก
`create-next-app` เปิดไว้ และในกรณีนั้นใช้ `export const dynamic` ไม่ได้)

โดยค่าเริ่มต้น `find` จะคืนเฉพาะเอกสารที่เผยแพร่แล้ว และ `post.title` มี type เป็น `string`
เพราะ config ระบุว่า field นี้เป็นข้อความที่จำเป็นต้องกรอก

## ขั้นต่อไป {#next-steps}

- ออกแบบโครงสร้างเนื้อหา: [Configuration](./configuration) และ [Fields](./fields)
- กำหนดว่าใครทำอะไรได้บ้าง: [การควบคุมสิทธิ์](./access-control)
- ก่อน deploy ครั้งแรก: [Migration และการ deploy](./deployment)
