# ADR-0021: SEO สำหรับ AI: crawler ของ AI, llms.txt, Markdown และ IndexNow

- **สถานะ:** Accepted
- **วันที่:** 2026-09-28

## บริบท

หลัง 0.17 ([ADR-0020](0020-seo-sitemap-robots-root-endpoints.md)) เว็บมี metadata, sitemap และ JSON-LD
ที่ระบบ AI ใช้ด้วยอยู่แล้ว แต่ยังขาดสี่เรื่องที่เฉพาะกับ AI: เจ้าของเว็บเลือกไม่ได้ว่า crawler ของ AI ตัวไหนใช้เนื้อหาได้,
ไม่มี `llms.txt`, ไม่มีเนื้อหาแบบ Markdown ที่ AI อ่านได้ง่ายกว่า HTML และหน้าใหม่ไปถึง index ของ Bing
(ที่ ChatGPT search และ Copilot ใช้) ช้า

## การตัดสินใจ

**crawler ของ AI ใน `robotsTxt()`**
- แบ่งเป็นสามกลุ่มตามหน้าที่: `training` (เทรนโมเดล), `search` (ทำ index สำหรับค้นหาและอ้างอิง), `user`
  (เปิดหน้าตามคำสั่งผู้ใช้) รายชื่ออยู่ใน `AI_CRAWLERS` และอัปเดตทุก release
- **อนุญาตทั้งหมดเป็นค่าเริ่มต้น** เพื่อไม่ให้การอัปเกรดทำให้เว็บหายจากคำตอบของ AI โดยไม่รู้ตัว การปิดเป็นการตัดสินใจทางธุรกิจ
  ของเจ้าของเว็บ
- crawler ทำตามเฉพาะกลุ่มที่ระบุชื่อตัวเอง (ไม่รวมกับ `*`) ทุกกลุ่มที่สร้าง รวมถึง `rules` ที่ผู้ใช้เพิ่ม จึงได้กฎของ admin
  และ API ไปด้วย

**llms.txt และ Markdown**
- `llmsTxt(cms)` ตามรูปแบบของ llmstxt.org ใช้หน้าชุดเดียวกับ sitemap (อ่านแบบผู้เข้าชม มี URL ไม่ได้ตั้ง noindex)
  ผ่าน `visiblePages()` ที่ sitemap ใช้ร่วมกัน แบ่งหัวข้อตาม collection จำกัด 100 หน้าล่าสุดต่อ collection
  เพราะ llms.txt ควรเป็นสารบัญ ไม่ใช่รายการทุกหน้า
- ภาษาเดียว (ภาษาเริ่มต้น หรือ `llms.locale`) เพราะ llms.txt ไม่มีกลไกแบบ hreflang ถ้าใส่ทุกภาษาจะซ้ำกัน
- ลิงก์ไปหน้า Markdown ผ่าน option แยก `llms.markdownURL` ไม่เปลี่ยนความหมายของ `generateURL` ที่เป็นที่อยู่ของหน้า HTML
- `renderMarkdown()` อยู่ใน `@easy-cms/richtext` คู่กับ `renderRichText()` (escape ข้อความที่ดูเหมือน Markdown
  และตัด URL ที่ไม่ปลอดภัยแบบเดียวกัน) plugin SEO จึงพึ่ง richtext แต่ยังไม่ import core ตอนรัน
- `docMarkdown()` สร้างจาก field ตามลำดับ: rich text และ textarea ที่ระดับบนสุด และข้อความทุกชนิดใน blocks/array
  (field `text` ระดับบนมักเป็น slug หรือชื่อ ซึ่งไม่ใช่เนื้อหา) เขียนเองต่อ collection ได้ด้วย `markdown`
- หน้า `.md` แต่ละหน้าให้แอปเพิ่ม route เอง เพราะแอปเป็นผู้กำหนดรูปแบบ URL ไม่ทำ content negotiation
  (`Accept: text/markdown`) เพราะ cache ของ CDN จะเก็บผิดแบบ
- `llmsFullTxt()` หยุดที่ประมาณ 5 MB แล้วชี้ไปที่ llms.txt และ sitemap

**IndexNow**
- ใช้ hook ของ plugin เอง ไม่ใช้ระบบ webhook ของ core ผู้ใช้จึงไม่ต้องตั้ง `webhooks` และไม่มีตารางคิวเพิ่ม
- ส่งเฉพาะเมื่อสิ่งที่ผู้เข้าชมเห็นเปลี่ยน: เผยแพร่ แก้ไขขณะเผยแพร่ ยกเลิกเผยแพร่ หรือลบ เมื่อมีฉบับร่างรออยู่
  `previousDoc` ของ `afterChange` เป็นฉบับร่าง จึงแยกการยกเลิกเผยแพร่ออกจากการบันทึกฉบับร่างไม่ได้ plugin จึงอ่านสถานะ
  ที่เผยแพร่อยู่ใน `beforeChange` แล้วเทียบอีกครั้งหลังบันทึก (อ่านเพิ่มหนึ่งครั้งต่อการแก้ไข เฉพาะเมื่อเปิด IndexNow)
- รวบรวม 5 วินาทีแล้วส่งเป็นชุดต่อ host ส่งไม่สำเร็จจะ log โดยไม่ส่งซ้ำ เพราะเครื่องมือค้นหายังเข้ามาอ่านเองตามปกติ
  ส่งเฉพาะ URL `https` ที่เป็นสาธารณะ (ไม่ใช่ localhost, IP, `.test`, `.local` …) เครื่อง dev, e2e และ staging จึงไม่ส่งออกไป
- ไฟล์ key ต้องอยู่ที่ root (`/<key>.txt`) เพราะ IndexNow รับเฉพาะ URL ที่อยู่ใต้ตำแหน่งของไฟล์ key: standalone ใช้
  root endpoint ส่วน Nuxt/Next ใช้ `indexNowKeyFile(cms, pathname)` ที่หา key จาก handler ของ endpoint ด้วย
  `Symbol.for(…)` เหมือน sitemap

## ผลที่ตามมา

- ✅ เจ้าของเว็บเลือก "ไม่ให้เทรน แต่ให้ AI อ้างอิงได้" ได้ในบรรทัดเดียว
- ✅ AI อ่านเนื้อหาเป็น Markdown ได้ทั้งแบบสารบัญ ทั้งไฟล์ และรายหน้า
- ❌ รายชื่อ crawler ต้องดูแลต่อเนื่อง และกลุ่ม `user` อาจไม่ทำตาม robots.txt เสมอ
- ❌ Nuxt และ Next.js ต้องเพิ่ม route เอง (llms.txt, หน้า `.md`, ไฟล์ key) Next.js ต้องใช้ rewrite สำหรับ `/posts/<slug>.md`
- ❌ IndexNow ที่รออยู่ในหน่วยความจำจะหายถ้า process หยุดภายใน 5 วินาที (serverless ตั้ง `delay` ให้สั้นลงได้)
