# Single sign-on {#single-sign-on}

::: info หน้านี้สอนอะไร
ให้คนเข้าสู่ระบบหน้า admin ด้วย Google, Microsoft, GitHub หรือผู้ให้บริการ OpenID Connect ใดก็ได้ ใครเข้าได้บ้าง
และวิธีตั้งค่าแต่ละเจ้า

**ควรอ่านก่อน:** [ผู้ใช้และการยืนยันตัวตน](./auth)
:::

<Screenshot name="login-sso" alt="หน้า login ที่มีปุ่ม เข้าสู่ระบบด้วย Company SSO อยู่เหนือฟอร์มรหัสผ่าน" />

ติดตั้ง package แล้วใส่ผู้ให้บริการใน config:

```sh [pm]
npm install @easy-cms/auth-oauth
```

```ts
import { github, google, microsoft } from '@easy-cms/auth-oauth'

export default defineConfig({
  serverURL: 'https://cms.example.com', // ต้องมีบน production ใช้สร้าง callback URL
  auth: {
    providers: [google()], // อ่าน GOOGLE_CLIENT_ID และ GOOGLE_CLIENT_SECRET
  },
  // …
})
```

หน้า login จะมีปุ่ม **เข้าสู่ระบบด้วย Google** ผู้ให้บริการจะส่งคนกลับมาที่ `<serverURL>/api/cms/auth/<id>/callback`
เช่น `https://cms.example.com/api/cms/auth/google/callback` ให้นำ URL นี้ไปกรอกฝั่งผู้ให้บริการ (หน้า ตั้งค่า →
**Single sign-on** แสดงไว้พร้อมปุ่มคัดลอก) single sign-on ใช้กับหน้า admin เท่านั้น ไม่กระทบผู้เข้าชมเว็บของคุณ

<Screenshot name="sso" alt="ตั้งค่า → Single sign-on: ผู้ให้บริการแต่ละเจ้าพร้อม callback URL ให้คัดลอก และใครเข้าสู่ระบบได้" />

การเปิดใช้ผู้ให้บริการจะเพิ่มตาราง `user-identities` จึงต้องสร้าง migration (`npx easy-cms migrate:create sso`)

## ใครเข้าได้บ้าง {#who-gets-in}

- **คนที่มีบัญชีอยู่แล้ว** ต้องเชื่อมผู้ให้บริการก่อน: เข้าสู่ระบบด้วยรหัสผ่านแล้วกด **เชื่อม Google** (หรือผู้ให้บริการอื่น) ที่หน้า **บัญชีของฉัน** ปุ่มของผู้ให้บริการที่หน้า login ใช้เชื่อมไม่ได้ หลังจากนั้นจะใช้ id
  ของบัญชีจากผู้ให้บริการ ถ้าอีเมลฝั่งผู้ให้บริการเปลี่ยนก็ยังเข้าได้ ถ้าลองเข้าด้วยผู้ให้บริการก่อนเชื่อม ระบบจะบอกให้เชื่อมก่อน
- **จับคู่ด้วยอีเมล**แทน สำหรับผู้ให้บริการที่องค์กรของคุณควบคุมอีเมลเอง (Google Workspace หรือ Entra ID ขององค์กร):
  `google({ linkByEmail: true })` นับเฉพาะอีเมลที่ผู้ให้บริการยืนยันแล้ว ส่วนสมาชิกเว็บ (`auth.members`) จับคู่ด้วยอีเมลเสมอ
- **คนจากโดเมนของคุณ** เมื่อเปิดให้ จะได้บัญชีตอนเข้าสู่ระบบครั้งแรก

  ```ts
  auth: {
    providers: [google()],
    providerSignUp: { domains: ['example.com'], role: 'editor' }, // ห้ามเป็น 'admin'
  },
  ```

- คนอื่นเข้าไม่ได้ อีเมลที่ไม่รู้จักจะถูกส่งกลับไปหน้า login พร้อมข้อความให้ติดต่อผู้ดูแลระบบ
- ผู้ใช้ที่ถูกปิดใช้งานเข้าไม่ได้ ไม่ว่าผู้ให้บริการจะว่าอย่างไร

การเพิ่มคน ให้สร้างผู้ใช้ใน **ตั้งค่า → ผู้ใช้** (ด้วยอีเมลที่ทำงาน) แล้วส่งคำเชิญ ผู้ใช้เชื่อมผู้ให้บริการที่หน้าบัญชีของตัวเอง
หรือเข้าด้วยผู้ให้บริการได้ทันทีเมื่อตั้ง `linkByEmail`

## รหัสผ่าน {#passwords}

ค่าเริ่มต้นเข้าสู่ระบบได้ทั้งสองแบบ ถ้าต้องการให้ทุกคนใช้ผู้ให้บริการ:

```ts
auth: { providers: [google()], password: false },
```

แบบนี้จะมีแต่ **ผู้ดูแลระบบ** ที่ยังใช้รหัสผ่านได้ เป็นทางเข้าสำรองเมื่อผู้ให้บริการล่ม หน้า login พับฟอร์มรหัสผ่านไว้ให้
คำเชิญจะบอกให้เข้าสู่ระบบด้วยผู้ให้บริการแทนการตั้งรหัสผ่าน และ "ลืมรหัสผ่าน" ใช้ได้เฉพาะผู้ดูแลระบบ

### Single sign-on สำหรับทุกคน {#single-sign-on-for-everyone}

องค์กรที่บังคับ MFA ที่ identity provider ไม่ต้องการให้มีบัญชีไหนเลี่ยงไปใช้รหัสผ่านได้ รวมถึงผู้ดูแลระบบ ให้ระบุบัญชีที่ยังใช้รหัสผ่านได้แทน
เก็บไว้ใช้เมื่อผู้ให้บริการล่ม

```ts
auth: {
  providers: [microsoft()],
  password: { breakGlass: ['emergency@example.com'] },
},
```

- **ทุกคนที่เหลือเข้าสู่ระบบด้วยผู้ให้บริการ** รวมถึงผู้ดูแลระบบ รหัสผ่านของพวกเขาถูกปฏิเสธทั้งตอน login และที่ API ตั้งรหัสผ่านไม่ได้
  (admin ซ่อนช่องนี้) ส่วนคำเชิญและ "ลืมรหัสผ่าน" ทำงานเหมือนตอนใช้ `false`
- **มีผลตอนเซิร์ฟเวอร์เริ่มทำงาน** หรือทันทีเมื่อผู้ดูแลระบบเปลี่ยน ([ในหน้า admin](#who-can-sign-in)) session ที่เข้าด้วย
  รหัสผ่านของบัญชีที่ใช้รหัสผ่านไม่ได้แล้วจะถูกปิด และ [audit log](./audit-log) บันทึกการเปลี่ยน (`auth.password.policy`)
  ทุกคน login ใหม่ด้วยผู้ให้บริการหนึ่งครั้ง
- **ทุกครั้งที่ใช้บัญชีฉุกเฉินจะถูกบันทึก** เป็น `login.breakGlass` และ dashboard แสดงไว้หนึ่งวัน
  ([health checks](./health-checks#break-glass-sign-ins))
- **เก็บไว้หนึ่งบัญชีที่ใช้ได้จริง** สร้างด้วย `easy-cms admin:create` เก็บรหัสผ่านไว้ในตู้เซฟหรือ password manager และลองเป็นระยะ
  log ของ server จะเตือนถ้าไม่มีบัญชีในรายการที่มีอยู่จริงพร้อมรหัสผ่าน
- **ไม่เกี่ยวข้อง:** API key ซึ่งไม่เคยใช้รหัสผ่าน

## เชื่อมบัญชี {#linking-accounts}

ในหน้า **Account** แต่ละคนเห็นบัญชีภายนอกที่ใช้เข้าสู่ระบบ เชื่อมผู้ให้บริการเพิ่มได้ (**เชื่อม GitHub**) และยกเลิกการ
เชื่อมได้ แต่ยกเลิกทางเข้าสุดท้ายของบัญชีไม่ได้ ผู้ดูแลระบบเห็นและยกเลิกบัญชีของผู้ใช้ได้ในหน้าของผู้ใช้คนนั้น การลบผู้ใช้
จะลบบัญชีที่เชื่อมไว้ด้วย

## ตั้งในหน้า admin {#in-the-admin}

ผู้ดูแลระบบเปิดผู้ให้บริการได้เองที่ **ตั้งค่า → Integrations → เข้าสู่ระบบ** โดยไม่ต้อง deploy ใหม่ ผู้ให้บริการที่ตั้งใน
config ยังเป็นค่าเริ่มต้น และแสดงในหน้านั้นด้วย ผู้ดูแลระบบปิดได้

```ts
import { signInPlugin } from '@easy-cms/auth-oauth'

export default defineConfig({
  serverURL: 'https://cms.example.com',
  plugins: [signInPlugin()], // Google, Microsoft, GitHub และ OpenID Connect
  // auth: { providers: [google()] } ยังใช้ได้ เป็นค่าเริ่มต้น
})
```

หลังเพิ่ม plugin ให้สร้าง migration (`npx easy-cms migrate:create sign-in`) ซึ่งจะเพิ่มตาราง `user-identities`
ถ้า config ยังไม่มีผู้ให้บริการ

1. **เชื่อมต่อ** เปิด Google, Microsoft, GitHub หรือ OpenID Connect แล้วกรอก key ของแอป (client ID และ secret
   ซึ่ง secret จะถูกเข้ารหัสในฐานข้อมูล) คัดลอก **redirect URL** ที่แสดงไปใส่ใน console ของผู้ให้บริการ Google ใช้ key
   ชุดเดียวกันสำหรับการเข้าสู่ระบบและ [backup ไป Google Drive](./backups#google-drive) คือแอป Google Cloud แอปเดียว
   กรอกครั้งเดียว
2. **ทดสอบเข้าสู่ระบบ** คุณเข้าสู่ระบบที่ผู้ให้บริการ แล้วกลับมาที่หน้า Integrations พร้อมอีเมลที่ผู้ให้บริการส่งกลับมา การทดสอบ
   ไม่ได้ทำให้ใครเข้าสู่ระบบ ถ้าเปลี่ยน key หรือค่าของการเชื่อมต่อ ต้องทดสอบใหม่
3. **ใช้เข้าสู่ระบบ** หน้าเข้าสู่ระบบจะมีปุ่มเพิ่มขึ้น ถ้าการเชื่อมต่อใช้ id เดียวกับผู้ให้บริการใน config (`google`) จะใช้แทนตัวนั้น
   redirect URL จึงไม่เปลี่ยน

การปิดผู้ให้บริการจะทำให้คนที่เข้าด้วยวิธีนั้นออกจากระบบ ระหว่างที่การเชื่อมต่อใช้เข้าสู่ระบบอยู่ จะแก้หรือลบไม่ได้ ต้องปิดก่อน
ทุกการเปลี่ยนแปลงถูกบันทึกใน audit log

**ผู้ดูแลระบบล็อกตัวเองออกไม่ได้** ระบบไม่ยอมให้บันทึกการเปลี่ยนที่ทำให้ไม่มีผู้ดูแลระบบคนไหนเข้าได้ ทั้งด้วยรหัสผ่าน หรือด้วยบัญชีที่
เชื่อมกับผู้ให้บริการที่ยังเปิดอยู่ ถ้าเกิดขึ้นจริง (client secret หมดอายุ หรือผู้ให้บริการล่ม) ให้รันคำสั่งนี้ที่เซิร์ฟเวอร์ของแอป

```sh
npx easy-cms reset-sign-in
```

คำสั่งนี้ลบสิ่งที่ผู้ดูแลระบบเปิดหรือปิดไว้ การเข้าสู่ระบบจะกลับไปเป็นแบบที่ config ตั้งไว้

### ใครเข้าสู่ระบบได้ {#who-can-sign-in}

ที่ **ตั้งค่า → Single sign-on** ผู้ดูแลระบบเลือกได้ด้วยว่าใครใช้รหัสผ่านได้ และใครสมัครเองได้ แทนค่า `auth.password` และ
`auth.providerSignUp` ค่าใน config ยังเป็นค่าเริ่มต้น แต่ละกฎบอกว่ามาจากโค้ดหรือเปลี่ยนที่หน้านั้น และปุ่ม **ใช้ค่าจากโค้ด**
พากลับไป การเปลี่ยนมีผลกับทุกเซิร์ฟเวอร์ภายใน 30 วินาที และบันทึกใน audit log (`sign-in.rules`)

- **รหัสผ่าน:** ทุกคน เฉพาะผู้ดูแลระบบ หรือเฉพาะบัญชีฉุกเฉิน (break-glass) ซึ่งเลือกจากผู้ดูแลระบบที่มีรหัสผ่าน ก่อนบันทึก
  ระบบบอกว่ากี่บัญชีจะใช้รหัสผ่านไม่ได้ และกี่ session จะถูกตัด และไม่ยอมบันทึกถ้าหลังเปลี่ยนแล้วไม่มีผู้ดูแลระบบคนไหน หรือ
  ตัวผู้ดูแลระบบที่กดบันทึกเอง เข้าสู่ระบบได้ ให้เชื่อมผู้ให้บริการที่หน้าบัญชีของตัวเองก่อน
- **ผู้ดูแลระบบคนสุดท้ายในรายชื่อบัญชีฉุกเฉิน** ลบ ปิด หรือเปลี่ยน role ไม่ได้ ถ้าไม่มีผู้ดูแลระบบคนอื่นในรายชื่อที่มีรหัสผ่าน
- **คนใหม่:** โดเมนอีเมลที่คนในโดเมนนั้นได้บัญชีเมื่อเข้าสู่ระบบครั้งแรก และ role ที่ได้ ใช้โดเมนที่ใครก็สมัครอีเมลได้
  (gmail.com, outlook.com และอื่นๆ) ไม่ได้ และใช้ role ที่แก้บัญชีคนอื่นได้ไม่ได้ ถ้าตั้งแบบนี้ไว้ใน
  `auth.providerSignUp` จะมีคำเตือนตอนเริ่มเซิร์ฟเวอร์และในหน้านั้น และจะไม่ยอมตั้งแต่ 2.0 ถ้าไม่มีผู้ให้บริการเปิดอยู่
  กฎนี้ไม่มีผล

`easy-cms reset-sign-in` ลบกฎเหล่านี้ด้วย

ถ้าต้องการให้การเข้าสู่ระบบเป็นไปตามโค้ดเท่านั้น และไม่ให้แก้จากหน้า admin:

```ts
auth: { providers: [google()], locked: true }
```

## ตั้งค่าผู้ให้บริการ {#setting-up-providers}

### Google {#google}

1. ใน [Google Cloud console](https://console.cloud.google.com/apis/credentials) สร้าง **OAuth client ID** แบบ
   **Web application** ถ้าถูกถามให้ตั้ง consent screen ก่อน: สำหรับ Google Workspace เลือก **Internal** ถ้าไม่ใช่ให้เลือก
   **External** และระหว่างที่อยู่ในสถานะ **Testing** ให้เพิ่มบัญชี Google ที่จะ sign in ไว้ใน **Test users** (บัญชีอื่นจะถูกปฏิเสธ
   และ Google จะเตือนว่าแอปยังไม่ได้รับการยืนยันจนกว่าจะ publish)
2. ใส่ callback URL ใน **Authorized redirect URIs** เช่น `https://cms.example.com/api/cms/auth/google/callback`
   (และ `http://localhost:3000/api/cms/auth/google/callback` สำหรับตอนพัฒนา)
3. ตั้ง `GOOGLE_CLIENT_ID` และ `GOOGLE_CLIENT_SECRET` แล้วใช้ `google()` สำหรับ Workspace
   `google({ hd: 'example.com' })` จะเปิดหน้าเลือกบัญชีที่โดเมนของคุณ

### Microsoft (Entra ID) {#microsoft-entra-id}

1. ใน [Entra admin center](https://entra.microsoft.com) ไปที่ **App registrations** → **New registration**
   เลือกเฉพาะบัญชีในองค์กรนี้ และใส่ redirect URI แบบ **Web**: `https://cms.example.com/api/cms/auth/microsoft/callback`
2. ใน **Certificates & secrets** สร้าง client secret
3. ตั้ง `MICROSOFT_TENANT_ID` (**Directory (tenant) ID**), `MICROSOFT_CLIENT_ID` (**Application (client) ID**)
   และ `MICROSOFT_CLIENT_SECRET` แล้วใช้ `microsoft()`

Entra ID ไม่ระบุว่าอีเมลยืนยันแล้วหรือยัง แต่องค์กรของคุณเป็นผู้จัดการอีเมลเหล่านั้นเอง จึงนับว่ายืนยันแล้ว ใช้เฉพาะ claim
`email` เท่านั้น ไม่ใช้ user principal name

### GitHub {#github}

1. ใน GitHub ไปที่ **Settings** → **Developer settings** → **OAuth Apps** → **New OAuth App** ใส่ callback URL
   `https://cms.example.com/api/cms/auth/github/callback`
2. สร้าง client secret ตั้ง `GITHUB_CLIENT_ID` และ `GITHUB_CLIENT_SECRET` แล้วใช้ `github()`

จับคู่ด้วยอีเมลหลักที่ยืนยันแล้วของบัญชี GitHub สำหรับ GitHub Enterprise Server:
`github({ server: { web: 'https://github.example.com', api: 'https://github.example.com/api/v3' } })`

### ผู้ให้บริการ OpenID Connect อื่นๆ {#any-openid-connect-provider}

Okta, Keycloak, Auth0, Authentik, Zitadel และอื่นๆ:

```ts
import { oidc } from '@easy-cms/auth-oauth'

oidc({
  id: 'okta', // อยู่ใน callback URL: <api>/auth/okta/callback
  name: 'Okta', // บนปุ่ม
  issuer: 'https://example.okta.com',
  clientId: process.env.OKTA_CLIENT_ID ?? '',
  clientSecret: process.env.OKTA_CLIENT_SECRET,
})
```

ระบบอ่าน `/.well-known/openid-configuration` ของผู้ให้บริการเพื่อหา endpoint และ ID token ต้องมี `email` กับ
`email_verified` (scope `email`)

`id` ห้ามซ้ำกับ action ของการเข้าสู่ระบบใต้ `/auth/` (`login`, `logout`, `me`, `init`, `signup`,
`verify-email`, `forgot-password`, `reset-password`, `first-register`), `identities` หรือ `test`

## ความปลอดภัย {#how-it-is-kept-safe}

- ใช้ Authorization Code flow แบบ **PKCE** พร้อม `state` และ `nonce` (OpenID Connect) เก็บไว้ใน cookie ที่ลงลายเซ็น
  อายุสั้น และตรวจ ID token ด้วย key ของผู้ให้บริการ ([oauth4webapi](https://github.com/panva/oauth4webapi))
- หลังเข้าสู่ระบบ ระบบพากลับได้เฉพาะหน้าใน admin
- การเชื่อมบัญชีต้องใช้ session และ CSRF token และบัญชีที่ผูกกับคนอื่นอยู่แล้วจะผูกซ้ำไม่ได้
- client secret อยู่ใน environment variable หรือถ้ากรอกในหน้า admin จะถูกเข้ารหัสด้วย `secret` ในฐานข้อมูล
  (หลังเปลี่ยน secret ให้รัน `easy-cms secrets:rotate`)
- ผู้ให้บริการที่เปิดจากหน้า admin ต้องทดสอบผ่านก่อน และเฉพาะผู้ดูแลระบบของทั้งเว็บที่เปลี่ยนได้

## ขั้นต่อไป {#next-steps}

- [บทบาทและสิทธิ์จากหน้า admin](./roles): กำหนดว่าแต่ละคนทำอะไรได้หลังเข้ามาแล้ว
- [ความปลอดภัย](./security): สิ่งที่ระบบป้องกันให้เพิ่มเติม
