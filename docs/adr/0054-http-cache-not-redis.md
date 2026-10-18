# ADR-0054: cache ด้วย HTTP และ CDN ก่อน ไม่เพิ่ม Redis

- **สถานะ:** Accepted
- **วันที่:** 2026-10-18

## บริบท

- ตอนนี้ไม่มี cache ในตัว REST ส่ง `cache-control: no-store` เป็นค่าปริยาย (`rest/handler.ts`) มีแค่ไฟล์ public ที่ได้ `immutable`
- ทุกการอ่านจึงไปถึงฐานข้อมูล ซึ่งใช้ได้ที่ 10k เอกสาร (benchmark ใน SRS) แต่ยังไม่ได้วัดที่เป้า 1M เอกสาร ([ADR-0051](./0051-reference-architecture.md))
- งานส่วนใหญ่ของ CMS คืออ่านเนื้อหาที่ publish แล้ว ซึ่งเปลี่ยนไม่บ่อยและเหมือนกันสำหรับทุกคน
- ทางเลือก: cache ใน app ด้วย Redis หรือให้ HTTP cache และ CDN ทำงาน แล้ว purge เมื่อเนื้อหาเปลี่ยน

## การตัดสินใจ

- **อ่านแบบ public ที่ publish แล้ว** (ไม่มี session, ไม่มี API key, ไม่ใช่ draft): ส่ง `ETag` และ `Cache-Control: public, s-maxage=…, stale-while-revalidate=…` ปรับได้ต่อ collection
- **อ่านที่มีผู้ใช้หรือ draft:** ยัง `no-store` หรือ `private` เหมือนเดิม
- **cache tag:** response บอก tag ของ collection และเอกสาร (เช่นผ่าน `Cache-Tag` / `Surrogate-Key`) และมี hook สำหรับ purge เมื่อเนื้อหาเปลี่ยน ต่อกับ revalidate ของ Next (`revalidateTag`) และ Nuxt ได้ ผ่านคิวของ [ADR-0053](./0053-outbox-for-after-hooks.md) เมื่อเปิดใช้
- **ไม่เพิ่ม Redis ในตัว** ถ้า benchmark ที่ 1M เอกสารแสดงว่าจำเป็น ค่อยเพิ่มเป็น adapter แบบเลือกใช้
- ลำดับ: benchmark 1M เอกสารต้องมีก่อน เพื่อให้รู้ว่าคอขวดอยู่ที่ไหนจริง

## ผลที่ตามมา

- ✅ ไม่มี infra เพิ่ม, เข้ากับ app แบบ stateless และใช้ CDN ที่องค์กรมีอยู่แล้ว
- ✅ ลดภาระฐานข้อมูลในงานที่มากที่สุด (อ่านเนื้อหาที่ publish แล้ว)
- ⚠️ ถ้า purge ไม่ถึง CDN ผู้อ่านจะเห็นเนื้อหาเก่าจนกว่า `s-maxage` หมด ค่าปริยายจึงต้องสั้น
- ⚠️ การเลือกว่า response ไหน cache ได้ต้องระวัง ห้าม cache อะไรที่ขึ้นกับผู้ใช้
- ❌ ไม่ช่วยงานเขียนหรือหน้า admin ซึ่งต้องพึ่ง index, pagination แบบ cursor และ search
