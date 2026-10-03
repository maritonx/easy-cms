# แกลเลอรีรูปภาพ {#image-galleries}

::: info สิ่งที่จะสร้าง
แกลเลอรีรูปในแต่ละบทความ เรียงตามที่ผู้แก้เลือก และแสดงเป็นตารางในหน้าเว็บ
**ใช้:** [การอัปโหลด](../uploads#several-files-galleries), [array](../fields#array-and-group)
:::

## 1. เลือก field {#1-choose-the-field}

เก็บหลายรูปในเอกสารได้สองแบบ

| | `upload` แบบ `hasMany` | `array` ที่มี `upload` |
|---|---|---|
| ผู้แก้ | ลากวางหรือเลือกหลายไฟล์พร้อมกัน ลากเพื่อเรียงลำดับ | เพิ่มแถว แล้วเลือกรูปของแถวนั้น |
| คำบรรยาย | alt ของรูปในคลังสื่อ | ข้อความของแถวนั้น ใช้เฉพาะหน้านี้ |
| เหมาะกับ | แกลเลอรีรูป รูปสินค้า โลโก้ | แกลเลอรีที่แต่ละรูปต้องมีคำบรรยายหรือลิงก์ของตัวเอง |

แกลเลอรีส่วนใหญ่ใช้แบบแรก

```ts
{
  name: 'gallery',
  type: 'upload',
  hasMany: true,
  maxRows: 12,
  mimeTypes: ['image/*'],
  label: { en: 'Gallery', th: 'แกลเลอรี' },
}
```

ถ้าคำบรรยายเป็นของหน้านั้น ให้ใช้ array

```ts
{
  name: 'gallery',
  type: 'array',
  maxRows: 12,
  fields: [
    { name: 'image', type: 'upload', required: true, mimeTypes: ['image/*'] },
    { name: 'caption', type: 'text', localized: true },
  ],
}
```

สร้าง migration สำหรับ field ใหม่ (`easy-cms migrate:create gallery`)

## 2. แสดงผล {#2-show-it}

การอ่านข้อมูลจะดึงรูปมาให้ (`depth` 1 ซึ่งเป็นค่าเริ่มต้น) พร้อมรูปย่อจาก [ขนาดรูป](../uploads#what-happens-to-a-file)

::: code-group

```vue [Nuxt: app/pages/posts/[slug].vue]
<ul v-if="post.gallery.length" class="gallery">
  <li v-for="image in post.gallery" :key="image.id">
    <a :href="image.url">
      <img :src="image.sizes?.thumbnail?.url ?? image.url" :alt="image.alt ?? ''" loading="lazy" />
    </a>
  </li>
</ul>
```

```tsx [Next.js]
{post.gallery.length > 0 && (
  <ul className="gallery">
    {post.gallery.map((image) =>
      typeof image === 'object' ? (
        <li key={image.id}>
          <a href={image.url}>
            <img src={image.sizes?.thumbnail?.url ?? image.url} alt={image.alt ?? ''} loading="lazy" />
          </a>
        </li>
      ) : null,
    )}
  </ul>
)}
```

```css [CSS]
.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
  gap: 0.5rem;
  padding: 0;
  list-style: none;
}
.gallery img {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
}
```

:::

ถ้าใช้ array แต่ละแถวคือ `{ image, caption }` ใช้ `row.image.url` และ `row.caption`

## 3. ตรวจสอบ {#3-check-it}

- ลากรูปสามรูปลงแกลเลอรี ลากรูปสุดท้ายไปไว้แรกสุด แล้วเผยแพร่ หน้าเว็บจะแสดงตามลำดับนั้น
- ลองใส่ PDF: ช่องเลือกจะไม่แสดง และ API จะปฏิเสธด้วย "must be an image"
- บล็อกตัวอย่างใน repo มีแกลเลอรีในทุกบทความ
