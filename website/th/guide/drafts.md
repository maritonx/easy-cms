# ฉบับร่าง เวอร์ชัน และการตั้งเวลา {#drafts-versions-scheduling}

```ts
{ slug: 'posts', drafts: true, fields: [/* … */] }
```

collection (หรือ global) ที่มี `drafts: true` จะได้ `status` เป็น `draft` หรือ `published` เอกสาร
ใหม่เริ่มต้นเป็นฉบับร่าง (draft)

- **ฉบับร่างไม่จำเป็นต้องครบถ้วน:** จะไม่บังคับ `required` ขณะที่ `status` เป็น `draft` แต่ยังคง
  ตรวจสอบ type
- **การเผยแพร่จะตรวจสอบทุกอย่าง**
- **การอ่านจะคืนเฉพาะเอกสารที่เผยแพร่แล้ว** เว้นแต่จะส่ง `draft: true`: ได้แก่ `find`, `findById`,
  `count`, relationship ที่ถูก populate และ REST API ผ่าน REST นั้น `?draft=true` ใช้ได้เฉพาะ
  ผู้ใช้ที่เข้าสู่ระบบแล้ว

```ts
await cms.find('posts') // published only
await cms.find('posts', { draft: true }) // everything
await cms.update('posts', id, { status: 'published' }) // publish
await cms.update('posts', id, { status: 'draft' }) // unpublish
```

ในหน้า admin ฉบับร่างจะมีปุ่ม **Save draft** และ **Publish** ส่วนเอกสารที่เผยแพร่แล้วจะมี **Save** (ยังคง
เผยแพร่อยู่) และ **Unpublish**

ถ้าไม่เปิด versions เอกสารจะมีสำเนาเดียว การบันทึกเอกสารที่เผยแพร่แล้วเป็นฉบับร่างจะยกเลิกการเผยแพร่เอกสารนั้น
เปิด versions เพื่อแก้ไขฉบับร่างได้โดยที่เวอร์ชันที่เผยแพร่ยังแสดงบนเว็บตามเดิม

## เวอร์ชัน {#versions}

```ts
{ slug: 'posts', drafts: true, versions: true, fields: [/* … */] }
// or versions: { max: 100 } — versions kept per document (default 50)
```

เมื่อเปิด `versions` การบันทึกเอกสาร (หรือ global) ทุกครั้งจะถูกเก็บเป็นเวอร์ชัน:

- **ประวัติ:** ดูรายการเวอร์ชัน ดูเอกสารตามที่เคยเป็นในตอนนั้น และ **กู้คืน** เวอร์ชันใดก็ได้ การกู้คืนจะบันทึก
  เนื้อหาเดิมเป็นเวอร์ชันใหม่ และถ้า collection มีฉบับร่าง จะกู้คืนเป็นฉบับร่าง
- **แยกฉบับร่าง** (เมื่อมี `drafts: true`): การบันทึกฉบับร่างของเอกสารที่ **เผยแพร่แล้ว** จะเก็บฉบับร่างไว้เป็น
  เวอร์ชัน เว็บยังแสดงเนื้อหาที่เผยแพร่อยู่จนกว่าจะกดเผยแพร่อีกครั้ง การอ่านด้วย `draft: true` (หน้า admin,
  preview) จะได้ฉบับร่างที่รอเผยแพร่
- **ยกเลิกการเผยแพร่** เป็นคำสั่งแยก และฉบับร่างที่รอเผยแพร่ **ทิ้ง** ได้เพื่อกลับไปใช้เนื้อหาที่เผยแพร่อยู่
  ฉบับร่างที่ทิ้งแล้วยังอยู่ในประวัติ

```ts
await cms.update('posts', id, { title: 'New title', status: 'draft' }) // live post unchanged
await cms.findById('posts', id) // the published post
await cms.findById('posts', id, { draft: true }) // the pending draft
await cms.update('posts', id, { status: 'published' }) // publish the draft
await cms.discardDraft('posts', id) // or throw it away
await cms.unpublish('posts', id) // take the post off the site

const { docs } = await cms.findVersions('posts', id) // newest first: id, status, latest, author, createdAt
const version = await cms.findVersion('posts', id, docs[1].id) // { ..., data }
await cms.restoreVersion('posts', id, docs[1].id)
```

global มีเมธอดชุดเดียวกัน ได้แก่ `findGlobalVersions`, `findGlobalVersion`, `restoreGlobalVersion`,
`unpublishGlobal` และ `discardGlobalDraft`

ในหน้า admin เอกสารที่มี versions จะมีแผง **History** เอกสารที่เผยแพร่แล้วและมีฉบับร่างรอเผยแพร่จะแสดง
**Unpublished changes** พร้อมปุ่ม **Publish changes**, **Save draft**, **Discard changes** และ **Unpublish**

ข้อควรรู้:

- เฉพาะผู้ใช้ที่มีสิทธิ์ **แก้ไข** เอกสารเท่านั้นที่อ่านเวอร์ชันได้ เพราะเวอร์ชันมีเนื้อหาที่ยังไม่เผยแพร่
- เวอร์ชันเก็บในตารางเดียว (`ecms_document_versions`) ซึ่งถูกเพิ่มเมื่อ collection หรือ global แรกเปิด versions
  ใน production การเปลี่ยนแปลงนี้ต้องใช้ migration เหมือนการเปลี่ยน schema อื่นๆ
- ตัวกรอง `where` และการเรียงลำดับใช้กับเนื้อหาที่เผยแพร่อยู่ ฉบับร่างที่รอเผยแพร่จะแสดงในผลลัพธ์ แต่จะไม่ถูกใช้
  เป็นเงื่อนไขในการค้นหา
- field ที่ซ่อนอยู่ (เช่น password hash) จะไม่ถูกเก็บในเวอร์ชัน

## การตั้งเวลาเผยแพร่ {#scheduled-publishing}

```ts
{ slug: 'posts', drafts: true, schedule: true, fields: [/* … */] }
```

`schedule` ช่วยให้ผู้แก้ไขเนื้อหาตั้งเวลาเผยแพร่หรือยกเลิกการเผยแพร่ได้ (หน้า admin จะมีปุ่ม **Schedule**)
เมื่อเปิด versions การเผยแพร่ตามเวลาที่ตั้งไว้จะนำฉบับร่างที่รอเผยแพร่ขึ้นแสดงบนเว็บ

```ts
await cms.schedule('posts', id, { action: 'publish', at: '2026-10-01T09:00:00+07:00' })
await cms.scheduled('posts', id) // pending jobs, soonest first
await cms.cancelSchedule('posts', id, jobId)
```

การตั้งเวลาคำสั่งเดิมซ้ำจะแทนที่งานที่รออยู่ ส่วน global มี `scheduleGlobal`,
`scheduledGlobal` และ `cancelGlobalSchedule`

**ใครเป็นผู้รันงาน** server ที่รันต่อเนื่อง (Nuxt, `easy-cms serve`, Next.js ที่ host เอง)
จะตรวจสอบทุกนาที บนแพลตฟอร์ม serverless ไม่มีอะไรรันค้างไว้ จึงต้องเรียก endpoint ของงาน
จาก cron:

```json
// vercel.json — Vercel Cron sends Authorization: Bearer $CRON_SECRET
{ "crons": [{ "path": "/api/cms/jobs/run", "schedule": "* * * * *" }] }
```

ตั้งค่า `CRON_SECRET` (หรือ `cronSecret` ใน config) admin ที่เข้าสู่ระบบแล้วก็เรียกได้เช่นกัน และ
`npx easy-cms run-scheduled` จะรันงานที่ถึงเวลาหนึ่งครั้งจาก cron ใดก็ได้ งานที่ล้มเหลว (เช่น การเผยแพร่ที่
ไม่ผ่านการตรวจสอบ) จะถูกบันทึก log และไม่ลองใหม่
