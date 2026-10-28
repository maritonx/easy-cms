# ADR-0058: ทางที่ช้าที่ 1M: index คู่กับ status, `like` ขั้นต่ำ 3 ตัวอักษร, connection สำหรับงานเขียน

- **สถานะ:** Accepted
- **วันที่:** 2026-10-28

## บริบท

- ที่ 1,000,000 บทความ ([#257](https://github.com/maritonx/easy-cms/issues/257)) มี request ที่ p95 เป็นวินาที: กรองด้วย relationship (1.8 s), ค้นในบล็อก (6.0 s), `like` ตัวเลข 1–3 หลัก (3.4 s) และเมื่อมี editor 200 คน การบันทึกต้องรอ connection (31 s)
- `EXPLAIN ANALYZE` ที่ 1M:
  - กรองด้วย relationship: ดึงหน้าใช้ 2 ms แต่ `count(*)` ใช้ราว 1 s เพราะ index มีแค่ `author` ส่วน query สาธารณะกรอง `status = 'published'` ด้วย Postgres จึงต้องอ่านทุกแถวของ author นั้นจากตาราง
  - ค้นในบล็อก: `layout @> …` ไม่มี index ใน seed บทความ hero ทุกบทความเป็น draft จึงไม่เจออะไรเลยและไล่ทั้งตาราง (9.6 s) GIN index ช่วยการนับได้บ้าง แต่ไม่ช่วย query ที่ดึงหน้า และใหญ่ราว 280 MB
  - `like` สองตัวอักษร: trigram index ใช้ไม่ได้ (4.4 s) ส่วนสามตัวอักษรใช้ 25 ms
  - การบันทึก: create/update อ่านเอกสารเดิม เช็ก unique และ populate ผ่าน pool เดียวกับ read ที่ช้า

## การตัดสินใจ

- **index คู่กับ `status` ใน collection ที่มี drafts:** field ที่ได้ index อัตโนมัติ (relationship, upload, `index: true`) เป็น `(คอลัมน์, status)` แทน `(คอลัมน์)` ใช้แทนกันได้ทุก query และการนับใช้ index-only scan ได้ (ที่ 1M: 971 ms → 2.6 ms) ใช้ชื่อใหม่ `<table>_<column>_status_idx` ให้ migration drop แล้ว create ใหม่
- **`like` ขั้นต่ำ 3 ตัวอักษร** บน field ที่มี `index: 'trigram'` ใน database ที่มี trigram index (Postgres): สั้นกว่านั้นเป็น `QueryError` (400) admin รอจนพิมพ์ครบ (`searchMin` ใน schema ของ admin) command palette ข้ามเงื่อนไขนี้แต่ยังหาด้วย id ได้ SQLite ไม่เปลี่ยน
- **ค้นในบล็อก: เขียนในเอกสาร ไม่สร้าง index:** วิธีแก้คือคัดค่าที่ใช้กรองออกมาเป็น field ระดับบนที่มี index ด้วย hook พร้อม `CREATE STATISTICS (mcv)` ใน migration เมื่อค่ากับ `status` สัมพันธ์กัน (ที่ 1M: 6.4 s → 0.4 ms)
- **`writeConnections` ของ `postgres()` (opt-in, ค่าเริ่มต้น 0):** pool ที่สองสำหรับ create, update, delete และ updateGlobal ทั้ง operation รวมทุกการอ่านข้างใน core ครอบด้วย `Database.writing()` และ adapter เลือก connection ด้วย AsyncLocalStorage
- **Perf:** แต่ละฝั่งของการวัด A/B สร้างและรัน migration ของตัวเองก่อนเริ่ม เพราะ base กับ head อาจมี index ต่างกัน

## ผลที่ตามมา

- ✅ การนับเมื่อกรองด้วย relationship ไม่ต้องอ่านตาราง
- ✅ ไม่มีใครส่ง `like` สั้นๆ ให้ Postgres ไล่ทั้งตารางได้
- ✅ การบันทึกไม่ต้องรอ read ที่ช้าเมื่อเปิด `writeConnections`
- ⚠️ โปรเจกต์ที่มี collection แบบ drafts ต้องสร้าง migration หลังอัปเกรด (`easy-cms migrate:create`) ก่อน deploy แบบ `verify`
- ⚠️ API client ที่เคยส่ง `like` หนึ่งหรือสองตัวอักษรบน field แบบ trigram จะได้ 400
- ⚠️ `writeConnections` เพิ่มจำนวน connection ทั้งหมด ต้องนับรวมเมื่อเทียบกับ `max_connections`
- ❌ การค้นในบล็อกโดยตรงยังช้าที่ขนาดนี้ ถ้าไม่ใช้วิธีคัดค่าออกมา
