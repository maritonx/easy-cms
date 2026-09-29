import type { Field } from '@easy-cms/core'
import type { FieldKind } from './shared.js'

type Block = { slug: FieldKind; labels: { singular: Record<string, string> }; fields: Field[] }

/** A name for the submitted data: letters, digits and `_`, starting with a letter. */
export const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_]*$/

/** The form's field blocks. `localized` makes labels and texts translatable. */
export function fieldBlocks(localized: boolean, kinds: readonly FieldKind[]): Block[] {
  const l = localized ? { localized: true } : {}
  const name: Field = {
    name: 'name',
    type: 'text',
    required: true,
    label: { en: 'Name (in the data)', th: 'ชื่อ (ในข้อมูล)' },
    validate: (value) =>
      value === null || value === undefined || FIELD_NAME.test(String(value))
        ? true
        : 'use letters, digits and _, starting with a letter',
  }
  const label: Field = { name: 'label', type: 'text', label: { en: 'Label', th: 'ป้าย' }, ...l }
  const required: Field = {
    name: 'required',
    type: 'boolean',
    label: { en: 'Required', th: 'ต้องกรอก' },
  }
  const placeholder: Field = {
    name: 'placeholder',
    type: 'text',
    label: { en: 'Placeholder', th: 'ข้อความตัวอย่าง' },
    ...l,
  }
  const width: Field = {
    name: 'width',
    type: 'select',
    options: ['full', 'half'],
    defaultValue: 'full',
    label: { en: 'Width', th: 'ความกว้าง' },
  }
  const defaultValue: Field = {
    name: 'defaultValue',
    type: 'text',
    label: { en: 'Default value', th: 'ค่าเริ่มต้น' },
  }
  const common = [name, label, required, placeholder, defaultValue, width]
  const block = (slug: FieldKind, en: string, th: string, fields: Field[]): Block => ({
    slug,
    labels: { singular: { en, th } },
    fields,
  })
  const all: Block[] = [
    block('text', 'Text', 'ข้อความ', common),
    block('textarea', 'Long text', 'ข้อความยาว', common),
    block('email', 'Email', 'อีเมล', common),
    block('number', 'Number', 'ตัวเลข', [
      ...common,
      { name: 'min', type: 'number', label: { en: 'Minimum', th: 'ต่ำสุด' } },
      { name: 'max', type: 'number', label: { en: 'Maximum', th: 'สูงสุด' } },
    ]),
    block('phone', 'Phone', 'เบอร์โทร', common),
    block('select', 'Choice', 'ตัวเลือก', [
      name,
      label,
      required,
      placeholder,
      width,
      {
        name: 'options',
        type: 'array',
        label: { en: 'Choices', th: 'ตัวเลือก' },
        fields: [
          { name: 'label', type: 'text', required: true, label: { en: 'Label', th: 'ป้าย' }, ...l },
          { name: 'value', type: 'text', required: true, label: { en: 'Value', th: 'ค่า' } },
        ],
      },
      { name: 'multiple', type: 'boolean', label: { en: 'Allow several', th: 'เลือกได้หลายข้อ' } },
      {
        name: 'display',
        type: 'select',
        options: ['dropdown', 'radio'],
        defaultValue: 'dropdown',
        label: { en: 'Show as', th: 'แสดงเป็น' },
      },
    ]),
    block('checkbox', 'Checkbox', 'ช่องติ๊ก', [
      name,
      label,
      required,
      { name: 'checked', type: 'boolean', label: { en: 'Ticked at first', th: 'ติ๊กไว้ก่อน' } },
      width,
    ]),
    block('date', 'Date', 'วันที่', [name, label, required, width]),
    block('message', 'Message', 'ข้อความอธิบาย', [
      { name: 'content', type: 'richText', label: { en: 'Text', th: 'ข้อความ' }, ...l },
    ]),
  ]
  return all.filter((b) => kinds.includes(b.slug))
}
