# Multi-tenant {#multi-tenant}

::: info หน้านี้สอนอะไร
การใช้ CMS ตัวเดียวกับหลายเว็บหรือหลายลูกค้า: แต่ละ tenant มีเนื้อหา สมาชิก และการตั้งค่าของตัวเอง มีตัวสลับ tenant ในหน้า admin
และ frontend อ่านเฉพาะ tenant ของตัวเอง

**ควรอ่านก่อน:** [Access control](./access-control), [บทบาท](./roles) และ [Plugins](./plugins)
:::

`@easy-cms/plugin-multi-tenant` เพิ่ม tenant ให้ CMS ตัวเดียว ฐานข้อมูลเดียว และ admin ชุดเดียว tenant คือแบรนด์ เว็บ สาขา
หรือลูกค้า แต่ละ tenant มีเอกสารของตัวเองใน collection ที่คุณระบุ มีค่าของตัวเองใน global ที่คุณระบุ และมีสมาชิกที่มีบทบาทใน tenant นั้น
ส่วนที่เหลือใช้ร่วมกัน

เหมาะกับบริษัทที่มีหลายแบรนด์หรือหลายเว็บ และ agency ที่ดูแลเว็บของลูกค้า ทีมทำงานได้ทุก tenant ส่วนลูกค้าแต่ละรายเข้าได้เฉพาะของตัวเอง
ถ้าลูกค้าห้ามใช้ฐานข้อมูลร่วมกันเลย ให้ใช้ CMS แยกตัวต่อลูกค้าแทน

## ติดตั้ง {#set-it-up}

```bash [pm]
npm install @easy-cms/plugin-multi-tenant
```

```ts
import { multiTenantPlugin } from '@easy-cms/plugin-multi-tenant'

export default defineConfig({
  // …
  auth: { rbac: true }, // ไม่บังคับ: บทบาทจากหน้า admin ให้แยกตาม tenant
  plugins: [
    multiTenantPlugin({
      collections: ['posts', 'pages', 'media'], // เอกสารแต่ละชิ้นเป็นของ tenant เดียว
      globals: ['site-settings'], // ค่าแยกต่อ tenant
    }),
  ],
})
```

plugin เพิ่มให้:

- **ตั้งค่า → Tenants**: ชื่อ slug และโดเมนของแต่ละ tenant
- **field `tenant`** ในทุก collection ที่ระบุ ใส่ให้เองจาก tenant ที่กำลังทำงานอยู่ ถ้ามี `media` และ `upload.folders`
  โฟลเดอร์สื่อก็เป็นของ tenant ด้วย
- **ตัวสลับ tenant** ด้านบนของเมนู admin สำหรับคนที่อยู่มากกว่าหนึ่ง tenant
- **ตั้งค่า → สมาชิก**: คนใน tenant ที่เลือกและบทบาทของแต่ละคน
- **`tenants` ในผู้ใช้**: tenant ที่แต่ละคนอยู่และบทบาทในแต่ละ tenant

จากนั้นสร้าง migration ตามปกติ `npx easy-cms migrate:create tenants` ถ้าเว็บมีเนื้อหาอยู่แล้ว ให้ย้ายไปไว้ใน tenant หนึ่งครั้งเดียว:

```bash
npx easy-cms tenants:assign brand-a
```

## ใครเห็นอะไร {#who-sees-what}

| ใคร | เห็นและแก้ไขได้ |
|---|---|
| ผู้ใช้ที่เข้าได้ทุก tenant (ค่าเริ่มต้น: role `admin`) | ทุก tenant หรือ tenant ที่เลือก รวมถึง Tenants, ตั้งค่า, สำรองข้อมูล และบทบาท |
| สมาชิก | tenant ที่กำลังทำงาน ด้วยบทบาทใน tenant นั้น: หนึ่งใน tenant ของเขา เลือกจากตัวสลับ |
| admin ของ tenant (role `admin` ใน tenant นั้น) | เนื้อหาและสมาชิกของ tenant นั้น ไม่รวมบทบาท สำรองข้อมูล อีเมล และ tenant อื่น |
| ผู้เยี่ยมชม | tenant ที่ request ระบุ ถ้าไม่ระบุจะไม่เห็นอะไร |

- เอกสารใหม่ได้ tenant ที่ request กำลังทำงานอยู่ เฉพาะผู้ใช้ที่เข้าได้ทุก tenant ที่เลือก tenant อื่นหรือย้ายเอกสารได้
- relationship ไปยัง collection ของ tenant เลือกและบันทึกได้เฉพาะเอกสารของ tenant เดียวกัน
- ค่าที่ unique รวมถึง slug ห้ามซ้ำแค่ภายใน tenant สองแบรนด์จึงมี `/posts/hello` ได้ทั้งคู่
- เพิ่มคนที่ **สมาชิก** ด้วยอีเมล บัญชีหนึ่งอยู่ได้หลาย tenant คนใหม่จะได้อีเมลให้ตั้งรหัสผ่านเมื่อตั้งค่า[อีเมล](./email)แล้ว
  admin ของ tenant แก้บัญชีของคนอื่นไม่ได้ แก้ได้แค่การเป็นสมาชิก
- [API key](./api-keys) จำ tenant ที่สร้างไว้ตลอด

## Frontend {#frontends}

request ระบุ tenant ตามลำดับนี้:

1. header `x-easy-cms-tenant` ด้วย slug หรือ id ของ tenant
2. `?tenant=` ใน URL
3. cookie ของ admin (ตัวสลับ)
4. โดเมน: tenant ที่มี host ของ request อยู่ใน **Domains**

```ts
// แอปอื่นหรือเว็บ static
const posts = await fetch('https://cms.example.com/api/cms/posts', {
  headers: { 'x-easy-cms-tenant': 'brand-a' },
}).then((r) => r.json())
```

ในหน้า Nuxt หรือ Next.js อ่านด้วย Local API ใน tenant ของโดเมนของหน้า:

```ts
import { tenantContext } from '@easy-cms/plugin-multi-tenant'

const context = await tenantContext(cms, { host: request.headers.get('host') ?? '' })
const posts = await cms.find('posts', { overrideAccess: false, user: null, context })
const site = await cms.findGlobal('site-settings', { overrideAccess: false, user: null, context })
```

`tenantContext(cms, { slug })` ใช้กับ slug จาก URL ได้ เช่น route `/[tenant]/[slug]` ส่วน `cms.forRequest(request)`
คืนผู้ใช้และ context ของ request แบบเดียวกับ REST

เมื่อใช้ [plugin SEO](./seo) `/sitemap.xml` และ `/llms.txt` แสดงหน้าของ tenant ตามโดเมนที่ขอเข้ามา และ helper ของมันรับ `context`
เดียวกัน: `sitemap(cms, { context: await tenantContext(cms, { host }) })`

request ที่ไม่ระบุ tenant จะไม่พบอะไรใน collection ของ tenant ถ้าตั้ง `publicReads: 'all'` จะพบของทุก tenant แทน

## ตัวเลือก {#options}

| ตัวเลือก | ค่าเริ่มต้น | |
|---|---|---|
| `collections` | — | **ต้องระบุ** collection ที่เอกสารเป็นของ tenant เดียว |
| `globals` | `[]` | global ที่มีค่าแยกต่อ tenant |
| `tenantsSlug` | `tenants` | collection ของ tenant ประกาศเองเพื่อเพิ่ม field ได้ |
| `userHasAccessToAllTenants` | role `admin` | `(user) => boolean`: ใครเห็นทุก tenant และส่วนของระบบ |
| `publicReads` | `none` | `all`: request ที่ไม่ระบุ tenant อ่านของทุก tenant |
| `header` | `x-easy-cms-tenant` | header ที่ใช้ระบุ tenant |
| `cookie` | `ecms-tenant` | cookie ที่ admin ใช้จำ tenant ที่เลือก |

## ลบ tenant {#deleting-a-tenant}

การลบ tenant ที่ ตั้งค่า → Tenants จะลบเอกสารและไฟล์ใน collection ของ tenant นั้น และเอา tenant ออกจากรายการของสมาชิก ย้อนกลับไม่ได้
[สำรองข้อมูล](./backups)ก่อน

## ทำงานอย่างไร {#how-it-works}

plugin ใช้ส่วนของ core ที่คุณใช้เองได้:

- **`onRequest`** ใน config หา `context` ของแต่ละ request (ในที่นี้คือ tenant) และผู้ใช้ใน context นั้น (บทบาทใน tenant, `scoped`)
  กฎสิทธิ์ hook และ `filterOptions` ได้รับ `context` และ Local API รับเป็นตัวเลือกได้
- **ผู้ใช้ที่ `scoped`** เป็น admin เฉพาะส่วนของตัวเอง ตั้งค่า สำรองข้อมูล บทบาท และ API key ของคนอื่นต้องเป็น admin ของทั้งระบบ
- **global ที่มี `scope`** เก็บค่าแยกตาม scope
- **`uniqueWithin`** ใช้ได้กับทุก field ที่ unique พร้อม unique index ต่อ scope ในฐานข้อมูล
- **`admin.switcher`** เพิ่มตัวเลือกด้านบนของเมนู

ยังไม่มี: สำรองหรือ export ข้อมูลทีละ tenant, webhook ต่อ tenant, tenant ที่สมัครเอง และ single sign-on ที่ใส่คนเข้า tenant ตามโดเมนของอีเมล

## ขั้นต่อไป {#next-steps}

- [บทบาท](./roles): แต่ละบทบาททำอะไรได้ สมาชิกได้บทบาทหนึ่งต่อ tenant
- [Access control](./access-control): กฎของคุณเองเห็น `context` ของ request
- [API keys](./api-keys): key สำหรับสคริปต์ของ tenant เดียว
