# ADR-0014: Localization (เนื้อหาหลายภาษา)

- **สถานะ:** Accepted
- **วันที่:** 2026-09-27

## บริบท

ลูกค้ากลุ่มหลักทำเว็บไทยที่มักต้องมีภาษาอังกฤษคู่กัน ต้องการเก็บเนื้อหาหลายภาษาในเอกสารเดียว โดยที่ field อย่างรูปหรือหมวดหมู่ใช้ร่วมกันทุกภาษา

## การตัดสินใจ

- **ระดับ field:** `localization: { locales, defaultLocale, fallback }` ใน config และ `localized: true` บน field ประเภท scalar, upload และ relationship แบบเดี่ยว ไม่รองรับบน group/array (ให้ตั้งที่ field ข้างใน) และยังไม่รองรับ hasMany
- **เก็บเป็นคอลัมน์ต่อภาษา** แทนตารางลูก `_locales` หรือ JSON ภาษาเริ่มต้นใช้ชื่อคอลัมน์เดิม ภาษาอื่นเป็น `<column>__<locale>` เหตุผล: where/sort/unique/index ใช้กลไกคอลัมน์ที่มีอยู่ได้ทั้งหมดทั้ง SQLite และ Postgres, การเปิด localized กับ field เดิมไม่ทำให้ข้อมูลหาย (ข้อมูลเดิมกลายเป็นภาษาเริ่มต้น และ migration มีแค่ ADD COLUMN) ส่วนการเพิ่มภาษาเป็นการเปลี่ยน schema ที่มองเห็นได้ใน migration ซึ่งตรงกับแนวทาง code-first
- **ชั้น database คืนค่าเป็น map** `{ [locale]: value }` สำหรับ field ที่ localized ส่วน Local API เป็นผู้เลือกภาษา (`pickLocale`) ก่อน populate, afterRead และการตัด field ตามสิทธิ์ ส่วนตอนเขียน input ของภาษาหนึ่งจะถูกแปลงเป็น map ที่รวมกับค่าของภาษาอื่นเดิม (`toLocaleMaps`) โดยจับคู่แถว array ด้วย id
- **API:** `locale` (หรือ `'all'`) และ `fallbackLocale` ใน options และ REST ใช้ `?locale=` / `?fallback-locale=` where/sort ถูกเขียน path ใหม่ให้ชี้คอลัมน์ของภาษานั้น (`title` → `title.en`) ส่วน `required` และ validate ที่เขียนเองตรวจเฉพาะภาษาที่กำลังเขียน slug และ `unique` แยกตามภาษา
- **ใช้กับฟีเจอร์เดิมได้:** เวอร์ชัน/ฉบับร่างเก็บ map ทุกภาษา การกู้คืนเขียน map ตรงๆ (โหมด restore) preview ใช้ภาษาที่แก้ไข และส่งให้ฟังก์ชัน `preview` เป็น `locale`
- **Admin:** ตัวสลับภาษาของเนื้อหา (แยกจากภาษาของหน้า admin และจำไว้ในเบราว์เซอร์) ตอนแก้ไขอ่านแบบ `fallback-locale=false` เพื่อให้เห็นว่า field ไหนยังไม่ได้แปล และแสดงป้ายภาษาข้าง field ที่ localized

## ผลที่ตามมา

- ✅ แปลเนื้อหาได้โดยไม่ต้องทำ collection แยกตามภาษา และค้นหาหรือเรียงตามภาษาได้
- ✅ โปรเจกต์ที่ไม่ใช้ localization ไม่เปลี่ยนอะไร
- ❌ การเพิ่มภาษาต้องสร้าง migration และตารางกว้างขึ้นตามจำนวนภาษา (เหมาะกับภาษาไม่กี่ภาษา)
- ~~❌ การเปลี่ยน `defaultLocale` ภายหลังต้องย้ายข้อมูลเอง~~ แก้แล้วใน [ADR 0017](./0017-durable-webhooks-block-queries-locale-moves.md)
- ❌ hook `beforeValidate`/`beforeChange` เห็นค่าของ field ที่ localized เป็น map และ `locale: 'all'` จะไม่ populate relationship ที่ localized
