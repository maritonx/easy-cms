# ADR-0070: Realtime: แอป subscribe การเปลี่ยนแปลงของ collection

- **สถานะ:** Accepted
- **วันที่:** 2026-11-14
- **เกี่ยวข้อง:** [ADR-0069](0069-typescript-backend-six-levels.md) (ระดับ 2), [ADR-0052](0052-postgres-job-queue.md) (ประสาน instance ด้วยฐานข้อมูลอย่างเดียว), [ADR-0053](0053-outbox-for-after-hooks.md) (outbox), [ADR-0051](0051-reference-architecture.md), [ADR-0067](0067-multi-runtime.md)

## บริบท

- ระดับ 2 ของ roadmap (ADR-0069) มี "realtime" เป็นชิ้นถัดไป: แอปอยากให้รายการหรือเอกสารอัปเดตตามที่คนอื่นบันทึก
  โดยไม่ต้องโหลดหน้าใหม่หรือ poll REST เอง
- instance หลายตัวประสานกันผ่านฐานข้อมูลอย่างเดียว (poll + claim, ADR-0052) ไม่มี Redis
- outbox (ADR-0053) เป็นคิวงาน: เขียนเฉพาะเมื่อมี hook หรือ webhook และลบแถวเมื่อรันสำเร็จ จึงใช้เป็นบันทึก event ไม่ได้
- core รันบน Node, Bun, Deno และ Cloudflare Workers (ADR-0067) และใน route ของ Next.js และ Nuxt
- ตกลงกับเจ้าของโปรเจกต์ (2026-11-14) ก่อนลงมือ

## การตัดสินใจ

- **ขอบเขตของชิ้นแรก:** แอป subscribe การเปลี่ยนแปลงของ collection เท่านั้น
- **transport:** Server-Sent Events (`text/event-stream`) อ่านได้ด้วย `fetch` และ `EventSource`, ผ่าน proxy และ HTTP/2 ได้
  - message มีสามส่วน: `id`, `event`, `data` (JSON) WebSocket ภายหลังส่งสามส่วนเดียวกันเป็น JSON ได้ (`sseMessage` ใน `rest/realtime.ts` เป็นที่เดียวที่แปลง)
- **เปิดทีละ collection:** `realtime: true` บน collection, ตัวเลือกรวมที่ `realtime` ของ config:
  `{ retentionHours: 24, pollMs: 1000, heartbeatMs: 25000, maxPerUser: 10, maxConnections: 1000 }`
  - เฉพาะ collection ที่เปิดเขียน event, ตาราง `realtime-events` มีเมื่อมีอย่างน้อยหนึ่ง collection เปิด (เหมือน `outbox: true`)
  - เป็นส่วนของ core ไม่ใช่ plugin
- **ตารางใหม่ `realtime-events`:** `id` (serial), `collection`, `docId`, `event`, `draft`, `published`, `before`, `createdAt`
  - `event`: `create`, `update`, `delete`, `publish`, `unpublish` แยก publish/unpublish แบบเดียวกับ `changeEvents`
  - `draft`: เปลี่ยนเฉพาะฉบับร่างที่เก็บเป็น version (เอกสารที่ publish อยู่ไม่เปลี่ยน) ส่งเฉพาะคนที่อ่านฉบับร่าง
  - `published`: publish อยู่ก่อนหรือหลังการเปลี่ยน (เสมอถ้าไม่มี drafts) คนที่อ่านเฉพาะฉบับ publish ไม่ได้อะไรถ้าเป็น false
  - `before`: JSON ของแถวเอกสารที่เก็บอยู่ก่อน update หรือ delete (ไม่รวม `passwordHash`) ใช้ตรวจว่าใครเห็นมันก่อนการเปลี่ยน
    ไม่เคยส่งออกไป (ไม่อยู่ใน `data` ของ SSE หรือของ `cms.subscribe`) create ไม่มี
  - **ไม่ส่งเอกสารจากตาราง:** ตอนส่งโหลดเอกสารใหม่ให้ผู้ subscribe แต่ละคน ด้วย `cms.find({ where: and(where ของ subscription, id), overrideAccess: false, user, context, draft, depth, locale })`
    จึงได้สิทธิ์ระดับ collection (รวม `readWhere`), grant ของ API key, สิทธิ์อ่านระดับ field (`output`) และฉบับร่างเหมือน REST ทุกอย่าง
  - ผู้เยี่ยมชมที่ subscribe แบบเดียวกันและ context เดียวกันใช้การโหลดร่วมกันต่อ event
- **เขียนใน transaction เดียวกับการบันทึก:** แถวส่งผ่านพารามิเตอร์ `outbox` ของ adapter (ตอนนี้รับ array ได้ เมื่อเปิดทั้ง outbox และ realtime)
  - adapter ที่ไม่ประกาศ `outbox: true` (เขียนใน transaction ไม่ได้): เขียนทันทีหลังบันทึก และ log เตือนตอนเริ่ม ถ้า process ตายระหว่างนั้นเสียหนึ่ง event
  - ส่ง array เฉพาะเมื่อมีมากกว่าหนึ่งแถว adapter ภายนอกที่รับแถวเดียวยังใช้ได้ถ้าไม่เปิดทั้งสองอย่าง
- **ลำดับและ id:** `id` ของแถวคือ `id:` ของ SSE และ cursor ของ `Last-Event-ID`
  - Postgres ให้ id ก่อน commit transaction ที่ช้ากว่าอาจ commit id ที่น้อยกว่าทีหลัง ตัวอ่านจึงหยุดที่ช่องว่างของ id
    และรอสูงสุด 10 วินาที (transaction ที่ rollback ทิ้งช่องว่างถาวร) เพื่อส่งตามลำดับและไม่ข้าม event
  - event ของเอกสารเดียวกันเรียงถูกเสมอ: แถว event เขียนหลังแถวเอกสารใน transaction ซึ่งล็อกเอกสารอยู่
- **ลบแถวเก่า:** scheduler ทุก 60 วินาที (`runJobs`) ลบแถวที่เก่ากว่า `retentionHours` ทีละ 500 เหมือน prune อื่น และเก็บแถวล่าสุดไว้เสมอ
- **event ต่อผู้ subscribe:**
  - `create`, `update`, `publish`, `unpublish`: ส่ง `{ collection, id, doc }` เมื่ออ่านได้และตรง `where`
  - อ่านไม่ได้หรือไม่ตรง `where` แล้ว: ส่ง `leave` (`{ collection, id }`) **เฉพาะคนที่เห็นเอกสารนั้นก่อนการเปลี่ยน**
    (แก้ 2026-11-14 ตามที่เจ้าของโปรเจกต์อนุมัติ: เดิมส่งให้ทุกคนที่อ่าน collection ได้ ซึ่งบอก id ที่สิทธิ์ระดับแถวหรือ `where` ซ่อนไว้)
    - "เห็นก่อน" = แถว `before` ตรงกับ subscription (collection, id, `where`) และผ่านสิทธิ์อ่านของผู้ subscribe ตอนนี้
      (`readWhere` รวม grant ของ API key และฉบับร่างตามที่อ่านได้: คนที่อ่านเฉพาะฉบับ publish ต้องเป็น `status: published`)
    - ตรวจในหน่วยความจำด้วย `matchesWhere` บนแถวที่เก็บ (where จับกับแถวที่เก็บเหมือน `find` แม้มีฉบับร่างค้าง)
      รองรับ `equals`, `not_equals`, `in`, `not_in`, `gt`/`gte`/`lt`/`lte`, `exists`, `and`/`or`, path ใน group และค่าหลายภาษา, relationship เทียบด้วย id
    - ไม่แน่ใจ (เช่น `like`, ค่าใน array หรือ hasMany) หรือไม่มี `before` (create, หรือแถวที่เขียนก่อนมีคอลัมน์นี้): ถือว่าไม่เห็น ไม่ส่ง `leave`
      ข้อเสียคือ client ที่มีเอกสารนั้นอาจค้างไว้จนโหลดใหม่ เลือกฝั่งนี้เพราะไม่รั่ว id
    - ใช้ได้ทั้ง event สดและตอน replay ด้วย `Last-Event-ID` เพราะ `before` อยู่ในแถว
  - `delete`: `{ collection, id }` กติกาเดียวกัน: เฉพาะคนที่เห็นเอกสารก่อนลบ
  - คนที่อ่านเฉพาะฉบับ publish ได้ `leave` แทน `unpublish` และไม่เคยได้ฉบับร่าง
  - หนึ่ง event ต่อ connection แม้หลาย subscription เห็น ใช้เอกสารของ subscription แรกที่อ่านได้
- **auth:** เหมือน REST: session cookie (เบราว์เซอร์) หรือ API key / token ใน `Authorization` ไม่รับ token จาก URL
  - ผู้เยี่ยมชม subscribe collection ที่สิทธิ์อ่านอนุญาต
  - ตรวจสิทธิ์และ `where` ตอนเปิด (`cms.count(..., max: 0)`) ปฏิเสธด้วย 400/401/403 ก่อนเริ่ม stream
  - stream ตรวจ session หรือ key ซ้ำทุกนาที ถ้าหมดอายุหรือถูกยกเลิกจะปิด แล้ว client เชื่อมต่อใหม่ในฐานะผู้ใช้ปัจจุบัน
- **endpoint:** `GET <api>/realtime?s=…&s=…` หนึ่งการเชื่อมต่อหลาย subscription (ไม่เกิน 20) เปลี่ยน subscription = เชื่อมต่อใหม่
  - แต่ละ `s` คือ path ใต้ API กับ query ของมัน เหมือนการอ่านผ่าน REST ทุกอย่าง เข้ารหัสเป็นพารามิเตอร์เดียว:
    `posts`, `posts/12`, `posts?where[category][equals]=news`, `posts?where={"…"}&draft=true&depth=0&locale=th`
  - `where` ใช้ตัวแปลงของ REST (`parseListQuery`) จึงรับทั้งแบบวงเล็บและ JSON
  - route ใช้เมื่อมี collection ที่เปิด realtime เท่านั้น และ config ที่เปิด realtime ห้ามมี collection ชื่อ `realtime`
- **รูปแบบ SSE:** `id:` id ของ event; `event:` ชื่อ; `data:` JSON
  - `ready` หลังเปิด (หลังสิ่งที่พลาดไปถ้าต่อจากเดิม) มี `id:` ตำแหน่งปัจจุบัน; `reset` เมื่อต่อจากเดิมไม่ได้; `retry: 2000` ตอนเริ่ม
  - heartbeat เป็น comment ทุก `heartbeatMs` และเลื่อน `id:` ไปตำแหน่งที่ประมวลแล้ว (event ที่ผู้ subscribe มองไม่เห็นก็นับ) ให้ reconnect ไม่ต้องย้อนไกล
  - header `cache-control: no-cache, no-transform` (การบีบอัดของ Next.js ข้ามเมื่อมี `no-transform`) และ `x-accel-buffering: no`
- **ต่อจากเดิม:** `Last-Event-ID` ส่งสิ่งที่ผู้ subscribe เห็นได้หลัง id นั้น
  - `reset` ถ้าแถวหลัง id นั้นอาจถูกลบไปแล้ว (ไม่เหลือแถวที่ id ≤ ค่านั้นและแถวแรกไม่ใช่ค่านั้น +1), id มากกว่าแถวล่าสุด (ฐานข้อมูลเปลี่ยน),
    ค่าไม่ใช่ตัวเลข หรือตามหลังเกิน 1,000 event (โหลดใหม่ถูกกว่า)
- **ขีดจำกัด:** `maxPerUser` ต่อผู้ใช้ ต่อ API key หรือต่อ IP ของผู้เยี่ยมชม ได้ 429 พร้อม `Retry-After: 30`; `maxConnections` ต่อเซิร์ฟเวอร์ได้ 503 พร้อม `Retry-After: 10`
  - นับต่อ process (ต่อ isolate บน Workers) ไม่นับข้าม instance
  - subscription ของ Local API ไม่นับ
- **กระจายข้าม instance:** แต่ละเซิร์ฟเวอร์อ่านตารางทุก `pollMs` ครั้งเดียวสำหรับทุก stream ของมัน แล้วส่งให้ stream ของตัวเอง
  - หลังบันทึกบน instance เดียวกันอ่านทันที (ไม่ต้องรอ `pollMs`)
  - ไม่ใช้ LISTEN/NOTIFY หรือ Redis ตาม ADR-0052
  - **Cloudflare Workers:** request หนึ่งเขียนลง stream ของอีก request ไม่ได้ และไม่มี Durable Objects แต่ละ stream จึง poll เอง (หนึ่ง query ต่อ stream ทุก `pollMs`) ยอมรับและเขียนไว้ในเอกสาร
- **runtime:**
  - `@easy-cms/next` route handler คืน `Response` ที่มี stream ตรงๆ
  - `@easy-cms/nuxt`: `sendWebResponse` ของ h3 stream ได้แต่ไม่หยุดอ่านเมื่อ client ปิด (stream จะไม่จบ) handler ของ Nuxt จึงเขียน event stream เองและ cancel เมื่อ connection ปิด
  - `easy-cms serve` ส่งผ่าน `pipeline` ซึ่ง cancel body เมื่อ client ปิด และไม่ log "Premature close" อีก
  - `easy-cms build --target workers` ใช้โหมด poll ต่อ stream
  - serverless (Vercel, Netlify) ตัด stream ที่เวลาสูงสุดของฟังก์ชัน client เชื่อมต่อใหม่ด้วย `Last-Event-ID` ไม่พลาดอะไร
- **Local API:** `cms.subscribe(slug, { where?, id?, draft?, depth?, locale?, after?, user?, overrideAccess? })` คืน async iterator ของ event เดียวกัน พร้อม `ready` และ `close()`
  - ใช้ตาราง event เหมือน stream (ไม่ใช่ `cms.on`) จึงได้การบันทึกจากทุก instance, มี `eventId` ต่อจากเดิมได้ และส่งตามลำดับเดียวกัน
  - เชื่อผู้เรียกเหมือน Local API อื่น (`overrideAccess` ค่าเริ่มต้น true) และอ่านเฉพาะฉบับ publish ถ้าไม่ส่ง `draft: true` เหมือน `find`
- **client:** `@easy-cms/core/client` มี `subscribe(subscriptions, { onEvent, onReady, onReset, onError })` อ่านด้วย `fetch` (header ใช้ได้),
  แปลง SSE เอง, เชื่อมต่อใหม่แบบ backoff 1–30 วินาทีพร้อม jitter และ `Last-Event-ID`, หยุดเมื่อได้ 400/401/403/404
  - `live(collection, query, onChange)`: รายการ (หรือเอกสารเดียวด้วย `id`) โหลดหลัง `ready` ครั้งแรก เก็บ event ระหว่างโหลดไว้แล้วใช้ต่อ โหลดใหม่เมื่อ `reset`
    เรียงตาม `sort` (ค่าเริ่มต้น `-createdAt`) และตัดตาม `limit`
  - `useLive(client, collection, query, initial?)` ของ React (`@easy-cms/next/live`) และ Vue (auto-import ใน `@easy-cms/nuxt`) ห่อ `live()`

## สิ่งที่ยังไม่ทำ (PR ถัดไป)

- การอัปเดตสดในหน้า admin และ presence (ใครแก้เอกสารเดียวกันอยู่)
- channel ที่กำหนดเอง, WebSocket, response แบบ streaming
- global
- `cms.increment()` ไม่เขียน event (เหมือนที่ไม่ส่ง webhook)

## ผลที่ตามมา

- ✅ แอปได้รายการที่อัปเดตเองด้วยโค้ดไม่กี่บรรทัด ตามสิทธิ์เดียวกับ REST โดยไม่เพิ่ม infra
- ✅ ไม่มี event หายหรือ event ที่ไม่มีการบันทึกบน adapter ที่เขียนใน transaction ได้ และ client ที่หลุดไปได้สิ่งที่พลาดกลับมา
- ⚠️ ทุก instance query ตารางทุก `pollMs` เมื่อมีผู้ subscribe และอ่านเอกสารหนึ่งครั้งต่อผู้ subscribe ต่อ event ผู้ subscribe จำนวนมากบน collection ที่แก้บ่อยมีค่าอ่าน
- ⚠️ บน Workers ค่า query คูณจำนวน stream
- ✅ `leave` และ `delete` ไปถึงเฉพาะคนที่เห็นเอกสารก่อนการเปลี่ยน ไม่บอก id ที่สิทธิ์หรือ `where` ซ่อนไว้
- ⚠️ แต่ละแถวเก็บเอกสารก่อนการเปลี่ยนไว้ `retentionHours` ตารางจึงโตตามขนาดเอกสาร
- ⚠️ `where` หรือสิทธิ์ที่ตรวจในหน่วยความจำไม่ได้ (`like`, array) ไม่ได้ `leave` client ค้างเอกสารนั้นจนโหลดใหม่
- ⚠️ ช่องว่างของ id ที่ไม่ปิด (rollback, sequence ข้ามหลัง Postgres crash) หน่วง event ถัดไปสูงสุด 10 วินาที
- ⚠️ ตาราง `realtime-events` ต้องมี migration เมื่อเปิด realtime ครั้งแรก
