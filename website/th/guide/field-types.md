# ชนิด field เพิ่มเติม {#custom-field-types}

::: info สิ่งที่จะได้เรียนรู้
ใช้ชนิด field จากแพ็กเกจ เช่น `color` จาก `@easy-cms/fields` และเขียนชนิดของตัวเอง: `type` ที่มีการตรวจค่า
ช่องกรอกใน admin และการแสดงผลในหน้ารายการเป็นของตัวเอง

**อ่านก่อนหน้านี้:** [Fields](./fields) ส่วน admin ดู [Admin components](./plugins#admin-components)
:::

<Screenshot name="drawer" alt="หมวดหมู่ในแผงที่เปิดทับหน้ารายการ มีตัวเลือกสีพร้อมสีแนะนำ และจุดสีในหน้ารายการ" />

Easy CMS มี[ชนิด field ในตัว](/th/reference/fields#types)ที่ครอบคลุมเนื้อหาส่วนใหญ่ แพ็กเกจเพิ่มชนิดอื่นได้ เช่น สี
คะแนนดาว หรือเบอร์โทรศัพท์ แต่ละชนิดเก็บข้อมูลแบบเดียวกับชนิดในตัวที่เป็น **ฐาน (base)** ของมัน การค้นหา
REST API การแปลภาษา และ migration จึงทำงานเหมือนชนิดฐานนั้นทุกอย่าง สิ่งที่เพิ่มมาคือ **การตรวจค่า**
**ช่องกรอก**ใน admin และ **ช่องแสดงผล (cell)** ในหน้ารายการ

## สี: `@easy-cms/fields` {#colors-easy-cms-fields}

```bash [pm]
npm install @easy-cms/fields
```

ใส่ชนิดไว้ใน `fieldTypes` แล้วใช้เหมือนชนิดอื่น:

```ts
import { color } from '@easy-cms/fields'

export default defineConfig({
  // …
  fieldTypes: [color],
  collections: [
    {
      slug: 'categories',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'color', type: 'color', presets: ['#2f6f5e', '#e8a33d', '#2563eb'] },
      ],
    },
  ],
})
```

| ตัวเลือก | ชนิด | |
|---|---|---|
| `presets` | `string[]` | สีที่แสดงให้เลือกได้ทันที เช่น สีของแบรนด์ |
| `alpha` | `boolean` | ให้มีความโปร่งใส: รับ `#rrggbbaa` นอกจาก `#rrggbb` ค่าเริ่มต้น `false` |

ค่าเป็นข้อความเช่น `#2f6f5e` (เก็บเป็น text) ค่าอื่นจะถูกปฏิเสธด้วยข้อความ
"must be a color like #2f6f5e" ใน admin ผู้แก้ไขเลือกสีจากตัวเลือกสี พิมพ์รหัสสี หรือคลิกสีแนะนำได้
หน้ารายการแสดงจุดสีคู่กับรหัสสีเป็นคอลัมน์ที่เปิดไว้ตั้งแต่แรก

ฐานข้อมูลที่มีอยู่แล้วต้องเพิ่มคอลัมน์เหมือน field ใหม่ทั่วไป:

```bash [pm]
npx easy-cms migrate:create category_color
```

## TypeScript {#typescript}

เมื่อ import แพ็กเกจ TypeScript จะรู้จักชนิดใหม่: ใช้ `type: 'color'` ใน `fields` ได้ ตัวเลือกของมันถูกตรวจ
และเอกสารมี `color?: string | null` คำสั่ง `easy-cms generate:types` ก็เขียนเป็น `string` เช่นกัน

## เขียนชนิด field เอง {#writing-a-field-type}

ชนิด field เป็น object ธรรมดา `defineFieldType` ตรวจให้ตรงกับ `FieldTypeDefinition`:

```ts
// rating.ts
import { defineFieldType } from '@easy-cms/core'

export const rating = defineFieldType({
  name: 'rating',
  // เก็บ ค้นหา และเรียงลำดับแบบตัวเลข
  base: 'number',
  // ไม่ถูกเรียกกับค่าว่าง: `required` ดูแลส่วนนั้น
  validate: (value, { field }) =>
    (Number.isInteger(value) && Number(value) >= 1 && Number(value) <= Number(field.max ?? 5)) ||
    'must be 1 to 5 stars',
  // ตัวเลือกของ field ที่ผิด จะเจอตอนโหลด config
  checkOptions: (field) =>
    field.max === undefined || Number.isInteger(field.max) ? undefined : 'max must be a whole number',
  admin: {
    component: 'ecms-stars',            // ช่องกรอก
    cell: 'ecms-stars-cell',            // ในหน้ารายการ
    module: '@acme/easy-cms-rating/admin',
    props: ['max'],                     // ตัวเลือกของ field ที่ส่งให้ component เป็น `options`
  },
  typescript: '1 | 2 | 3 | 4 | 5',      // สำหรับ generate:types
})
```

| ตัวเลือก | | |
|---|---|---|
| `name` | **จำเป็น** | `type` ที่ field ใช้: ตัวอักษรพิมพ์เล็กและตัวเลข ขึ้นต้นด้วยตัวอักษร (`rating`, `phoneNumber`) ห้ามซ้ำกับชนิดในตัว |
| `base` | **จำเป็น** | วิธีเก็บข้อมูล: `text`, `textarea`, `email`, `number`, `boolean`, `date` หรือ `json` |
| `validate` | | `(value, { field, data, operation, … }) => true \| string` เป็น async ได้ `field` มีตัวเลือกของ field นั้น `validate` ของ field เองทำงานต่อจากนี้ |
| `checkOptions` | | `(field) => string \| undefined` ถ้าคืนข้อความ config จะไม่ผ่าน |
| `admin.component` | | ช่องกรอก: Web Component (tag ขึ้นต้นด้วย `ecms-`) ถ้าไม่มีจะใช้ช่องกรอกของชนิดฐาน |
| `admin.cell` | | แสดงค่าในหน้ารายการ ถ้าไม่มีจะแสดงเป็นข้อความ |
| `admin.module` | | [admin module](./plugins#the-module) ที่ประกาศ component เหล่านี้ ระบบเพิ่มเข้า `admin.modules` ให้เอง |
| `admin.props` | | ตัวเลือกของ field ที่ส่งให้ component เป็น `options` |
| `typescript` | | ชนิดของค่าสำหรับ `generate:types` ค่าเริ่มต้นเป็นของชนิดฐาน |

component ทำตามข้อตกลงของ [admin component](./plugins#what-the-element-receives): ช่องกรอกได้รับ
`value`, `options`, `readOnly`, `label` และ `uiLocale` แล้วส่ง
`new CustomEvent('change', { detail: value })` ส่วน cell ได้รับค่าเดียวกันแบบอ่านอย่างเดียว

field ที่ตั้ง `admin.component` เองจะใช้ของตัวเอง โปรเจกต์จึงเปลี่ยนช่องกรอกของ field ใด field หนึ่งได้

### ชนิด TypeScript สำหรับแพ็กเกจของคุณ {#types-for-your-package}

บอก TypeScript ให้รู้จักชนิดใหม่โดยเพิ่มเข้า `CustomFieldTypes` พร้อมชนิดของค่าและตัวเลือก:

```ts
declare module '@easy-cms/core' {
  interface CustomFieldTypes {
    rating: { value: 1 | 2 | 3 | 4 | 5; options: { readonly max?: number } }
  }
}
```

วางไว้คู่กับ `defineFieldType` ในไฟล์หลักของแพ็กเกจ เพื่อให้มีผลทุกที่ที่ import แพ็กเกจ

### กติกา {#rules}

- ชื่อถูกตรวจตอนโหลด config: ชื่อของชนิดในตัว (`text`, `select`…) หรือชนิดที่ใส่ซ้ำสองครั้งถือเป็นข้อผิดพลาด
  และ field ที่ `type` ไม่มีชนิดใดรองรับก็เช่นกัน
- ชนิดเพิ่มพฤติกรรม ไม่ได้เปลี่ยนการเก็บข้อมูล: เปลี่ยน field จาก `text` เป็น `color` ไม่ต้องมี migration
  และถ้าเอาแพ็กเกจออก ค่าจะยังอยู่เป็นข้อความ
- admin module ต้องไม่มีการ import เช่นเดียวกับ [admin module](./plugins#the-module) ทั่วไป

## ขั้นต่อไป {#next-steps}

- [Admin components](./plugins#admin-components): รายละเอียดของ element
- [Fields](./fields): ชนิดในตัว
