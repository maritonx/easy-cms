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
| `unique` | `boolean` | เอกสารสองรายการใช้ค่าซ้ำกันไม่ได้ (field ระดับบนสุด) |
| `index` | `boolean` | สร้าง index ในฐานข้อมูล |
| `defaultValue` | ค่าของ field | ใช้เมื่อสร้างเอกสารโดยไม่มีค่านี้ |
| `validate` | `(value, { data, operation }) => true \| string` | ตรวจเอง เป็น async ได้ |
| `access` | `{ read?, update? }` | [สิทธิ์](/th/guide/access-control#field-access)ระดับ field |
| `hidden` | `boolean` | ถูกจัดเก็บ แต่ไม่ถูกส่งคืนและไม่รับเป็น input |
| `localized` | `boolean` | เก็บค่าแยกตามภาษา (ต้องมี `localization`) |
| `position` | `'sidebar'` | แสดงในแถบข้างของหน้าแก้ไข (field ระดับบนสุด) |
| `admin` | `FieldAdmin` | admin components ดู[ด้านล่าง](#admin) |

<!-- api: FieldAdmin -->
### admin {#admin}

| ตัวเลือก | Type | |
|---|---|---|
| `component` | `AdminComponent` | Web Component แทนช่องกรอก [Admin components](/th/guide/plugins#admin-components) |
| `after` | `AdminComponent[]` | component ที่แสดงใต้ field |

`AdminComponent` คือชื่อ tag ที่ขึ้นต้นด้วย `ecms-` หรือ `{ tag, props }`

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
| `upload` | id ของเอกสาร `media` | |
| `relationship` | id ของเอกสาร | [`to`, `hasMany`](#relationship) |
| `array` | แถวที่มี `id` และ field ย่อย | [`fields`, `minRows`, `maxRows`](#array) |
| `group` | object | [`fields`](#group) |
| `blocks` | แถวหลายชนิด มี `blockType` | [`blocks`, `minRows`, `maxRows`](#blocks) |

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

<!-- api: RelationshipField -->
### relationship {#relationship}

| ตัวเลือก | Type | |
|---|---|---|
| `to` | `string` | **จำเป็น** slug ของ collection ปลายทาง |
| `hasMany` | `boolean` | หลายเอกสาร ค่าเป็น array |

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
