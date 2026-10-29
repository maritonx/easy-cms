# ADR-0061: หมุน secret ด้วย `previousSecrets` และเซ็น audit log ใหม่

- **สถานะ:** Accepted
- **วันที่:** 2026-10-29

## บริบท

- `secret` ใช้เซ็นและตรวจหลายอย่าง ([#167](https://github.com/maritonx/easy-cms/issues/167)) และเปลี่ยนแล้วทุกคนหลุด login:
  - session cookie และ CSRF
  - ลิงก์รหัสผ่านและคำเชิญ
  - preview token
  - ลิงก์ไฟล์ส่วนตัวและ upload ticket
  - SSO state
  - form token
  - ลายเซ็นของ audit log
  - key ของ rate limit
- audit log ตรวจรายการย้อนหลังทุกวัน รายการที่เซ็นด้วย secret เก่าจะถูกนับว่าถูกแก้ เมื่อไม่มี secret นั้นแล้ว
- session ไม่ยืดอายุตามการใช้งาน (`tokenExpiration` 7 วัน) และลิงก์คำเชิญอายุ 7 วัน

## การตัดสินใจ

- **`previousSecrets?: string[]`:** `secret` ยังเป็น string และเป็นตัวเดียวที่ใช้เซ็น ทุกจุดที่ตรวจยอมรับ secret ตัวไหนก็ได้ในรายการ (`secretsOf(config)`) และ secret ทุกตัวต้องยาว 32 ตัวอักษรขึ้นไปเหมือนกัน
- **CSRF:** ตรวจกับ secret ทุกตัว client ที่ได้ token ไปก่อนเปลี่ยน secret จึงบันทึกต่อได้
- **`easy-cms audit:resign` (`cms.audit.resign()`):**
  - เซ็นใหม่ด้วย secret ปัจจุบันเฉพาะรายการที่ตรวจผ่านกับ secret เก่า
  - รายการที่ไม่ผ่านกับ secret ใดเลยจะไม่ถูกแตะ คำสั่งรายงานออกมาและจบด้วย `1`
  - บันทึก `audit.resign` ไว้ใน log
- **cookie ไม่ถูกออกใหม่:** session ที่เซ็นด้วย secret เก่าหมดอายุเองภายใน `tokenExpiration`
- **เทมเพลต** อ่าน `EASY_CMS_PREVIOUS_SECRETS` (คั่นด้วย comma) คนที่ deploy อยู่แล้วจึงหมุน secret ได้ด้วยการแก้ env อย่างเดียว

## ผลที่ตามมา

- ✅ หมุน secret ได้โดยไม่มีใครหลุด login และ audit log ยังตรวจได้ครบหลังเอา secret เก่าออก
- ✅ ถ้า secret รั่ว เอาออกทันทีได้ (ทุกคน login ใหม่) และ audit log ยังตรวจได้ ถ้ารัน `audit:resign` ก่อน
- ⚠️ ระหว่างที่มี secret เก่า ใครที่ถือ secret เก่ายังปลอม cookie หรือลิงก์ได้ จึงควรเก็บไว้แค่ช่วงที่จำเป็น
- ⚠️ rate limit ของฟอร์มสาธารณะเริ่มนับใหม่
- ❌ `backups.encryptionKey` ไม่ได้หมุนด้วยกลไกนี้
