# ADR-0060: ลายเซ็น webhook ครอบ delivery และ timestamp ของการส่งแต่ละครั้ง

- **สถานะ:** Accepted
- **วันที่:** 2026-10-29

## บริบท

- `x-easy-cms-signature: sha256=<HMAC ของ body>` ไม่ครอบเวลา ใครที่ดักจับ request ได้ส่งซ้ำได้ตลอด ([#166](https://github.com/maritonx/easy-cms/issues/166))
- การส่งที่ล้มจะลองใหม่ได้นานราว 1 วัน (body และ `x-easy-cms-delivery` เหมือนเดิม) ช่วงเวลาที่ผู้รับยอมรับจึงต้องใช้เวลาของการส่งแต่ละครั้ง ไม่ใช่เวลาของ event
- secret ของ webhook เป็นข้อความอะไรก็ได้ ส่วน library ของ Standard Webhooks คาดว่าเป็น base64 (`whsec_…`)

## การตัดสินใจ

- **header ใหม่:**
  - `x-easy-cms-timestamp: <Unix วินาทีของการส่งครั้งนี้>`
  - `x-easy-cms-signature-v2: v1=<hex HMAC-SHA256 ของ "<delivery>.<timestamp>.<body>">`
  - เซ็น delivery id ด้วย จึงจับคู่ id กับ body ของ delivery อื่นไม่ได้
- **ใช้ header ของเราเอง ไม่ใช้ Standard Webhooks:** รูปแบบลายเซ็นเดียวกันในเชิงหลักการ แต่ไม่บังคับรูปแบบ secret และตรวจด้วย HMAC ไม่กี่บรรทัดได้ทุกภาษา ส่วน `v1=` เปิดทางให้มีหลายลายเซ็นในอนาคต
- **`verifyWebhook(body, headers, secret | secret[], { toleranceSeconds })`** ใน `@easy-cms/core`: ตรวจแบบเวลาคงที่ ยอมรับ timestamp ห่างจากตอนนี้ไม่เกิน 300 วินาทีเป็นค่าเริ่มต้น และคืน payload ถ้าไม่ผ่านจะ throw `UnauthorizedError`
- **header เดิม** ยังส่งจนถึง 2.0 และเอกสารระบุว่า deprecated

## ผลที่ตามมา

- ✅ request ที่ถูกดักจับใช้ได้แค่ไม่กี่นาที และผู้รับที่เก็บ `x-easy-cms-delivery` ไว้จะข้ามรายการซ้ำได้
- ✅ retry ที่ส่งช้าไปหลายชั่วโมงยังผ่านการตรวจ เพราะได้ timestamp ใหม่
- ⚠️ ผู้รับต้องตั้งนาฬิกาให้ตรง
- ⚠️ ลายเซ็นของ retry แต่ละครั้งไม่เหมือนกัน ผู้รับที่เคยใช้ลายเซ็นเป็นตัวกันรายการซ้ำต้องเปลี่ยนไปใช้ `x-easy-cms-delivery`
