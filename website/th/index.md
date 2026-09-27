---
layout: home
hero:
  name: Easy CMS
  text: ระบบหลังบ้านที่อยู่ในแอปของคุณ
  tagline: Headless CMS แบบ code-first ที่ฝังอยู่ใน Nuxt และ Next.js กำหนดเนื้อหาด้วย TypeScript แล้วได้หน้า admin, Local API แบบมี type และ REST API
  actions:
    - theme: brand
      text: เริ่มใช้งาน
      link: /th/guide/getting-started
    - theme: alt
      text: Easy CMS คืออะไร
      link: /th/guide/what-is-easy-cms
features:
  - title: ใช้ได้ทั้ง Nuxt และ Next.js
    details: Core เดียวกับ adapter บางๆ ทั้ง Nuxt module และ route handler ของ Next.js ให้หน้า admin, API และ type ชุดเดียวกัน หรือจะรันเป็น standalone server ก็ได้
  - title: Code-first และมี type
    details: Collection, field, สิทธิ์ และ hook อยู่ใน easy-cms.config.ts และ type ของเอกสารสร้างจาก config นั้นโดยอัตโนมัติ
  - title: SQLite หรือ Postgres
    details: เริ่มจากไฟล์ SQLite หรือ PGlite แล้ว deploy บน Postgres การเปลี่ยน schema จะอัปเดตเองในช่วงพัฒนา และออกเป็น migration ใน production
  - title: หน้า admin ภาษาไทยและอังกฤษ
    details: หน้า admin ขนาดเล็กที่ build มาพร้อมใช้ มี rich text, คลัง media, ฉบับร่าง และสิทธิ์ระดับเอกสาร
---
