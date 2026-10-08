# ADR-0045: ชุดเครื่องมือกลางสำหรับ framework

- **สถานะ:** Accepted
- **วันที่:** 2026-10-08

## บริบท

- core ทำงานกับ Web `Request`/`Response` อยู่แล้ว แต่ `@easy-cms/next`, `@easy-cms/nuxt` และ standalone server ต่างเขียนส่วนเดียวกันซ้ำ: เก็บ instance เดียวต่อ server, สร้าง REST handler ต่อ instance พร้อม IP ของผู้ใช้, ตั้งค่า admin handler จาก config และหาผู้ใช้จาก header
- Next เทียบ config ตามโครงสร้าง (`configSignature`) แต่ Nuxt เทียบตามตัว object พฤติกรรมจึงต่างกันเมื่อ framework bundle config หลายชุด
- อนาคตอาจเพิ่ม Astro, SvelteKit หรืออื่นๆ ทุกตัวต้องเขียนส่วนนี้ซ้ำอีก

## การตัดสินใจ

- **ใน core:** `sharedEasyCMS(config, options?)` เก็บ instance เดียวต่อ process ใน `globalThis` เทียบตามโครงสร้างของ config ถ้า config เปลี่ยน ปิดตัวเก่าแล้วสร้างใหม่ ถ้าสร้างไม่สำเร็จ ไม่เก็บไว้ให้ลองใหม่ ส่วน `createApiHandler(config, { basePath, getClientIp, trustProxy })` คือ REST API บน instance นั้น (IP จาก `getClientIp` ของ framework หรือ `X-Forwarded-For` แรกเมื่อ `trustProxy`) และ `cms.auth.userFromHeaders(headers)` คืนผู้ใช้จาก Bearer token หรือ cookie session (ชื่อ cookie ย้ายไป `auth/cookie.ts` เพื่อไม่ให้ auth กับ REST handler พึ่งกันวน)
- **ใน `@easy-cms/admin`:** `adminHandlerFor(resolvedConfig, overrides?)` รับ config ที่ resolve แล้ว (แบบ structural type) แทนการเรียก `resolveConfig` เอง เพราะแพ็กเกจ admin ไม่ได้พึ่ง core ตอนรัน และไม่ควรเพิ่ม dependency
- **ไม่มีแพ็กเกจใหม่:** แพ็กเกจของ framework พึ่ง core และ admin อยู่แล้ว
- **Next, Nuxt และ standalone ใช้ชุดเดียวกัน:** Nuxt เปลี่ยนมาเทียบ config ตามโครงสร้างเหมือน Next พฤติกรรมอื่นไม่เปลี่ยน ยืนยันด้วย e2e ทั้งสามชุด
- **เอกสาร "Framework อื่นๆ":** วิธีต่อกับ framework ใดก็ได้ที่รับ Web `Request` โดยไม่อ้างว่ารองรับ framework ใดเป็นพิเศษ เพราะยังไม่ได้ทดสอบ

## ผลที่ตามมา

- ✅ แพ็กเกจ framework ถัดไปเหลือแค่ต่อ route และ helper ของ framework นั้น
- ✅ Next และ Nuxt จัดการ instance และผู้ใช้แบบเดียวกัน
- ⚠️ instance เดียวต่อ process: ถ้าแอปเดียวมีหลาย config ต้องใช้ `createEasyCMS` เอง (เหมือนเดิมใน Next)
- ❌ ยังไม่มีแพ็กเกจของ Astro หรือ framework อื่น
