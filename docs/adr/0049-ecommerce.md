# ADR-0049: ร้านค้า (ecommerce) เป็น plugin พร้อมจุดต่อกลางใน core

- **สถานะ:** Accepted
- **วันที่:** 2026-10-09

## บริบท

ผู้ใช้อยากขายของบนเว็บแบบ Payload ecommerce: สินค้าและตัวเลือก ราคาหลายสกุลเงิน ตะกร้า (ไม่ล็อกอินก็ได้) ชำระเงิน
คำสั่งซื้อ สต็อก และบัญชีลูกค้า แต่ core ยังขาดหลายอย่าง:

- มี collection ที่ล็อกอินได้แค่ `users` และไม่มีการสมัครเอง ลูกค้าที่ล็อกอินจะได้สิทธิ์ค่าเริ่มต้น "ผู้ที่ล็อกอิน" ของทุก collection
  ซึ่งแก้เนื้อหาได้
- การแก้ข้อมูลไม่มีแบบมีเงื่อนไขหรือแบบ atomic จึงทำให้การสร้างคำสั่งซื้อ "ครั้งเดียวแน่นอน" และการตัดสต็อกไม่ปลอดภัยเมื่อเรียกพร้อมกัน
- plugin ลงงานตามเวลาและส่ง webhook event ของตัวเองไม่ได้
- หน้าเว็บของ Payload ใช้ได้กับ React เท่านั้น แต่เราต้องรองรับ Next, Nuxt และเว็บธรรมดา

## การตัดสินใจ

- **core แบบกลาง:**
  - `auth.members { roles, signup, pages, emails }`: role ของสมาชิกเว็บเข้าระบบจัดการไม่ได้ `isLoggedIn` ไม่นับพวกเขา
    (`isSignedIn` นับ) เห็นเฉพาะบัญชีตัวเองใน `users` และ `onRequest` เปลี่ยน role แล้วสถานะสมาชิกตามไปด้วย
  - การสมัคร `GET/POST <api>/users/signup` พร้อมยืนยันอีเมล (`POST /users/verify-email`) กันสแปมด้วยชุดของ form-builder
    ที่ย้ายมาไว้ใน core (`formToken`, `checkFormToken`, `rateKeys`, `honeypotName`, `verifyTurnstile`) ตอบเหมือนกันไม่ว่าอีเมลมีบัญชีหรือไม่
    และลิงก์ในอีเมลของสมาชิกไปที่หน้าของเว็บ (`members.pages`)
  - `update(..., { where })` แบบ compare-and-set (SQL คำสั่งเดียว คืน `null` เมื่อไม่ตรง) และ `cms.increment(collection, id, field, by, { min, max })`
  - config `jobs` (รันกับ `runJobs` เก็บเวลาที่รันล่าสุดในตาราง globals) และ `events` + `cms.emit()` ที่ส่งเฉพาะ webhook ที่ระบุ event นั้น
  - `admin.group` รับ label เพื่อทำหัวข้อเมนูของตัวเอง และ cell ในหน้ารายการได้ `doc` ของแถว
  - config ที่ไม่มี `collections` ได้ type ของ collection ที่ plugin เพิ่ม
- **`@easy-cms/plugin-ecommerce`:**
  - collection `products` (drafts), `variant-types`, `variant-options`, `variants`, `carts`, `addresses`, `orders`, `transactions`
    และ `shop-counters` (เลขที่คำสั่งซื้อ)
  - ราคาเป็นจำนวนเต็มหน่วยย่อย field ละสกุลเงิน (`priceInTHB`) ไม่แปลงค่าเงิน field ชนิด `price` แสดงเป็นเงินใน admin
  - ตะกร้า guest ใช้รหัสลับที่เก็บเป็น hash และรวมเข้าบัญชีตอนล็อกอิน
  - checkout เก็บยอดและรายการไว้ใน transaction แล้วให้ adapter เริ่มจ่าย การสร้างคำสั่งซื้อจอง transaction ด้วย update แบบมีเงื่อนไข
    จึงได้คำสั่งซื้อเดียวแม้หน้าเว็บ การลองใหม่ และ webhook มาพร้อมกัน transaction ที่ค้าง `processing` มีงานคืนเป็น `pending`
  - เก็บ context ของ request (เช่น tenant) ไว้กับ transaction ให้คำสั่งซื้อจาก webhook อยู่ใน tenant ที่ถูก
  - สต็อกตัดด้วย `increment` แบบห้ามติดลบ ถ้าหมดระหว่างจ่ายยังสร้างคำสั่งซื้อพร้อม `stockShort` และคืนสต็อกเมื่อยกเลิกหรือคืนเงิน
  - คำสั่งซื้อเก็บสำเนารายการ เลขที่ต่อ scope สถานะ `pending/paid/fulfilled/cancelled/refunded` เปลี่ยนด้วยปุ่มใน admin
  - payment adapter: `initiate`, `confirm`, `refund?`, `endpoints` (ใต้ `/shop/payments/<name>`) พร้อม `paymentSucceeded/Failed(reference)`
    มี `stripeAdapter` (PaymentIntent + webhook, `stripe` เป็น optional peer) และ `manualAdapter` (โอนเงิน)
  - `totals` สำหรับค่าส่ง ภาษี ส่วนลด อีเมลยืนยัน/ได้รับเงิน/แจ้งร้าน และ event `order.*`
  - ฝั่งหน้าเว็บ: `/client` ที่ไม่ผูก framework และ `/react`, `/vue` ที่ครอบไว้
- **multi-tenant:** สมาชิกเว็บเลือก tenant แบบผู้เยี่ยมชม (โดเมนหรือ header) บัญชีลูกค้าเดียวจึงซื้อได้ทุกเว็บ
  ต่างจากที่ตกลงไว้ตอนแรกว่าลูกค้าจะเป็นสมาชิกของ tenant ที่สมัคร เพราะแบบนี้ง่ายกว่าและไม่ต้องจัดการ membership ของลูกค้า

## ผลที่ตามมา

- `isLoggedIn` แคบลงเมื่อมี `auth.members`: config เดิมที่ไม่มีสมาชิกทำงานเหมือนเดิม
- การเพิ่มสกุลเงินเพิ่มคอลัมน์ จึงต้องสร้าง migration
- ยังไม่ทำ: Omise และผู้ให้บริการอื่นแบบสำเร็จรูป, Stripe Checkout, web component ของตะกร้า, การจองสต็อก, ค่าส่ง VAT และคูปองแบบสำเร็จรูป,
  สมาชิกรายเดือน และบัญชี Stripe แยกต่อ tenant
