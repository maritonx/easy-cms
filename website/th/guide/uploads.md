# การอัปโหลดและ media {#uploads-media}

::: info หน้านี้สอนอะไร
คลังสื่อ ขนาดรูป ข้อจำกัดของไฟล์ และการเก็บไฟล์บนดิสก์หรือ S3, Cloudflare R2 และ MinIO

**ควรอ่านก่อน:** [Fields](./fields)
:::

<Screenshot name="media" alt="คลังสื่อ" />

ไฟล์ถูกเก็บไว้ใน collection `media` ที่มีมาในตัว เชื่อมโยงไฟล์ด้วย field ประเภท `upload`:

```ts
{ name: 'cover', type: 'upload' }
```

ผู้แก้ไขเนื้อหาอัปโหลดไฟล์ได้ที่ Media library ในหน้า admin (ลากแล้ววาง) หรือจากตัวเลือกไฟล์ของ upload field

## การอัปโหลดจากโค้ด {#uploading-from-code}

```ts
const media = await cms.upload({ data: bytes, name: 'photo.jpg' }, { alt: 'A photo' })
media.url // "/api/cms/media/file/photo-3f9a2c1b.jpg"
```

ผ่าน REST: `POST /api/cms/media` ด้วย `multipart/form-data` โดยใส่ไฟล์ใน `file` และ field อื่น
(เช่น `alt`) เป็น text part

## สิ่งที่เกิดขึ้นกับไฟล์ {#what-happens-to-a-file}

- **ตรวจสอบประเภทไฟล์จากเนื้อหา** ไม่ใช่จากชื่อไฟล์หรือ Content-Type ที่ client ส่งมา ประเภทต้อง
  ตรงกับ `upload.mimeTypes` (ค่าเริ่มต้น `image/*`, `application/pdf`)
- **ขนาด** ถูกจำกัดด้วย `upload.maxFileSize` (ค่าเริ่มต้น 10 MB) ไฟล์ที่ใหญ่กว่าจะได้ `413`
- **ชื่อไฟล์** จะถูกเปลี่ยนเป็น `<name>-<random>.<detected extension>` จึงปลอดภัยและไม่ซ้ำกัน และ
  ชื่อภาษาไทยยังคงอ่านออก
- **รูปภาพ** จะได้ `width` และ `height` หากติดตั้ง [`sharp`](https://sharp.pixelplumbing.com) ไว้
  `upload.imageSizes` จะสร้างสำเนาที่ปรับขนาดแล้วไว้ใน `sizes`
- การลบเอกสาร media จะลบไฟล์ของเอกสารนั้นด้วย

```ts
upload: {
  maxFileSize: 5 * 1024 * 1024,
  mimeTypes: ['image/*'],
  imageSizes: [
    { name: 'thumbnail', width: 400, height: 300 },
    { name: 'wide', width: 1600 },
  ],
}
```

เอกสาร media มีหน้าตาดังนี้:

```json
{
  "id": 7,
  "filename": "photo-3f9a2c1b.jpg",
  "originalName": "photo.jpg",
  "mimeType": "image/jpeg",
  "filesize": 184213,
  "width": 2400,
  "height": 1600,
  "alt": "A photo",
  "url": "/api/cms/media/file/photo-3f9a2c1b.jpg",
  "sizes": { "thumbnail": { "width": 400, "height": 300, "url": "…" } }
}
```

หลังอัปโหลดแล้ว แก้ไขได้เฉพาะ `alt` (และ field ที่คุณเพิ่มเอง) metadata ของ media ทุกคนอ่านได้ และ
ผู้ใช้ที่เข้าสู่ระบบแล้วเขียนได้ ประกาศ collection `media` เองเพื่อเปลี่ยนพฤติกรรมนี้หรือเพิ่ม field

## การเสิร์ฟไฟล์และการจัดเก็บ {#serving-and-storage}

ไฟล์ถูกเสิร์ฟที่ `/api/cms/media/file/<name>` พร้อม caching ระยะยาวและ Content Security Policy
แบบ sandbox ทำให้ SVG ที่อัปโหลดมาไม่สามารถรันสคริปต์ได้ ตั้งค่า `serverURL` เพื่อให้ได้ URL แบบเต็ม

การจัดเก็บเริ่มต้นคือดิสก์ในเครื่อง (`upload.dir` ค่าเริ่มต้น `uploads/`) ซึ่งต้องใช้ filesystem
ที่คงอยู่ถาวร บนโฮสต์แบบ serverless (Vercel, Netlify) และใน container ที่ไม่มี volume ให้ใช้ S3

## S3, Cloudflare R2 และ MinIO {#s3-cloudflare-r2-and-minio}

```bash
npm install @easy-cms/storage-s3
```

```ts
import { s3Storage } from '@easy-cms/storage-s3'

export default defineConfig({
  // …
  upload: {
    storage: s3Storage({ bucket: 'my-site-media', region: 'eu-central-1' }),
  },
})
```

ข้อมูลรับรองอ่านจาก `AWS_ACCESS_KEY_ID` และ `AWS_SECRET_ACCESS_KEY` (และ `AWS_SESSION_TOKEN`,
`AWS_REGION`) เว้นแต่คุณจะส่ง `accessKeyId` / `secretAccessKey` มาเอง ค่าเหล่านี้ถูกอ่านตอนที่ CMS
เริ่มทำงาน ดังนั้นการ build โดยไม่มีค่าเหล่านี้ก็ยังทำได้

| ตัวเลือก | ค่าเริ่มต้น | |
|---|---|---|
| `bucket` | จำเป็น | ชื่อ bucket |
| `region` | `AWS_REGION` จากนั้น `us-east-1` | `auto` สำหรับ Cloudflare R2 |
| `endpoint` | AWS S3 | สำหรับบริการที่เข้ากันได้กับ S3 เช่น `https://<account>.r2.cloudflarestorage.com` |
| `prefix` | ไม่มี | โฟลเดอร์สำหรับ object เช่น `media/` |
| `publicUrl` | ไม่มี | เสิร์ฟไฟล์จากที่นี่ (CDN หรือ public bucket) แทนการเสิร์ฟผ่าน API |
| `forcePathStyle` | `true` เมื่อมี `endpoint` | การอ้างอิงแบบ `<endpoint>/<bucket>/<key>` |

Cloudflare R2:

```ts
s3Storage({
  bucket: 'my-site-media',
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
})
```

access key ต้องมีสิทธิ์ `s3:PutObject`, `s3:GetObject` และ `s3:DeleteObject` บน bucket

**Private bucket (ค่าเริ่มต้น)** หากไม่มี `publicUrl` ไฟล์จะถูก stream ผ่าน
`/api/cms/media/file/<name>` พร้อม header สำหรับ caching และ sandbox แบบเดียวกับการจัดเก็บในเครื่อง
bucket จึงยังคงเป็น private วาง CDN ไว้หน้าเว็บไซต์เพื่อไม่ต้องดึงไฟล์จาก S3 ทุกครั้งที่มี
request

**Public bucket** เมื่อมี `publicUrl` URL ของ media จะชี้ไปที่ bucket หรือ CDN โดยตรง และ server
ของคุณไม่เกี่ยวข้อง ให้เสิร์ฟจาก **โดเมนที่ต่างจาก** เว็บไซต์ของคุณ เพราะ Content Security Policy
แบบ sandbox ไม่ได้ถูกใช้ที่นั่น มิฉะนั้น SVG ที่อัปโหลดมาอาจรันสคริปต์ภายใต้ origin
ของเว็บไซต์คุณได้

## การจัดเก็บแบบกำหนดเอง {#custom-storage}

implement `StorageAdapter` (`put`, `get`, `delete` และ `url` กับ `init` ที่ไม่บังคับ) แล้วส่งเป็น
`upload.storage`

## ขั้นต่อไป {#next-steps}

- [Rich text](./rich-text): รูปใน rich text
- [Backup และการอัปเกรด](./backups): สำรองไฟล์ที่อัปโหลด
