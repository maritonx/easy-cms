import type { FieldKind } from './shared.js'

type Row = Record<string, unknown> & { blockType?: string }

const MESSAGES = {
  en: {
    required: 'is required',
    email: 'must be an email address',
    number: 'must be a number',
    min: 'must be at least {n}',
    max: 'must be at most {n}',
    phone: 'must be a phone number',
    date: 'must be a date',
    option: 'must be one of the choices',
    tooLong: 'is too long',
    ticked: 'must be ticked',
  },
  th: {
    required: 'ต้องกรอก',
    email: 'ต้องเป็นอีเมล',
    number: 'ต้องเป็นตัวเลข',
    min: 'ต้องไม่น้อยกว่า {n}',
    max: 'ต้องไม่เกิน {n}',
    phone: 'ต้องเป็นเบอร์โทร',
    date: 'ต้องเป็นวันที่',
    option: 'ต้องเลือกจากตัวเลือก',
    tooLong: 'ยาวเกินไป',
    ticked: 'ต้องติ๊ก',
  },
} as const

export type Message = keyof (typeof MESSAGES)['en']

export const message = (locale: string | null, key: Message, n?: number) =>
  (locale === 'th' ? MESSAGES.th : MESSAGES.en)[key].replace('{n}', String(n ?? ''))

const EMAIL = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:"]+$/
const PHONE = /^\+?[0-9 ()-]{6,20}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const MAX_TEXT = 1_000
const MAX_TEXTAREA = 10_000

/**
 * Checks submitted data against the form's fields. Returns the values to store (only the
 * form's fields, typed) and the errors by field name.
 */
export function validateSubmission(
  rows: readonly Row[],
  data: Readonly<Record<string, unknown>>,
  locale: string | null,
): { values: Record<string, unknown>; errors: { field: string; message: string }[] } {
  const values: Record<string, unknown> = {}
  const errors: { field: string; message: string }[] = []
  for (const row of rows) {
    const kind = row.blockType as FieldKind
    const name = typeof row.name === 'string' ? row.name : ''
    if (kind === 'message' || !name) continue
    const fail = (key: Message, n?: number) =>
      errors.push({ field: name, message: message(locale, key, n) })
    const raw = data[name]
    const required = row.required === true

    if (kind === 'checkbox') {
      const ticked = raw === true || raw === 'true' || raw === 'on'
      if (required && !ticked) fail('ticked')
      values[name] = ticked
      continue
    }
    if (kind === 'select' && row.multiple === true) {
      const list = (Array.isArray(raw) ? raw : raw === undefined || raw === '' ? [] : [raw]).map(
        String,
      )
      const allowed = optionValues(row)
      if (required && list.length === 0) fail('required')
      else if (list.some((v) => !allowed.includes(v))) fail('option')
      else values[name] = list
      continue
    }

    const text = raw === undefined || raw === null ? '' : String(raw).trim()
    if (text === '') {
      if (required) fail('required')
      else values[name] = null
      continue
    }
    switch (kind) {
      case 'email':
        if (!EMAIL.test(text) || text.length > 254) fail('email')
        else values[name] = text
        break
      case 'number': {
        const n = Number(text)
        if (!Number.isFinite(n)) fail('number')
        else if (typeof row.min === 'number' && n < row.min) fail('min', row.min)
        else if (typeof row.max === 'number' && n > row.max) fail('max', row.max)
        else values[name] = n
        break
      }
      case 'phone':
        if (!PHONE.test(text)) fail('phone')
        else values[name] = text
        break
      case 'date':
        if (!DATE.test(text) || Number.isNaN(Date.parse(text))) fail('date')
        else values[name] = text
        break
      case 'select':
        if (!optionValues(row).includes(text)) fail('option')
        else values[name] = text
        break
      case 'textarea':
        if (text.length > MAX_TEXTAREA) fail('tooLong')
        else values[name] = text
        break
      default:
        if (text.length > MAX_TEXT) fail('tooLong')
        else values[name] = text
    }
  }
  return { values, errors }
}

const optionValues = (row: Row) =>
  (Array.isArray(row.options) ? (row.options as Row[]) : []).map((o) => String(o.value ?? ''))
