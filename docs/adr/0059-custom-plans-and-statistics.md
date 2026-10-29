# ADR-0059: วางแผน query ตามค่าจริง และสถิติของ field คู่กับ status บน Postgres

- **สถานะ:** Accepted
- **วันที่:** 2026-10-28

## บริบท

- หลัง [ADR-0058](0058-slow-paths-at-1m.md) รอบ Perf A/B แสดงว่าการกรองด้วย relationship ที่ 1M ได้ p50 ลดจาก 173 เป็น 60 ms แต่ p95 ยังราว 1.6 s
- สาเหตุแรก: postgres.js ใช้ prepared statement หลังรันไม่กี่ครั้ง Postgres อาจเปลี่ยนไปใช้แผนแบบ generic ที่ไม่รู้ค่า author ซึ่งอ่านทุกแถวของ author แล้วค่อยเรียง (บังคับแผนแบบนี้ในเครื่อง ใช้ 16 s ขณะที่แผนตามค่าจริงใช้ 31 ms, ผ่าน adapter จริงช้าสุด 39.6 s)
- สาเหตุที่สอง ซึ่งทำให้เกิด p95: Postgres ถือว่า author กับ status ไม่เกี่ยวกัน author ที่ทุกบทความเป็น draft (ใน seed มี 10 จาก 50 คน, ในเว็บจริงคือ author ที่ยังไม่เคย publish) จึงถูกคาดว่ามีบทความ published และ Postgres ไล่ index `published_at` ทั้งหมดเพื่อหา

## การตัดสินใจ

- **`customPlans` ของ `postgres()` เปิดเป็นค่าเริ่มต้น:** ส่ง `plan_cache_mode = force_custom_plan` ตอนเปิด connection ยกเว้นตั้ง `prepare: false` (หรือ `?prepare=false`) ซึ่งวางแผนตามค่าอยู่แล้ว ค่าใช้จ่ายของการวางแผนราว 0.5 ms
- **สถิติ `(mcv)` ของทุก index ที่คู่กับ `status`** บน Postgres (`<table>_<column>_status_stats`) เก็บใน META ของ snapshot ทั้ง migration และ push สร้าง ลบ และ `ANALYZE` ให้ Drizzle-kit ไม่รู้จัก statistics จึงจัดการเองแบบเดียวกับ `localization`
- SQLite ไม่มีสถิติแบบนี้ schema และ hash ของ SQLite จึงไม่เปลี่ยน

## ผลที่ตามมา

- ✅ ที่ 1M ทุก author รวมคนที่มีแต่ draft ใช้ไม่เกินราว 6 ms (เดิม 0.4–1.6 s)
- ✅ ไม่ต้องรอ Postgres เลือกแผนใหม่หลังรันไปหลายครั้ง
- ⚠️ หลัง PgBouncer ที่ใช้ `prepare: true` ต้องตั้ง `customPlans: false` และตั้ง `plan_cache_mode` ที่ role ไม่อย่างนั้นเปิด connection ไม่ได้
- ⚠️ โปรเจกต์ Postgres ที่มี collection แบบ drafts ต้องสร้าง migration อีกครั้ง (รวมกับของ 1.16 ได้ถ้ายังไม่ได้สร้าง) migration ที่ 1M ใช้ราว 18 s
- ❌ การวัด A/B ใน Perf มองไม่เห็นผลของสถิติ เพราะ base ที่เป็นโค้ดเก่าไม่รู้จักสถิติและไม่ลบทิ้ง ทั้งสองฝั่งจึงมีสถิติเหมือนกัน
