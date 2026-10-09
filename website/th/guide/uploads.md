# การอัปโหลดและ media {#uploads-media}

::: info หน้านี้สอนอะไร
คลังสื่อ โฟลเดอร์และชนิดไฟล์ ขนาดรูป ข้อจำกัดของไฟล์ และการเก็บไฟล์บนดิสก์หรือ S3, Cloudflare R2 และ MinIO

**ควรอ่านก่อน:** [Fields](./fields)
:::

<Screenshot name="media" alt="คลังสื่อ" />

ไฟล์ถูกเก็บไว้ใน collection `media` ที่มีมาในตัว เชื่อมโยงไฟล์ด้วย field ประเภท `upload`:

```ts
{ name: 'cover', type: 'upload' }
```

ผู้แก้ไขเนื้อหาอัปโหลดไฟล์ได้ที่คลังสื่อในหน้า admin หรือจากตัวเลือกไฟล์ของ upload field เลือกหรือลากมาวางได้
ทีละหลายไฟล์ ระบบอัปโหลดพร้อมกันครั้งละ 3 ไฟล์ แต่ละไฟล์มีแถบความคืบหน้า ยกเลิกทีละไฟล์ได้ และลองใหม่เฉพาะไฟล์ที่ล้มได้
ไฟล์ที่ใหญ่กว่า `upload.maxFileSize` จะถูกปฏิเสธก่อนส่ง ไฟล์ที่เพิ่งอัปโหลดจะถูกเลือกไว้ พร้อมย้ายเข้าโฟลเดอร์ต่อ

หน้า Media แสดงเป็นกริดของการ์ด (รูป หรือ icon สีตามชนิดไฟล์) หรือสลับเป็นตารางได้ที่ปุ่มข้างช่องค้นหา หน้าของแต่ละไฟล์
แสดงตัวอย่างตามชนิด: รูป ตัวเล่นเสียงและวิดีโอ ตัวอ่าน PDF ของเบราว์เซอร์ และส่วนต้นของไฟล์ข้อความและ CSV
(CSV เป็นตาราง ข้อความภาษาไทยจาก Excel อ่านเป็น Windows-874 ได้) ส่วน Word, Excel, PowerPoint และ zip แสดง icon
กับปุ่ม **ดาวน์โหลด** และไม่ถูกส่งไปให้บริการภายนอกเปิดดู

<Screenshot name="media-preview" alt="หน้าของไฟล์ CSV: แถวแรกๆ แสดงเป็นตาราง" />

## หลายไฟล์: แกลเลอรี {#several-files-galleries}

<Screenshot name="gallery" alt="field แกลเลอรี: รูปเรียงตามลำดับ พร้อมปุ่มเลื่อนและนำออก" />

`hasMany` ทำให้ upload field เก็บได้หลายไฟล์ เรียงตามที่ผู้แก้จัดไว้

```ts
{
  name: 'gallery',
  type: 'upload',
  hasMany: true,
  maxRows: 12, // และ minRows
  mimeTypes: ['image/*'], // เฉพาะรูป: ช่องเลือกแสดงเฉพาะรูป และตรวจซ้ำตอนบันทึก
}
```

ในหน้า admin ผู้แก้ลากหลายไฟล์มาวางพร้อมกันได้ เลือกจากคลังทีละหลายรูปได้ ลากเพื่อเรียงลำดับ (หรือใช้ปุ่มลูกศร)
และนำออกได้ การอ่านข้อมูลได้เอกสาร media ตามลำดับนั้น (ได้ id เมื่อใช้ `depth: 0`)

```vue
<ul class="gallery">
  <li v-for="image in post.gallery" :key="image.id">
    <img :src="image.sizes?.thumbnail?.url ?? image.url" :alt="image.alt" />
  </li>
</ul>
```

คำบรรยายของแต่ละรูปคือ alt ในคลังสื่อ ถ้าคำบรรยายเป็นของหน้านี้เท่านั้น ให้ใช้ `array` ที่มี `upload` กับ `text`
แทน ดูสูตร [แกลเลอรีรูปภาพ](./recipes/image-galleries)

`mimeTypes` ใช้กับ upload แบบไฟล์เดียวได้ด้วย เช่น รูปปกที่ต้องเป็นรูปภาพ หรือ `['application/pdf']` สำหรับโบรชัวร์

## โฟลเดอร์ {#folders}

<Screenshot name="media-folders" alt="คลังสื่อแบบมีโฟลเดอร์: ต้นไม้โฟลเดอร์ด้านซ้าย และไฟล์ในโฟลเดอร์ที่เปิดอยู่" />

เปิดใช้โฟลเดอร์เพื่อจัดระเบียบคลังสื่อ:

```ts
upload: { folders: true }
```

หน้า Media จะมีต้นไม้โฟลเดอร์ เส้นทางของโฟลเดอร์ และโฟลเดอร์ย่อยของโฟลเดอร์ที่เปิดอยู่เหนือรายการไฟล์
**โฟลเดอร์ใหม่** สร้างโฟลเดอร์ในโฟลเดอร์ที่เปิดอยู่ ไฟล์ที่อัปโหลดจะเข้าโฟลเดอร์นั้น ลากไฟล์ไปวางบนโฟลเดอร์
หรือเลือกหลายไฟล์แล้วกด **ย้ายไป…** เมนู **⋯** ของโฟลเดอร์ใช้เปลี่ยนชื่อ ย้าย หรือลบ การลบโฟลเดอร์ไม่ลบไฟล์ใด
ของข้างในจะย้ายขึ้นไปที่โฟลเดอร์แม่ การค้นหาจะค้นในโฟลเดอร์ที่เปิดอยู่และโฟลเดอร์ย่อย ตัวเลือกไฟล์ของ upload
field ก็เรียกดูโฟลเดอร์ได้ และเปิดที่โฟลเดอร์ล่าสุดที่ใช้

ไฟล์หนึ่งอยู่ได้โฟลเดอร์เดียว โฟลเดอร์เป็นข้อมูลใน collection `media-folders` (`name`, `parent`) ส่วนไฟล์มี
`folder` URL ของไฟล์ไม่เปลี่ยนเมื่อย้าย ผ่าน REST:

```http
GET /api/cms/media?where[folder][equals]=4        ไฟล์ในโฟลเดอร์ 4
GET /api/cms/media?where[folder][exists]=false    ไฟล์ที่ชั้นนอกสุด
POST /api/cms/media-folders  { "name": "แบนเนอร์", "parent": 4 }
```

การอัปโหลดรับ `folder` ด้วย (เป็นช่องในฟอร์ม หรือใส่ใน JSON คู่กับ `url`) ชื่อโฟลเดอร์ต้องไม่ซ้ำกันในโฟลเดอร์เดียวกัน
โดยไม่สนตัวพิมพ์เล็กใหญ่ โฟลเดอร์ใช้[สิทธิ์ Media ของบทบาท](./roles) และเห็นได้เฉพาะผู้ที่ล็อกอิน

### ใครใช้โฟลเดอร์ได้บ้าง {#who-can-use-a-folder}

เมื่อเปิด[บทบาท](./roles) (`auth.rbac`) admin เลือกได้ว่าใครใช้แต่ละโฟลเดอร์ได้ จากเมนูของโฟลเดอร์ **ใครใช้ได้บ้าง**
โฟลเดอร์จะใช้ตามโฟลเดอร์ที่อยู่ จนกว่าจะตั้งรายการของตัวเอง เมื่อตั้งแล้ว แต่ละบทบาทได้ระดับใดระดับหนึ่ง:

| | |
|---|---|
| **ดู** | เห็นโฟลเดอร์และไฟล์ข้างใน และเลือกไปใช้ในเนื้อหาได้ |
| **แก้ไข** | อัปโหลด เปลี่ยนชื่อ ย้าย และลบไฟล์ในโฟลเดอร์ได้ด้วย |
| **จัดการ** | สร้าง เปลี่ยนชื่อ ย้าย และลบโฟลเดอร์ย่อยได้ด้วย |

บทบาทที่ไม่อยู่ในรายการจะไม่เห็นโฟลเดอร์นั้น ชั้นนอกสุดเปิดให้ทุกบทบาทที่ใช้ Media ได้

<Screenshot name="media-folder-permissions" alt="ใครใช้โฟลเดอร์ได้บ้าง: ระดับสิทธิ์ของแต่ละบทบาท" />

- โฟลเดอร์ทำได้แค่จำกัดสิ่งที่บทบาททำกับ Media ได้ใน Settings → Roles ให้แคบลง บทบาทที่ไม่มีสิทธิ์ลบ Media
  ลบไฟล์ไม่ได้ในทุกโฟลเดอร์
- admin ทำได้ทุกอย่าง และมีแต่ admin ที่ตั้งได้ว่าใครใช้โฟลเดอร์ได้ การเปลี่ยนจะอยู่ใน[audit log](./audit-log)
  เป็น **เปลี่ยนสิทธิ์โฟลเดอร์**
- API key ใช้สิทธิ์ Media ของตัวเอง โฟลเดอร์ไม่จำกัด API key เว้นแต่ key นั้น[จำกัดไว้เฉพาะบางโฟลเดอร์](./api-keys#what-a-key-may-do)
- บทความเก็บไฟล์จากโฟลเดอร์ที่ผู้แก้มองไม่เห็นได้ ช่องนั้นจะแสดงว่า "ไฟล์ที่ไม่มีสิทธิ์ดู" และไฟล์ยังอยู่จนกว่าจะเปลี่ยนหรือนำออก

::: warning ใช้แบ่งงานของทีม
ไฟล์ในโฟลเดอร์อื่นยังเป็นสาธารณะ คนที่มีลิงก์ของไฟล์เปิดได้ และคำขอที่ไม่ได้ล็อกอินยังเห็นรายการไฟล์เหมือนเดิม
ไฟล์ที่ต้องเป็นความลับให้ใช้โฟลเดอร์ส่วนตัว
:::

### โฟลเดอร์ส่วนตัว {#private-folders}

admin ติ๊ก **ส่วนตัว** ใน **ใครใช้ได้บ้าง** ของโฟลเดอร์ ไฟล์และโฟลเดอร์ย่อยข้างในจะเป็นส่วนตัว เก็บแยกจากไฟล์สาธารณะ
และเสิร์ฟผ่าน API ที่ `/api/cms/media/private/<name>` เท่านั้น:

- ให้ผู้ที่ล็อกอินและมีสิทธิ์ดูโฟลเดอร์นั้น (ตามบทบาทและสิทธิ์ของโฟลเดอร์)
- ให้ทุกคนที่มี **ลิงก์ที่เซ็น** จากโค้ดของคุณ จนกว่าลิงก์จะหมดอายุ

คำขอที่ไม่ได้ล็อกอินจะไม่เห็นไฟล์ส่วนตัวในรายการ และรูปปกที่เป็นไฟล์ส่วนตัวจะไม่ถูกส่งให้ผู้เยี่ยมชม การย้ายไฟล์เข้าหรือออก
จากโฟลเดอร์ส่วนตัว (หรือเปลี่ยนโฟลเดอร์ให้เป็นส่วนตัวหรือสาธารณะ) จะย้ายไฟล์ไปอีกที่เก็บและได้ URL ใหม่ admin จะถามก่อน
พร้อมบอกว่ามีกี่เอกสารที่ใช้ไฟล์นั้น

```ts
// ลิงก์ดาวน์โหลดให้สมาชิก ใช้ได้ 1 ชั่วโมง (ค่าเริ่มต้น สูงสุด 7 วัน)
const link = cms.signedMediaURL(report, { expiresIn: '1h' })
// รูปย่อ:
cms.signedMediaURL(photo, { expiresIn: '30m', size: 'thumbnail' })
```

ลิงก์ใช้ไม่ได้เมื่อหมดอายุ เมื่อเปลี่ยน `secret` หรือเมื่อไฟล์ไม่เป็นส่วนตัวแล้ว ไฟล์สาธารณะได้ URL ปกติของมัน

**ไฟล์ส่วนตัวเก็บที่ไหน** บนดิสก์ในเครื่องและ Netlify Blobs ซึ่งไม่เสิร์ฟอะไรเป็นสาธารณะ เก็บรวมกับไฟล์อื่นได้ ส่วน storage ที่มี
URL สาธารณะ (S3 ที่ตั้ง `publicURL`, Vercel Blob แบบ public) ต้องตั้ง `upload.privateStorage` ก่อนจึงทำโฟลเดอร์ส่วนตัวได้:

```ts
upload: {
  folders: true,
  storage: vercelBlobStorage(),
  privateStorage: vercelBlobStorage({ access: 'private', prefix: 'private/' }),
}
```

<Screenshot name="media-folder-permissions" alt="สิทธิ์ของโฟลเดอร์: ส่วนตัว และระดับสิทธิ์ของแต่ละบทบาท" />

### upload field ที่ระบุโฟลเดอร์ {#upload-fields-with-a-folder}

ชี้ upload field ไปที่โฟลเดอร์ด้วย key ตัวเลือกไฟล์จะเปิดที่นั่น และไฟล์ที่อัปโหลดจากช่องนี้จะเข้าโฟลเดอร์นั้น ถ้ายังไม่มี
โฟลเดอร์ ระบบสร้างให้ที่ชั้นนอกสุดเมื่อใช้ครั้งแรก เปลี่ยนชื่อหรือย้ายโฟลเดอร์ใน admin ได้โดย key ไม่เปลี่ยน

```ts
{ name: 'banner', type: 'upload', folder: 'banners' }
// เลือกได้เฉพาะไฟล์ในโฟลเดอร์นั้น (และโฟลเดอร์ย่อย) ตรวจตอนบันทึก:
{ name: 'logo', type: 'upload', folder: 'brand', folderOnly: true }
```

การเปิดโฟลเดอร์จะเพิ่มตาราง `media-folders` และคอลัมน์ `folder` กับ `private` ของ media:

```sh
npx easy-cms migrate:create media-folders
```

## การอัปโหลดจากโค้ด {#uploading-from-code}

```ts
const media = await cms.upload({ data: bytes, name: 'photo.jpg' }, { alt: 'A photo' })
media.url // "/api/cms/media/file/photo-3f9a2c1b.jpg"
```

ผ่าน REST: `POST /api/cms/media` ด้วย `multipart/form-data` โดยใส่ไฟล์ใน `file` และ field อื่น
(เช่น `alt`) เป็น text part

## จากลิงก์ {#from-a-link}

กำลังย้ายเนื้อหาจากเว็บอื่นอยู่ใช่ไหม ให้ server ดาวน์โหลดไฟล์จากลิงก์แทนได้:

```ts
upload: {
  fromURL: {
    // host ที่ดึงไฟล์ได้: ชื่อตรงตัว, `*.example.com` สำหรับ subdomain หรือ `*` สำหรับทุก host
    allowedHosts: ['images.oldsite.com', '*.cdn.example.com'],
  },
},
```

คลังสื่อ ตัวเลือกสื่อ และแกลเลอรีจะมีช่อง **จากลิงก์** ผู้แก้ไขยังวางลิงก์ (หรือหลายลิงก์ บรรทัดละลิงก์) ลงใน
พื้นที่อัปโหลด หรือลากรูปจากหน้าเว็บอื่นมาวางได้ด้วย ในโค้ด:

```ts
const media = await cms.uploadFromURL('https://images.oldsite.com/2024/beach.jpg', { alt: 'The beach' })
```

ผ่าน REST: `POST /api/cms/media` ด้วย JSON `{ "url": "https://…", "alt": "…" }`

จากนั้นไฟล์ถูกตรวจเหมือนการอัปโหลดทั่วไป: ชนิดไฟล์จากเนื้อไฟล์ `maxFileSize` และสิทธิ์สร้าง media ชื่อไฟล์มาจาก
`Content-Disposition` ของ server ปลายทาง ถ้าไม่มีใช้จากลิงก์

::: warning ลิงก์เข้าถึงเครือข่ายของคุณได้
server เป็นผู้ส่ง request จากภายในเครือข่ายของคุณ เพื่อไม่ให้ลิงก์เข้าถึงสิ่งที่ไม่ได้เปิดสาธารณะ server จะปฏิเสธ:

- scheme อื่นนอกจาก `http` และ `https` และลิงก์ที่มีรหัสผ่าน
- ที่อยู่ในเครือข่ายภายใน: `localhost`, `10.x`, `172.16–31.x`, `192.168.x`, link-local (`169.254.x`
  ที่ cloud ใช้ให้ข้อมูล metadata) รวมถึงของ IPv6 ชื่อ host ตรวจหลัง resolve DNS และตรวจซ้ำทุกครั้งที่
  redirect (ไม่เกินสามครั้ง)
- host ที่ไม่อยู่ใน `allowedHosts` รวมถึงหลัง redirect
- การดาวน์โหลดที่นานเกิน 15 วินาทีหรือใหญ่กว่า `maxFileSize`

`allowPrivate: true` ยกเลิกกฎเรื่องที่อยู่ภายใน เช่น สำหรับ server เก็บรูปในอินทราเน็ต ตั้งเฉพาะเมื่อทุกคนที่อัปโหลด
ได้มีสิทธิ์เข้าถึงเครือข่ายภายในของคุณอยู่แล้ว
:::

`cms.uploadFromURL()` ที่ไม่มี user คือโค้ดของคุณเอง (เช่น script ย้ายข้อมูล) จึงไม่ต้องตั้ง `upload.fromURL`
และไม่สน `allowedHosts` แต่ยังปฏิเสธที่อยู่ภายในเว้นแต่ตั้ง `allowPrivate` ถ้าเรียกพร้อม `user` และ
`overrideAccess: false` แบบที่ REST API ทำ ต้องผ่านทั้งสองข้อ

## ชนิดไฟล์ {#file-types}

Easy CMS รู้จักไฟล์เหล่านี้จากเนื้อหา:

| | ชนิด |
|---|---|
| รูป | JPEG, PNG, GIF, WebP, AVIF, SVG |
| เอกสาร | PDF; Word, Excel, PowerPoint (`docx`, `xlsx`, `pptx`); OpenDocument (`odt`, `ods`, `odp`); CSV; ข้อความ |
| เสียง | MP3, WAV, Ogg, M4A |
| วิดีโอ | MP4, WebM, MOV |
| ไฟล์บีบอัด | zip |

ไฟล์ Office แบบเก่า (`doc`, `xls`, `ppt`) ยังไม่รองรับ อนุญาตชนิดที่ต้องการด้วย MIME type, `type/*` หรือชื่อกลุ่ม:

```ts
upload: {
  // documents: PDF, Word, Excel, PowerPoint, OpenDocument, CSV และข้อความ
  // office: docx, xlsx, pptx · archives: zip
  mimeTypes: ['image/*', 'documents', 'audio/*', 'video/*'],
}
```

`mimeTypes` ของ upload field ใช้ชื่อเดียวกันได้ เช่น `{ type: 'upload', mimeTypes: ['office'] }`

**`image/*` ไม่รวม SVG** เพราะ SVG ฝังสคริปต์ได้ จึงต้องระบุชื่อเองถ้าจะอนุญาต: `mimeTypes: ['image/*', 'image/svg+xml']`
ทำเฉพาะเมื่อไว้ใจคนที่อัปโหลด และดู[ส่วนของ S3](#s3-cloudflare-r2-and-minio) เมื่อเสิร์ฟไฟล์จาก bucket หรือ CDN

### ไฟล์ใหญ่ {#large-files}

โฮสต์จำกัดขนาดของแต่ละ request: ราว 4.5 MB บน Vercel และ 6 MB บน Netlify เมื่อใช้ S3 (R2, MinIO) หรือ Vercel Blob
admin จะส่งไฟล์ที่ใหญ่กว่า 4 MB จาก browser ตรงไปที่ storage จึงจำกัดด้วย `upload.maxFileSize` อย่างเดียว:

1. `POST /api/cms/media/uploads` พร้อม `{ "name", "size", "type", ...fields }` ตรวจว่าใครอัปอะไรไปที่ไหนเหมือนการอัปโหลดปกติ
   แล้วคืน `ticket` ที่เซ็นไว้ และที่ส่งไฟล์ `upload: { url, method, headers }` (ใช้ได้ 15 นาที) หรือ `upload: null` เมื่อ
   storage รับไฟล์ตรงไม่ได้ (ให้ส่งที่ `POST /api/cms/media` แทน)
2. browser ส่งไฟล์ไปที่นั่น
3. `POST /api/cms/media/uploads/complete` พร้อม `{ "ticket" }` ตรวจไฟล์ใน storage ทั้งขนาดและชนิดจากเนื้อหา แล้วสร้าง
   เอกสาร media ไฟล์ที่ไม่ผ่านจะถูกลบ

จากโค้ด: `cms.createUpload({ name, size }, fields, options)` และ `cms.completeUpload(ticket)`

- **S3, R2, MinIO:** bucket ต้องตั้ง CORS ให้ origin ของ admin ใช้ `PUT` พร้อม header `content-type` ได้
- **Vercel Blob:** ไม่ต้องตั้งอะไร
- **Netlify Blobs และดิสก์ในเครื่อง** รับไฟล์ผ่าน server บน Netlify ได้ราว 6 MB

ไฟล์ที่ส่งแล้วแต่ไม่ได้ complete (ปิดหน้าไประหว่างนั้น) จะค้างอยู่ใน storage โดยไม่มีที่ไหนลิงก์ถึง บน S3 ตั้ง lifecycle rule ลบได้

## สิ่งที่เกิดขึ้นกับไฟล์ {#what-happens-to-a-file}

- **ตรวจสอบประเภทไฟล์จากเนื้อหา** ไม่ใช่จากชื่อไฟล์หรือ Content-Type ที่ client ส่งมา ประเภทต้อง
  ตรงกับ `upload.mimeTypes` (ค่าเริ่มต้น `image/*`, `application/pdf`) มีแค่ CSV ที่แยกจากข้อความธรรมดาด้วยชื่อไฟล์
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
แบบ sandbox ทำให้ SVG ที่อัปโหลดมาไม่สามารถรันสคริปต์ได้ ส่วน PDF เสิร์ฟโดยไม่มี sandbox เพราะเบราว์เซอร์ไม่แสดง PDF
ใน sandbox และตัวอ่าน PDF ของเบราว์เซอร์ทำงานแยกจากเว็บของคุณ ตั้งค่า `serverURL` เพื่อให้ได้ URL แบบเต็ม

การจัดเก็บเริ่มต้นคือดิสก์ในเครื่อง (`upload.dir` ค่าเริ่มต้น `uploads/`) ซึ่งต้องใช้ filesystem
ที่คงอยู่ถาวร บนโฮสต์แบบ serverless (Vercel, Netlify) และใน container ที่ไม่มี volume ให้ใช้ S3

## S3, Cloudflare R2 และ MinIO {#s3-cloudflare-r2-and-minio}

```bash [pm]
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
| `publicURL` | ไม่มี | เสิร์ฟไฟล์จากที่นี่ (CDN หรือ public bucket) แทนการเสิร์ฟผ่าน API |
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

**Private bucket (ค่าเริ่มต้น)** หากไม่มี `publicURL` ไฟล์จะถูก stream ผ่าน
`/api/cms/media/file/<name>` พร้อม header สำหรับ caching และ sandbox แบบเดียวกับการจัดเก็บในเครื่อง
bucket จึงยังคงเป็น private วาง CDN ไว้หน้าเว็บไซต์เพื่อไม่ต้องดึงไฟล์จาก S3 ทุกครั้งที่มี
request

**Public bucket** เมื่อมี `publicURL` URL ของ media จะชี้ไปที่ bucket หรือ CDN โดยตรง และ server
ของคุณไม่เกี่ยวข้อง ให้เสิร์ฟจาก **โดเมนที่ต่างจาก** เว็บไซต์ของคุณ เพราะ Content Security Policy
แบบ sandbox ไม่ได้ถูกใช้ที่นั่น มิฉะนั้น SVG ที่อัปโหลดมาอาจรันสคริปต์ภายใต้ origin
ของเว็บไซต์คุณได้

## Vercel Blob {#vercel-blob}

บน Vercel ซึ่งดิสก์ไม่เก็บไฟล์ถาวร ให้เชื่อม Blob store กับโปรเจกต์ (Storage → Blob) ระบบจะตั้ง `BLOB_READ_WRITE_TOKEN` ให้

```ts
import { vercelBlobStorage } from '@easy-cms/storage-vercel-blob'

upload: { storage: vercelBlobStorage() }, // ไฟล์สาธารณะบน CDN ของ Blob
```

`vercelBlobStorage({ access: 'private', prefix: 'backups/' })` เก็บไฟล์แบบส่วนตัว (เสิร์ฟผ่าน API) เช่น สำหรับ
`backups.storage`

## Netlify Blobs {#netlify-blobs}

บน Netlify ใช้ Blobs ได้โดยไม่ต้องตั้งค่า:

```ts
import { netlifyBlobsStorage } from '@easy-cms/storage-netlify-blobs'

upload: { storage: netlifyBlobsStorage() }, // เสิร์ฟผ่าน <api>/media/file/…
```

นอก runtime ของ Netlify (สคริปต์ หรือ host อื่น) ให้ส่ง `siteID` และ personal access `token`

## การจัดเก็บแบบกำหนดเอง {#custom-storage}

implement `StorageAdapter` (`put`, `get`, `delete` และ `url` กับ `init` ที่ไม่บังคับ) แล้วส่งเป็น
`upload.storage` สำหรับ[ไฟล์ใหญ่](#large-files)ที่ส่งตรงจาก browser ให้เพิ่ม `uploadURL(key, { contentType, size, expiresIn })` (ส่งไฟล์ไปที่ไหน
อย่างไร) และ `getStart(key, bytes)` (ส่วนต้นของไฟล์และขนาด โดยไม่ต้องอ่านทั้งไฟล์)

## ขั้นต่อไป {#next-steps}

- [Rich text](./rich-text): รูปใน rich text
- [Backup และการอัปเกรด](./backups): สำรองไฟล์ที่อัปโหลด
