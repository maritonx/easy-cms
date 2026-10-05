# ADR-0038: Single sign-on สำหรับหน้า admin

- **สถานะ:** Accepted
- **วันที่:** 2026-10-05

## บริบท

- หน้า admin เข้าได้ด้วยอีเมลกับรหัสผ่านเท่านั้น องค์กรที่ใช้ Google Workspace หรือ Microsoft Entra ID ต้องการให้พนักงานใช้บัญชีเดิม และปิดบัญชีที่เดียวเมื่อคนออก
- core เลี่ยง dependency หนัก ส่วนที่ต้องใช้ library ภายนอกแยกเป็น package (เช่น `email-smtp`, `storage-s3`)
- ระบบ session มี `createSession(userId)` อยู่แล้ว

## การตัดสินใจ

- **package แยก `@easy-cms/auth-oauth`** ใช้ `oauth4webapi` (ไม่มี dependency ซ้อน ทำตามมาตรฐาน ใช้ Web API) มี `oidc()` แบบทั่วไป และ `google()`, `microsoft()`, `github()` ส่วน core กำหนดแค่ interface `AuthProvider` (`authorizationURL`, `callback`, `describe`) และทำส่วนที่เหลือ
- **ตั้งค่าในโค้ด:** `auth.providers`, `auth.allowSignUp: { domains, role }`, `auth.password` secret อยู่ใน environment variable (ไม่อยู่ในฐานข้อมูลหรือ backup) หน้า ตั้งค่า → SSO แสดงแบบอ่านอย่างเดียว พร้อม callback URL ให้คัดลอก
- **Authorization Code + PKCE (S256) + `state` + `nonce`** ค่าชั่วคราวอยู่ใน cookie `ecms-sso` ที่ลงลายเซ็นด้วย secret อายุ 10 นาที (HttpOnly, SameSite=Lax เพราะ callback เป็นการ redirect ข้ามเว็บแบบ top-level) จึงไม่ต้องใช้ฐานข้อมูล callback URL สร้างจาก `serverURL` (หรือ origin ของ request ตอนพัฒนา) แบบเดียวกับลิงก์รหัสผ่าน
- **จับคู่ผู้ใช้:** ด้วย (provider, `sub`) ในตารางภายใน `user-identities` ก่อน ถ้ายังไม่มี จับคู่ด้วยอีเมลที่ provider ยืนยันแล้วเท่านั้น ถ้าไม่พบ สร้างผู้ใช้ใหม่เฉพาะโดเมนใน `allowSignUp` (บทบาทห้ามเป็น `admin`) อื่นๆ ถูกปฏิเสธ ผู้ใช้ที่ปิดใช้งานเข้าไม่ได้ ผลลัพธ์ที่ไม่สำเร็จส่งกลับหน้า login ด้วย `?sso=<เหตุผล>` แทน error JSON เพราะเป็นการนำทางของเบราว์เซอร์
- **Microsoft:** ต้องระบุ tenant ID (ไม่รับ `common`) เพราะ issuer ของ ID token ต้องตรงกับที่ discovery ประกาศ และ Entra ID ไม่ส่ง `email_verified` จึงถือว่าอีเมลขององค์กรยืนยันแล้ว **GitHub** ไม่ใช่ OIDC จึงอ่านอีเมลหลักที่ยืนยันแล้วจาก API
- **รหัสผ่าน:** `auth.password: false` ให้เฉพาะ admin ใช้รหัสผ่าน (ทางเข้าสำรองเมื่อ provider ล่ม) คนอื่นที่ใส่รหัสถูกจะได้ข้อความให้ใช้ provider ลิงก์ลืมรหัสผ่านไม่ส่งให้ คำเชิญชี้ไปหน้า login แทนหน้าตั้งรหัสผ่าน admin คนแรกตั้งด้วยรหัสผ่านเสมอ
- **เชื่อมบัญชี:** `POST <api>/auth/:id/link` (ต้องมี session และ CSRF token กันการเชื่อมบัญชีของผู้โจมตีเข้ากับบัญชีเหยื่อ) cookie ผูกกับ id ของผู้ใช้ และ callback ตรวจว่า session ยังเป็นคนเดิม บัญชีที่ผูกกับคนอื่นแล้วผูกซ้ำไม่ได้ ยกเลิกการเชื่อมทางเข้าสุดท้ายของบัญชีไม่ได้ ลบผู้ใช้แล้วลบบัญชีที่เชื่อมด้วย
- **redirect หลัง login** ได้เฉพาะหน้าใน admin (กัน open redirect)
- **ทดสอบ** ด้วย OIDC provider จำลองใน repo (discovery, JWKS, RS256, PKCE, GitHub API) ใช้ทั้งในเทสของ package, integration และ e2e

## ผลที่ตามมา

- ✅ องค์กรใช้บัญชี Google/Microsoft/GitHub เดิม และบังคับใช้ SSO ได้โดยไม่ถูกล็อกออกเมื่อ provider ล่ม
- ✅ core ไม่มี dependency เพิ่ม โปรเจกต์ที่ไม่ใช้ SSO schema ไม่เปลี่ยน
- ⚠️ โปรเจกต์ที่เปิด providers ต้อง migrate ตาราง `user-identities` ครั้งเดียว
- ❌ ยังไม่แมปบทบาทจากกลุ่มฝั่ง provider และยังไม่มี SAML
