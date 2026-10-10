# อ้างอิง field {#field-reference}

ตัวเลือกทั้งหมดของ field มีเทสต์ตรวจกับ type ใน `@easy-cms/core` หน้าตาในหน้า admin และวิธีจัดเก็บดูได้ที่
[Fields](/th/guide/fields)

<!-- api: BaseField -->
## ตัวเลือกของทุก field {#options-of-every-field}

| ตัวเลือก | Type | |
|---|---|---|
| `name` | `string` | **จำเป็น** เป็นชื่อตัวแปรของ JavaScript และไม่ซ้ำกับ field ข้างเคียง |
| `type` | ดู[ประเภท](#types) | **จำเป็น** |
| `label` | `string \| { en, th }` | ค่าเริ่มต้นคือชื่อ field ที่แปลงให้อ่านง่าย |
| `required` | `boolean` | ต้องมีค่า (ไม่ตรวจตอนบันทึกฉบับร่าง) |
| `unique` | `boolean` | เอกสารสองรายการใช้ค่าซ้ำกันไม่ได้ เฉพาะ field ระดับบนสุด (ใน group, array หรือ block จะไม่มีผล และมีคำเตือน) |
| `uniqueWithin` | `string \| string[]` | ใช้กับ `unique` หรือ slug: field ข้างเคียง (เช่น `parent`, `tenant`) ค่าห้ามซ้ำเฉพาะเอกสารที่มีค่าใน field เหล่านั้นเหมือนกัน |
| `index` | `boolean` | สร้าง index ในฐานข้อมูล |
| `defaultValue` | ค่าของ field | ใช้เมื่อสร้างเอกสารโดยไม่มีค่านี้ |
| `validate` | `(value, { data, operation }) => true \| string` | ตรวจเอง เป็น async ได้ |
| `access` | `{ read?, create?, update? }` | [สิทธิ์](/th/guide/access-control#field-access)ระดับ field `create` คือใครตั้งค่าได้ตอนสร้างเอกสาร ค่าเริ่มต้นตาม `update` |
| `hidden` | `boolean` | ถูกจัดเก็บ แต่ไม่ถูกส่งคืนและไม่รับเป็น input |
| `localized` | `boolean` | เก็บค่าแยกตามภาษา (ต้องมี `localization`) |
| `admin` | `FieldAdmin` | admin components ดู[ด้านล่าง](#admin) |
| `customType` | `string` | Easy CMS ตั้งให้เองกับ field ของ[ชนิดที่เพิ่มเข้ามา](/th/guide/field-types) (เช่น `color`) ไม่ต้องตั้งเอง |

<!-- api: FieldAdmin -->
### admin {#admin}

| ตัวเลือก | Type | |
|---|---|---|
| `component` | `AdminComponent` | Web Component แทนช่องกรอก [Admin components](/th/guide/plugins#admin-components) |
| `after` | `AdminComponent[]` | component ที่แสดงใต้ field |
| `cell` | `AdminComponent` | แสดงค่าในคอลัมน์ของหน้ารายการ เช่น จุดสี |
| `description` | `Label` | คำอธิบายใต้ field |
| `width` | `'1/4' \| '1/3' \| '1/2' \| '2/3' \| '3/4' \| 'full'` | สัดส่วนในแถว (`admin.layout`) ค่าเริ่มต้น: แบ่งเท่ากัน |
| `condition` | `FieldCondition` | แสดงเฉพาะเมื่อ field ข้างเคียงตรงเงื่อนไข เช่น `{ field: 'linkType', equals: 'external' }` มี `not_equals`, `in`, `not_in`, `exists`, `and`, `or`, `not` ด้วย field ที่ถูกซ่อนไม่ถูกบังคับกรอก [ระบบจัดการ](/th/guide/admin#conditions) |
| `column` | `boolean \| ({ user, context }) => boolean` | แสดงเป็นคอลัมน์ของหน้ารายการตั้งแต่แรก (ผู้ใช้เปลี่ยนเองได้) |
| `allowCreate` | `boolean` | relationship: ให้สร้างเอกสารที่เชื่อมได้ทันที ค่าเริ่มต้น `true` |
| `initialValue` | `({ user, context }) => unknown` | ค่าเริ่มต้นของฟอร์มเอกสารใหม่ต่อผู้ใช้ เช่น จาก context ของ request ส่วน `defaultValue` ของ field ยังใช้ฝั่ง server ตามเดิม |
| `position` | `'sidebar'` | แสดงในแถบข้างของหน้าแก้ไข (field ระดับบนสุด) |

`AdminComponent` คือชื่อ custom element (ตัวพิมพ์เล็ก มี `-`) หรือ `{ tag, props }`

## ประเภท {#types}

| ประเภท | ค่า | ตัวเลือกเพิ่มเติม |
|---|---|---|
| `text` | `string` | [`minLength`, `maxLength`](#text-and-textarea) |
| `textarea` | `string` | [`minLength`, `maxLength`](#text-and-textarea) |
| `email` | `string` (ตัวพิมพ์เล็ก) | |
| `number` | `number` | [`min`, `max`](#number) |
| `boolean` | `boolean` | |
| `date` | `string` แบบ ISO 8601 | |
| `select` | หนึ่งตัวเลือก หรือ array เมื่อใช้ `hasMany` | [`options`, `hasMany`](#select) |
| `slug` | `string` ที่ปลอดภัยสำหรับ URL และไม่ซ้ำ | [`from`](#slug) |
| `json` | JSON ใดก็ได้ | |
| `richText` | JSON ของ Tiptap | ดู [Rich text](/th/guide/rich-text) |
| `upload` | id ของเอกสาร `media` หรือ array เมื่อใช้ `hasMany` | [`hasMany`, `mimeTypes`](#upload) |
| `relationship` | id ของเอกสาร | [`to`, `hasMany`](#relationship) |
| `array` | แถวที่มี `id` และ field ย่อย | [`fields`, `minRows`, `maxRows`](#array) |
| `group` | object | [`fields`](#group) |
| `blocks` | แถวหลายชนิด มี `blockType` | [`blocks`, `minRows`, `maxRows`](#blocks) |

แพ็กเกจเพิ่มชนิดอื่นได้ เช่น `color` จาก `@easy-cms/fields` ดู[ชนิด field เพิ่มเติม](/th/guide/field-types)

<!-- api: TextField -->
<!-- api: TextareaField -->
### text และ textarea {#text-and-textarea}

| ตัวเลือก | Type | |
|---|---|---|
| `minLength` | `number` | จำนวนตัวอักษรน้อยที่สุด |
| `maxLength` | `number` | จำนวนตัวอักษรมากที่สุด หน้า admin จะพิมพ์เกินไม่ได้ |

<!-- api: NumberField -->
### number {#number}

| ตัวเลือก | Type | |
|---|---|---|
| `min` | `number` | ค่าน้อยที่สุด |
| `max` | `number` | ค่ามากที่สุด |

<!-- api: SelectField -->
### select {#select}

| ตัวเลือก | Type | |
|---|---|---|
| `options` | `(string \| { label, value })[]` | **จำเป็น** ตัวเลือก `label` เป็น `{ en, th }` ได้ |
| `hasMany` | `boolean` | เลือกได้หลายตัว (checkbox) ค่าเป็น array |

<!-- api: SlugField -->
### slug {#slug}

| ตัวเลือก | Type | |
|---|---|---|
| `from` | `string` | field แบบ `text` ข้างเคียงที่ใช้สร้าง slug เมื่อยังว่าง |
| `uniqueWithin` | `string` | field ข้างเคียง (เช่น `parent`): slug ห้ามซ้ำเฉพาะเอกสารที่มีค่าใน field นั้นเหมือนกัน |

<!-- api: UploadField -->
### upload {#upload}

| ตัวเลือก | Type | |
|---|---|---|
| `hasMany` | `boolean` | หลายไฟล์ เรียงตามที่ผู้แก้จัดไว้ (แกลเลอรี) ค่าเป็น array |
| `minRows` | `number` | เมื่อใช้ `hasMany`: จำนวนไฟล์ขั้นต่ำ |
| `maxRows` | `number` | เมื่อใช้ `hasMany`: จำนวนไฟล์สูงสุด |
| `mimeTypes` | `string[]` | ชนิดไฟล์ที่อนุญาต เช่น `['image/*']` ช่องเลือกแสดงเฉพาะชนิดนี้ และตรวจซ้ำตอนบันทึก |

<!-- api: RelationshipField -->
### relationship {#relationship}

| ตัวเลือก | Type | |
|---|---|---|
| `to` | `string` | **จำเป็น** slug ของ collection ปลายทาง |
| `hasMany` | `boolean` | หลายเอกสาร ค่าเป็น array |
| `minRows` | `number` | เมื่อใช้ `hasMany`: จำนวนเอกสารขั้นต่ำ |
| `maxRows` | `number` | เมื่อใช้ `hasMany`: จำนวนเอกสารสูงสุด |
| `filterOptions` | `({ id, user, cms }) => Where \| true` | เอกสารใดที่เลือกได้ ช่องเลือกใน admin แสดงเฉพาะเอกสารเหล่านี้ และตรวจซ้ำตอนบันทึก |

<!-- api: ArrayField -->
### array {#array}

| ตัวเลือก | Type | |
|---|---|---|
| `fields` | `Field[]` | **จำเป็น** field ของแต่ละแถว |
| `minRows` | `number` | จำนวนแถวน้อยที่สุด |
| `maxRows` | `number` | จำนวนแถวมากที่สุด |

<!-- api: GroupField -->
### group {#group}

| ตัวเลือก | Type | |
|---|---|---|
| `fields` | `Field[]` | **จำเป็น** field ข้างใน |

<!-- api: BlocksField -->
### blocks {#blocks}

| ตัวเลือก | Type | |
|---|---|---|
| `blocks` | `Block[]` | **จำเป็น** ชนิดของแถว ดู [Block](#block) |
| `minRows` | `number` | จำนวนแถวน้อยที่สุด |
| `maxRows` | `number` | จำนวนแถวมากที่สุด |

<!-- api: Block -->
#### Block {#block}

| ตัวเลือก | Type | |
|---|---|---|
| `slug` | `string` | **จำเป็น** เก็บในแต่ละแถวเป็น `blockType` |
| `labels` | `{ singular?, plural? }` | ชื่อในหน้า admin |
| `fields` | `Field[]` | **จำเป็น** field ของ block |
