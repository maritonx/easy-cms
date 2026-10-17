# Easy CMS — ทบทวนสัญญา `PaymentAdapter` สำหรับ Omise

- **Issue:** [#118](https://github.com/maritonx/easy-cms/issues/118) (milestone `1.0.0-rc`), เตรียมให้
  [#86](https://github.com/maritonx/easy-cms/issues/86) Omise (milestone `1.1`)
- **วันที่:** 2026-10-16 · **เวอร์ชันที่ตรวจ:** 0.68.2
- **สัญญาที่ตรวจ:** `packages/plugin-ecommerce/src/payments.ts` และการเรียกใช้ใน `shop.ts`
- **ข้อมูล Omise:** [Charges API](https://docs.omise.co/charges-api),
  [Webhooks](https://docs.omise.co/api-webhooks), [PromptPay](https://docs.omise.co/promptpay)
  (อ่านเมื่อ 2026-10-16)

---

## สรุป

Omise ต่อกับสัญญาปัจจุบันได้**บางส่วน** การชำระที่ต้องใช้ข้อมูลจากหน้าเว็บก่อนสร้าง charge
(บัตร, เลือกธนาคาร, URL กลับหลังยืนยันตัวตน) ทำไม่ได้ เพราะ `initiate` ไม่ได้รับอะไรจากหน้าเว็บเลย
และ shop ไม่เคยถาม provider ซ้ำเมื่อ webhook ไม่มา ซึ่ง Omise ไม่รับประกันว่าจะส่งซ้ำ

ทุกข้อที่ต้องเพิ่ม**เพิ่มได้โดยไม่ breaking** (argument หรือ field ใหม่ที่ไม่บังคับ) จึงไม่ต้องแก้อะไรก่อน RC
ทำพร้อม #86 ใน 1.1 ได้ และ plugin ยังเป็น experimental อยู่แล้ว

---

## 1. Flow ของ Omise เทียบกับสัญญา

สัญญาปัจจุบัน: checkout → `initiate({ cms, transaction })` คืน `data`, `reference`, `client` →
หน้าเว็บจ่าย → `confirm({ cms, transaction, input })` ถาม provider → ได้ `succeeded` ก็สร้าง order
หรือ webhook ของ adapter เรียก `paymentSucceeded(reference)` / `paymentFailed(reference)`

| วิธีจ่าย | Flow ของ Omise | ต่อกับสัญญาปัจจุบันได้ไหม |
|---|---|---|
| **บัตร (ไม่มี 3-D Secure)** | Omise.js สร้าง token บนหน้าเว็บ → server สร้าง charge ด้วย `card: token` → ได้ผลทันที (`successful`/`failed`) **ไม่มี webhook `charge.complete`** | ❌ token ต้องมาจากหน้าเว็บ**ก่อน** `initiate` แต่ `initiate` ไม่มี input ([G1](#g1)) |
| **บัตร (3-D Secure)** | เหมือนด้านบน แต่ charge เป็น `pending` พร้อม `authorize_uri` → พาลูกค้าไปยืนยัน → กลับมาที่ `return_uri` → webhook `charge.complete` | ❌ ต้องมี token และ `return_uri` ([G1](#g1), [G2](#g2)) ส่วน `authorize_uri` ส่งกลับผ่าน `client` ได้ |
| **PromptPay** | สร้าง source `promptpay` → charge `pending` พร้อม QR (`source.scannable_code.image.download_uri`) หมดอายุภายใน 24 ชม. (`expires_at`) → ลูกค้าสแกน → webhook `charge.complete` | ✅ ส่วนใหญ่: source สร้างฝั่ง server ได้ QR ส่งผ่าน `client` แต่**ถ้าหมดอายุไม่มี webhook** ([G4](#g4)) |
| **Mobile banking** (`mobile_banking_scb`, `_kbank`, `_bbl`, `_bay`, `_ktb`) | สร้าง source ตามธนาคารที่ลูกค้าเลือก → charge พร้อม `authorize_uri` → เปิดแอปธนาคาร → กลับ `return_uri` → webhook `charge.complete` | ❌ ธนาคารที่เลือกต้องมาจากหน้าเว็บ ([G1](#g1)) และต้องมี `return_uri` ([G2](#g2)) |
| **Webhook** | `Omise-Signature` = HMAC-SHA256 (hex) ของ `"<Omise-Signature-Timestamp>.<raw body>"` ด้วย secret ที่ decode base64 แล้ว, ช่วงเปลี่ยน secret มีสองค่าคั่นด้วย `,` เอกสารแนะนำให้ดึง charge มาเช็คสถานะอีกครั้ง | ✅ adapter มี endpoint ของตัวเองได้ อ่าน raw body ได้ (`req.text()`) เรียก `paymentSucceeded`/`paymentFailed` ได้ |
| **คืนเงิน** | `POST /charges/:id/refunds` พร้อม `amount` (คืนบางส่วนได้) | ✅ คืนเต็มจำนวน (`transaction.amount`) ได้ คืนบางส่วนยังไม่มีในสัญญา ([G6](#g6)) |
| **ป้องกันสร้างซ้ำ** | Charges API ใช้ `ref_id` (ใช้ได้ครั้งเดียวต่อบัญชี) | ✅ ใส่ `ref_id` จาก `transaction.id` ได้ เหมือน idempotency key ของ Stripe |
| **จำนวนเงิน** | หน่วยย่อยสุด (สตางค์) | ✅ ตรงกับ `transaction.amount` |

---

## 2. ช่องว่างและข้อเสนอ

### G1 — `initiate` ไม่ได้รับข้อมูลจากหน้าเว็บ {#g1}

**ปัญหา:** บัตรต้องมี token จาก Omise.js และ mobile banking ต้องรู้ว่าลูกค้าเลือกธนาคารไหน ทั้งสองอย่างต้องรู้
**ก่อน**สร้าง charge ปัจจุบัน `POST <api>/shop/checkout` ส่งต่อให้ `initiate` แค่ `cms` กับ `transaction`
(Stripe ไม่เจอปัญหานี้ เพราะสร้าง PaymentIntent ก่อน แล้วหน้าเว็บค่อยยืนยันทีหลัง)

**ข้อเสนอ (เพิ่มได้ ไม่ breaking):**
- checkout รับ field ใหม่ `payment: Record<string, unknown>` ส่งต่อเป็น `initiate({ cms, transaction, input })`
  แบบเดียวกับ `confirm` ที่มี `input` อยู่แล้ว
- client: `checkout({ method, payment: { token } })` hook ของ React/Vue ได้ไปด้วย เพราะส่งต่อ `client.checkout`
- adapter ต้องตรวจ `input` เอง (เช่น ธนาคารต้องอยู่ในรายการที่เปิดใช้)

**ทางเลี่ยงถ้าไม่เพิ่ม:** `initiate` ไม่สร้างอะไร แล้ว `confirm({ input: { token } })` สร้าง charge แทน
แต่ `confirm` คืนได้แค่สถานะ ส่ง `authorize_uri` กลับไปให้หน้าเว็บไม่ได้ จึงใช้กับ 3-D Secure และ mobile banking ไม่ได้

### G2 — ไม่มี URL ให้ลูกค้ากลับมาหลังยืนยัน (`return_uri`) {#g2}

**ปัญหา:** 3-D Secure และ mobile banking ต้องส่ง `return_uri` ตอนสร้าง charge `initiate` ไม่รู้ว่าเว็บอยู่ที่ไหน
และหน้าที่จะกลับไปคือหน้าไหน

**ข้อเสนอ:**
- `returnURL` มากับ `input` ของ G1 (หน้าเว็บรู้ URL ของตัวเอง)
- **ต้องตรวจ origin:** ยอมรับเฉพาะ `serverURL`, `admin.siteURL` หรือ `auth.trustedOrigins` ไม่อย่างนั้นกลายเป็น
  open redirect ที่ใช้หลอกลูกค้าหลังจ่ายเงินได้ ควรทำเป็น helper ใน plugin ให้ทุก adapter ใช้ร่วมกัน
  ไม่ใช่ให้แต่ละ adapter ตรวจเอง

### G3 — `initiate` บอกไม่ได้ว่าจ่ายสำเร็จแล้ว {#g3}

**ปัญหา:** บัตรที่ไม่มี 3-D Secure รู้ผลทันทีตอนสร้าง charge แต่ order จะเกิดก็ต่อเมื่อมี `confirm` หรือ webhook
และ Omise **ไม่ส่ง** `charge.complete` สำหรับกรณีนี้

**ทำได้ด้วยสัญญาปัจจุบัน:** หน้าเว็บเรียก `confirm` ทันทีหลัง checkout → `confirm` ดึง charge มาเช็ค → `successful`
→ สร้าง order แต่ถ้าลูกค้าปิดหน้าก่อนเรียก `confirm` จะไม่มี order ทั้งที่ตัดเงินแล้ว ([G4](#g4) ช่วยแก้)

**ข้อเสนอ (ไม่บังคับ):** `InitiateResult.status?: 'succeeded' | 'failed'` ให้ shop สร้าง order ได้ใน request เดียวกับ checkout

### G4 — shop ไม่เคยถาม provider ซ้ำ {#g4}

> **ทำแล้วบน branch `next` (1.1):** งาน `shop:payments` ถามซ้ำผ่าน `confirm` และ `expiresIn` ใช้ได้กับ adapter ทุกแบบ

**ปัญหา:** ปัจจุบัน transaction ของ adapter ที่ไม่ใช่ `manual` เปลี่ยนสถานะได้แค่จาก `confirm` (หน้าเว็บเรียก)
หรือ webhook งาน `shop:payments` คืนแค่ transaction ที่ค้างอยู่ใน `processing` กลับเป็น `pending`
ไม่ได้ถาม provider และไม่ทำให้ `pending` หมดอายุ

สำหรับ Omise ปัญหานี้หนักกว่า Stripe:
- Omise **ไม่รับประกัน**ว่าจะส่ง webhook ซ้ำเมื่อส่งไม่สำเร็จ (Stripe ส่งซ้ำถึง 3 วัน)
- QR ของ PromptPay ที่หมดอายุ**ไม่มี webhook** (`charge.expire` มีเฉพาะ Barcode Alipay)
- บัตรที่ไม่มี 3-D Secure ไม่มี webhook เลย ([G3](#g3))

ผลคือลูกค้าจ่ายแล้วแต่ไม่มี order หรือ transaction ค้าง `pending` ไปตลอด

**ข้อเสนอ:** ใน `shop:payments` ให้ transaction ที่ `pending` นานเกินกำหนดถูกถามซ้ำผ่าน `adapter.confirm({ input: {} })`
(ได้ `succeeded` ก็สร้าง order ได้ `failed` ก็ตั้งเป็น failed) และเพิ่ม `expiresIn` ให้ adapter ที่ไม่ใช่ manual
(เช่น 24 ชม. ตาม QR ของ PromptPay) เพื่อเลิกถามเมื่อหมดอายุ ส่วนนี้แก้ใน shop ไม่ต้องแก้สัญญา
และ Stripe ได้ประโยชน์ด้วย (webhook ที่ไม่ได้ตั้งไว้)

### G5 — ตรวจลายเซ็น webhook {#g5}

ไม่ต้องแก้สัญญา adapter อ่าน raw body และ header ได้แล้ว ข้อควรระวังตอนเขียน adapter:
- decode secret ด้วย base64 ก่อน, เทียบแบบ constant-time (`timingSafeEqual`), รองรับสองลายเซ็นตอนเปลี่ยน secret
- ตรวจ timestamp ไม่เกิน 5 นาทีกันการส่งซ้ำ
- หลังตรวจผ่านแล้วยังควรดึง charge มาเช็คสถานะตามที่ Omise แนะนำ และเทียบจำนวนเงินกับ transaction
  เหมือนที่ `stripeAdapter.confirm` ทำ

### G6 — คืนเงินบางส่วน {#g6}

`refund({ cms, transaction })` คืนเต็มจำนวนเท่านั้น Omise (และ Stripe) คืนบางส่วนได้
ถ้าจะรองรับในอนาคต เพิ่ม `amount?: number` ได้โดยไม่ breaking ไม่จำเป็นสำหรับ #86

---

## 3. สิ่งที่ทำต่อ

| ข้อ | ทำที่ไหน | breaking? |
|---|---|---|
| G1 `initiate({ input })` + `checkout({ payment })` | #86 (1.1) | ไม่ |
| G2 `returnURL` พร้อมตรวจ origin | #86 (1.1) | ไม่ |
| G3 `InitiateResult.status` | #86 (1.1) ถ้าจำเป็น | ไม่ |
| G4 ถาม provider ซ้ำและหมดอายุใน `shop:payments` | ก่อนหรือพร้อม #86 (1.1) | ไม่ |
| G5 ตรวจลายเซ็นใน Omise adapter | #86 (1.1) | — |
| G6 คืนเงินบางส่วน | หลัง 1.1 | ไม่ |

**ไม่ต้องแก้อะไรก่อน RC** สัญญาปัจจุบันไม่ต้องเปลี่ยนแบบ breaking เพื่อรองรับ Omise
