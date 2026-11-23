# ADR-0073: Analytics และความยินยอม: Google Tag Manager ใน `@easy-cms/plugin-analytics`

- **สถานะ:** Accepted
- **วันที่:** 2026-11-23
- **เกี่ยวข้อง:** [ADR-0018](0018-plugin-endpoints-admin-components.md) (endpoint และ component ของ plugin),
  [ADR-0072](0072-escape-hatches.md) (escape hatches)

## บริบท

- เว็บที่สร้างด้วย Easy CMS (เว็บลูกค้า ร้านค้า landing page) แทบทุกเว็บต้องมี Google Tag Manager แต่ Easy CMS เป็น headless:
  หน้าเว็บเป็นของผู้ใช้ ตอนนี้ไม่มีอะไรช่วยเลย ไม่มี `dataLayer`, ไม่มี consent banner
- GTM และแท็กของ Google ใช้ cookie: ไทย (PDPA) และ EU ต้องขอความยินยอมก่อน Google Ads ใน EU บังคับ Consent Mode v2
- "เต็มประสิทธิภาพ" ไม่ใช่แค่แปะ snippet: (1) ติดตั้ง container (2) Consent Mode v2 (3) event ทางธุรกิจใน `dataLayer`
  ให้ทีมการตลาดตั้งแท็กเองได้ (4) event ฝั่ง server ที่ไม่หายเพราะ ad blocker หรือปิดหน้า
- ตกลงกัน 2026-11-23 (grill)

## การตัดสินใจ

- **plugin ใหม่ `@easy-cms/plugin-analytics`, experimental ใน 1.54:** ชื่อกว้างพอสำหรับ provider อื่นวันหน้า
  ไม่รวมใน plugin-seo (consent และ tracking เป็นคนละเรื่องกับ SEO)
- **ตั้งค่าใน global "Analytics & consent" (Settings):** GTM container ID, banner เปิด/ปิด, ข้อความ, ลิงก์นโยบาย,
  ค่าเริ่มต้นตามภูมิภาค, เก็บบันทึกความยินยอมกี่วัน เปลี่ยนได้โดยไม่ต้อง deploy
  - **ไม่ใช่หน้า Integrations:** การเชื่อมต่อในนั้นมีชุดเดียวทั้งระบบ (ไม่แยก tenant) และออกแบบมาสำหรับบัญชีที่มี secret
    GTM ID เปิดเผยในหน้าเว็บอยู่แล้ว global แยกต่อ tenant ได้ทันทีเมื่อใส่ใน `globals` ของ multiTenantPlugin
  - secret ของเฟสสอง (GA4 Measurement Protocol) จะอยู่ใน Integrations ตามปกติ
- **script เดียวจาก API: `<script src="/api/cms/analytics.js" async>`:** ตั้ง consent เริ่มต้น, แสดง banner, โหลด GTM
  จากค่าล่าสุดใน admin ใช้ได้กับทุก frontend Nuxt module แทรกให้เองเมื่อมี plugin, Next.js ใช้ `<EasyAnalytics />`
  ใน root layout cache สั้น (60 วินาที)
- **ไม่โหลดใน admin และ preview (ปิดไม่ได้):** ในเฟรม (live preview) และหน้าที่มี `?preview=` script ไม่ตั้งค่าและไม่โหลด GTM
  ข้อมูลจริงไม่ปนกับการแก้ของ editor
- **Consent Mode v2, ปฏิเสธเป็นค่าเริ่มต้นทุกประเทศ:** `analytics_storage` (หมวดวิเคราะห์), `ad_storage`, `ad_user_data`,
  `ad_personalization` (หมวดการตลาด) เป็น `denied` จนกว่าจะเลือก ตัวเลือก "ปฏิเสธเฉพาะ EU และไทย" อยู่ในหน้าตั้งค่า
- **banner ในตัว:** สามหมวด (จำเป็น เปิดตลอด / วิเคราะห์ / การตลาด), ปุ่ม "ยอมรับทั้งหมด" และ "ปฏิเสธทั้งหมด" เท่ากัน,
  "ตั้งค่า" เลือกรายหมวด, ข้อความไทยและอังกฤษ (แก้ได้, ภาษาตาม `<html lang>`), จำ 12 เดือน, เปิดซ้ำได้จาก
  `[data-easy-consent]` หรือ `easyConsent.open()` ข้อความเปลี่ยน = เวอร์ชันใหม่ = ถามใหม่
  - ใช้ CMP ของตัวเอง: ปิด banner แล้วให้ CMP เรียก `gtag('consent', 'update', …)` หรือ `easyConsent.set()`
- **บันทึกความยินยอม (เปิดเป็นค่าเริ่มต้น):** collection `consent-records`: ID สุ่มจาก cookie, หมวดที่เลือก, เวอร์ชันข้อความ,
  เวลา ไม่เก็บ IP ลบอัตโนมัติตาม `keepRecordsDays` พิสูจน์ได้ตาม PDPA ว่าได้รับความยินยอม
- **event ใน `dataLayer` ชื่อมาตรฐาน GA4 (PR ที่สอง):** `generate_lead` (`<easy-form>`), `sign_up` / `login` (สมาชิก), `search`,
  ร้านค้าเต็มชุด (`view_item`, `add_to_cart`, `remove_from_cart`, `begin_checkout`, `purchase`) อัตโนมัติจาก hook ของ
  plugin-ecommerce และ `track(event, params)` Consent Mode ตัดสินว่าแท็กไหนยิง
- **เฟสสอง (ไม่อยู่ใน 1.54):** `purchase` ฝั่ง server ผ่าน GA4 Measurement Protocol เมื่อคำสั่งซื้อชำระแล้ว

## ผลที่ตามมา

- ผู้ใช้ได้ GTM ที่ใช้ได้ตาม PDPA ด้วยการติดตั้ง plugin และวาง script หนึ่งบรรทัด (Nuxt: ไม่ต้องวาง)
- endpoint `POST /analytics/consent` เปิดให้ทุกคนเขียนได้ (ต้องบันทึกก่อนมีบัญชี): รับเฉพาะ ID, หมวด และเวอร์ชันที่ตรงรูปแบบ
- script โหลดจาก API ของเว็บเอง ส่วน GTM โหลดจาก `www.googletagmanager.com`: เว็บที่มี CSP ต้องเพิ่มใน `script-src`
- experimental: ชื่อ event, field ของ global และ API ของ `easyConsent` เปลี่ยนได้ในรุ่น minor จนกว่าจะประกาศ stable
