# ADR-0069: Easy CMS เป็น TypeScript backend ครบในตัว และ roadmap หกระดับ

- **สถานะ:** Accepted
- **วันที่:** 2026-11-13
- **เกี่ยวข้อง:** [ADR-0065](0065-code-first-application-engine.md) (แทนเฉพาะเรื่องคำโปรย), [ADR-0004](0004-code-first-content-model.md), [ADR-0067](0067-multi-runtime.md), [ADR-0070](0070-realtime.md) (realtime ของระดับ 2), [ROADMAP](../ROADMAP.md)

## บริบท

- ADR-0065 วางคำโปรยว่า Easy CMS เป็น application engine แบบ code-first และให้ปรับเว็บหลัง actions, Kanban และ CRM template ออก
- ตั้งแต่นั้น Easy CMS มีมากกว่าที่จัดการเนื้อหา: REST และ GraphQL, auth และ single sign-on, ไฟล์, job queue ที่ลองใหม่เองได้,
  ร้านค้า, หลาย tenant, ฟอร์ม, plugin AI, MCP (preview) และ API keys รันได้หลาย runtime (ADR-0067)
- คำว่า "CMS" กับ "application engine" ไม่บอกนักพัฒนาว่าได้ backend ทั้งก้อน และเว็บ easycms.dev กำลังออกแบบใหม่
- เจ้าของโปรเจกต์ต้องการ roadmap สาธารณะที่บอกว่าอะไรใช้ได้วันนี้และอะไรกำลังมา โดยไม่สัญญาเกินจริง

## การตัดสินใจ

- **ตำแหน่ง:** "the all-in-one TypeScript backend for developers, with an admin built in"
  - hero: "One TypeScript file. A whole backend."
  - **คงชื่อ Easy CMS:** ชื่อเป็นที่รู้จักแล้ว และ headless CMS ยังเป็นระดับแรกที่ครบ
  - **กลุ่มเป้าหมาย:** นักพัฒนา TypeScript ยืนยัน code-first ตาม ADR-0004 และ ADR-0065 ไม่ใช่เครื่องมือ no-code
- **roadmap หกระดับ** เป็นแกนของ roadmap บนเว็บ แต่ละระดับมีรายการ "ใช้ได้วันนี้" และ "ยังต้องทำ":

  | ระดับ | ชื่อ | สถานะ | ใช้ได้วันนี้ | ถัดไป |
  |---|---|---|---|---|
  | 1 | Headless CMS | ครบ | collection, field, ฉบับร่าง, หลายภาษา, คลังสื่อ, REST และ GraphQL | — |
  | 2 | Backend as a service | กำลังทำ | auth, single sign-on, สิทธิ์, ไฟล์, API keys | realtime ([ADR-0070](0070-realtime.md)) |
  | 3 | App framework | ครบ | hooks, endpoints, หน้าและแผง dashboard ของตัวเอง, component ของ field, actions, ปฏิทิน | — |
  | 4 | Business engine | กำลังทำ | ร้านค้า, หลาย tenant, ฟอร์ม | Kanban, template CRM และ Booking |
  | 5 | Durable workflows | กำลังทำ | job queue, การลองใหม่ | workflow หลายขั้นที่ใช้เวลานาน |
  | 6 | AI-native | กำลังทำ | plugin AI, MCP (preview), API keys | MCP พ้น preview, การแก้ไขของ agent ที่รอคนอนุมัติ |

- **"ครบ" หมายถึง:** สิ่งที่ระดับนั้นต้องมีออกแล้ว และ CI ทดสอบอยู่ ไม่ใช่ว่าจะไม่เพิ่มอะไรอีก
  - ระดับที่ "กำลังทำ" บอกชิ้นถัดไปหนึ่งหรือสองอย่าง ไม่บอกวันที่
- **ไม่ใส่เปอร์เซ็นต์ความคืบหน้าที่ไหนเลย:** ทั้งบนเว็บ ใน README และในเอกสาร ใช้รายการสิ่งที่ใช้ได้กับสิ่งที่ยังต้องทำแทน
- **ไม่เอ่ยชื่อคู่แข่งบน roadmap:** roadmap บอกว่า Easy CMS ทำอะไรได้ ไม่ใช่เทียบกับใคร
- **ข้อมูล roadmap อยู่ในเว็บเอง:** collection `roadmap-levels` ของ Easy CMS ในโปรเจกต์เว็บ
  - แต่ละระดับมีรายการ "ใช้ได้วันนี้", รายการ "ยังต้องทำ" และ flag `next` บอกชิ้นที่กำลังทำ
  - แก้ในหน้า admin ของเว็บแล้วหน้า [easycms.dev/roadmap](https://easycms.dev/roadmap) อัปเดตทันทีที่บันทึก ไม่ต้อง deploy
  - งานรายตัวยังอยู่ใน GitHub Milestones และ [docs/ROADMAP.md](../ROADMAP.md) ตามเดิม
- **แทน ADR-0065 เฉพาะเรื่องคำโปรย:** การตัดสินใจอื่นใน ADR-0065 (code-first, custom actions, view, Kanban, ธีม,
  พื้นที่ฟอร์ม, สัญญาของ CSS และลำดับงาน) ยังใช้ตามเดิม

## ผลที่ตามมา

- ✅ คำโปรยตรงกับสิ่งที่มีจริง และนักพัฒนาเห็นทั้ง backend ไม่ใช่แค่ที่เก็บบทความ
- ✅ roadmap บนเว็บแก้ได้จากหน้า admin ของเว็บเอง จึงเป็นตัวอย่างการใช้ Easy CMS ไปในตัว
- ✅ เกณฑ์ "ครบ" ตรวจได้: ถ้าไม่มีเทสใน CI ก็ยังไม่ครบ
- ⚠️ ชื่อ Easy CMS แคบกว่าตำแหน่งใหม่ เว็บต้องอธิบายตั้งแต่ hero ว่าได้มากกว่า CMS
- ⚠️ รายการบนเว็บกับ docs/ROADMAP.md อาจไม่ตรงกัน เมื่อระดับไหนเปลี่ยนสถานะต้องแก้ทั้งสองที่
- ⚠️ ระดับที่ "กำลังทำ" สร้างความคาดหวัง ชิ้นที่ติด `next` ต้องเป็นงานที่ทำอยู่จริง
