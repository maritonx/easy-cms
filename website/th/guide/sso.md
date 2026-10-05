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

- **คนที่มีบัญชีอยู่แล้ว** จับคู่ด้วยอีเมล นับเฉพาะอีเมลที่ผู้ให้บริการยืนยันแล้ว หลังจากครั้งแรกจะใช้ id ของบัญชีจาก
  ผู้ให้บริการแทน ถ้าอีเมลฝั่งผู้ให้บริการเปลี่ยนก็ยังเข้าได้
- **คนจากโดเมนของคุณ** เมื่อเปิดให้ จะได้บัญชีตอนเข้าสู่ระบบครั้งแรก

  ```ts
  auth: {
    providers: [google()],
    allowSignUp: { domains: ['example.com'], role: 'editor' }, // ห้ามเป็น 'admin'
  },
  ```

- คนอื่นเข้าไม่ได้ อีเมลที่ไม่รู้จักจะถูกส่งกลับไปหน้า login พร้อมข้อความให้ติดต่อผู้ดูแลระบบ
- ผู้ใช้ที่ถูกปิดใช้งานเข้าไม่ได้ ไม่ว่าผู้ให้บริการจะว่าอย่างไร

การเพิ่มคน ให้สร้างผู้ใช้ใน **ตั้งค่า → ผู้ใช้** (ด้วยอีเมลที่ทำงาน) แล้วบอกให้เข้าสู่ระบบด้วยผู้ให้บริการ ถ้าตั้งค่าอีเมลไว้
ก็ **เชิญ** ได้ตามปกติ

## รหัสผ่าน {#passwords}

ค่าเริ่มต้นเข้าสู่ระบบได้ทั้งสองแบบ ถ้าต้องการให้ทุกคนใช้ผู้ให้บริการ:

```ts
auth: { providers: [google()], password: false },
```

แบบนี้จะมีแต่ **ผู้ดูแลระบบ** ที่ยังใช้รหัสผ่านได้ เป็นทางเข้าสำรองเมื่อผู้ให้บริการล่ม หน้า login พับฟอร์มรหัสผ่านไว้ให้
คำเชิญจะบอกให้เข้าสู่ระบบด้วยผู้ให้บริการแทนการตั้งรหัสผ่าน และ "ลืมรหัสผ่าน" ใช้ได้เฉพาะผู้ดูแลระบบ

## เชื่อมบัญชี {#linking-accounts}

ในหน้า **Account** แต่ละคนเห็นบัญชีภายนอกที่ใช้เข้าสู่ระบบ เชื่อมผู้ให้บริการเพิ่มได้ (**เชื่อม GitHub**) และยกเลิกการ
เชื่อมได้ แต่ยกเลิกทางเข้าสุดท้ายของบัญชีไม่ได้ ผู้ดูแลระบบเห็นและยกเลิกบัญชีของผู้ใช้ได้ในหน้าของผู้ใช้คนนั้น การลบผู้ใช้
จะลบบัญชีที่เชื่อมไว้ด้วย

## ตั้งค่าผู้ให้บริการ {#setting-up-providers}

### Google {#google}

1. ใน [Google Cloud console](https://console.cloud.google.com/apis/credentials) สร้าง **OAuth client ID** แบบ
   **Web application** (ถ้าถูกถามให้ตั้ง consent screen ก่อน สำหรับ Google Workspace เลือก **Internal**)
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

Entra ID ไม่ระบุว่าอีเมลยืนยันแล้วหรือยัง แต่องค์กรของคุณเป็นผู้จัดการอีเมลเหล่านั้นเอง จึงนับว่ายืนยันแล้ว ผู้ใช้จับคู่ด้วย
อีเมล หรือ user principal name ถ้าเป็นรูปแบบอีเมล

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

## ความปลอดภัย {#how-it-is-kept-safe}

- ใช้ Authorization Code flow แบบ **PKCE** พร้อม `state` และ `nonce` (OpenID Connect) เก็บไว้ใน cookie ที่ลงลายเซ็น
  อายุสั้น และตรวจ ID token ด้วย key ของผู้ให้บริการ ([oauth4webapi](https://github.com/panva/oauth4webapi))
- หลังเข้าสู่ระบบ ระบบพากลับได้เฉพาะหน้าใน admin
- การเชื่อมบัญชีต้องใช้ session และ CSRF token และบัญชีที่ผูกกับคนอื่นอยู่แล้วจะผูกซ้ำไม่ได้
- client secret อยู่ใน environment variable ไม่ถูกเก็บในฐานข้อมูลหรือไฟล์ backup

## ขั้นต่อไป {#next-steps}

- [บทบาทและสิทธิ์จากหน้า admin](./roles): กำหนดว่าแต่ละคนทำอะไรได้หลังเข้ามาแล้ว
- [ความปลอดภัย](./security): สิ่งที่ระบบป้องกันให้เพิ่มเติม
