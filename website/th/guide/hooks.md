# Hooks {#hooks}

hook รันโค้ดของคุณ ณ จุดต่าง ๆ ในวงจรชีวิตของเอกสาร โดยทำงานเหมือนกันทั้งกับ Local API, REST API และ
หน้า admin

```ts
{
  slug: 'posts',
  hooks: {
    beforeChange: [
      ({ data }) => ({ ...data, readingTime: Math.ceil(countWords(data.body) / 200) }),
    ],
    afterChange: [
      async ({ doc, operation }) => {
        await fetch('https://example.com/revalidate', { method: 'POST', body: JSON.stringify({ slug: doc.slug }) })
      },
    ],
  },
  fields: [/* … */],
}
```

## Hook ของ collection {#collection-hooks}

| Hook | อาร์กิวเมนต์ | ค่าที่คืน |
|---|---|---|
| `beforeValidate` | `data`, `operation`, `originalDoc?` | data ใหม่ หรือไม่คืนค่า |
| `beforeChange` | `data` (ผ่านการตรวจสอบแล้ว), `operation`, `originalDoc?` | data ใหม่ หรือไม่คืนค่า |
| `afterChange` | `doc`, `operation`, `previousDoc?` | — |
| `beforeDelete` | `id` | — |
| `afterDelete` | `id`, `doc` | — |
| `afterRead` | `doc` | doc ใหม่ หรือไม่คืนค่า |

ทุก hook ยังได้รับ `user` (หรือ `null`), `cms` (Local API) และ `slug` ด้วย

global รองรับ `beforeChange`, `afterChange` และ `afterRead`

## ลำดับและข้อผิดพลาด {#order-and-errors}

`beforeValidate` → การตรวจสอบ → `beforeChange` → บันทึก → `afterChange`

- hook แบบ **before** ที่ throw จะยกเลิกการดำเนินการ และ error จะส่งถึงผู้เรียก
- hook แบบ **after** ที่ throw จะถูกบันทึกลง log และการเปลี่ยนแปลงยังคงถูกบันทึกไว้
- `afterRead` ทำงานกับทุกเอกสารที่ส่งคืน รวมถึงเอกสารที่ถูก populate ก่อนที่ field ที่ hidden และ
  field ที่อ่านไม่ได้จะถูกตัดออก
- hook ใน array ทำงานทีละตัวตามลำดับ แต่ละตัวเห็นผลลัพธ์ของตัวก่อนหน้า

hook ทำงานนอก transaction ของฐานข้อมูล
