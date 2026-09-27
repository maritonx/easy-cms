import { ref } from 'vue'
import { settings } from './settings'

export type Locale = 'en' | 'th'

const en = {
  'app.name': 'Easy CMS',
  'nav.dashboard': 'Dashboard',
  'nav.collections': 'Collections',
  'nav.globals': 'Globals',
  'nav.account': 'Account',
  'nav.logout': 'Log out',
  'nav.language': 'ภาษาไทย',
  'login.title': 'Log in',
  'login.email': 'Email',
  'login.password': 'Password',
  'login.submit': 'Log in',
  'login.failed': 'Invalid email or password',
  'login.locked': 'Too many attempts. Try again later.',
  'setup.title': 'Create the first admin',
  'setup.intro': 'No users exist yet. The account you create here has full access.',
  'setup.name': 'Name',
  'setup.submit': 'Create admin',
  'dashboard.title': 'Dashboard',
  'dashboard.welcome': 'Welcome, {name}',
  'dashboard.documents': '{count} documents',
  'list.new': 'Create new',
  'list.search': 'Search {field}',
  'list.empty': 'Nothing here yet.',
  'list.noResults': 'No results.',
  'list.selected': '{count} selected',
  'list.deleteSelected': 'Delete selected',
  'list.confirmDelete': 'Delete {count} documents? This cannot be undone.',
  'list.updated': 'Updated',
  'list.status': 'Status',
  'list.page': 'Page {page} of {pages}',
  'list.previous': 'Previous',
  'list.next': 'Next',
  'list.selectAll': 'Select all on this page',
  'list.selectRow': 'Select {title}',
  'edit.create': 'Create {label}',
  'edit.save': 'Save',
  'edit.saveDraft': 'Save draft',
  'edit.publish': 'Publish',
  'edit.delete': 'Delete',
  'edit.confirmDelete': 'Delete this document? This cannot be undone.',
  'edit.unpublish': 'Unpublish',
  'edit.unpublished': 'Unpublished',
  'edit.publishChanges': 'Publish changes',
  'edit.discardChanges': 'Discard changes',
  'edit.discarded': 'Changes discarded',
  'edit.confirmDiscard': 'Discard the unpublished changes and go back to the published version?',
  'edit.draftSaved': 'Draft saved. The published version is still live.',
  'edit.published': 'Published',
  'status.changed': 'Unpublished changes',
  'history.title': 'History',
  'history.empty': 'No versions yet.',
  'history.current': 'Current',
  'history.by': 'by {name}',
  'history.you': 'you',
  'history.user': 'user #{id}',
  'history.view': 'Version from {date}',
  'history.restore': 'Restore this version',
  'history.restoreDraft': 'Restore as draft',
  'history.restored': 'Version restored',
  'history.close': 'Close',
  'history.more': 'Show older',
  'locale.label': 'Content language',
  'locale.localized': 'Translated per language',
  'locale.switchUnsaved': 'You have unsaved changes in this language. Switch anyway?',
  'preview.show': 'Preview',
  'preview.hide': 'Close preview',
  'preview.title': 'Live preview',
  'preview.reload': 'Reload',
  'preview.open': 'Open in new tab',
  'preview.none': 'This document has no page to preview.',
  'media.upload': 'Upload files',
  'media.drop': 'Drop files here or choose files to upload',
  'media.uploading': 'Uploading {name}…',
  'media.uploaded': 'Uploaded {count} file(s)',
  'media.failed': '{name}: {message}',
  'media.choose': 'Choose from media library',
  'media.change': 'Change',
  'media.remove': 'Remove',
  'media.pickerTitle': 'Choose a file',
  'media.empty': 'No files yet. Upload one.',
  'media.preview': 'Preview',
  'media.size': '{width} × {height} px · {size}',
  'rte.imageFromUrl': 'Or insert by URL',
  'edit.saved': 'Saved',
  'edit.created': 'Created',
  'edit.deleted': 'Deleted',
  'edit.fixErrors': 'Please fix the highlighted fields.',
  'edit.unsaved': 'You have unsaved changes. Leave anyway?',
  'edit.readOnly': 'You can view but not change this document.',
  'edit.notFound': 'Document not found.',
  'edit.password': 'Password',
  'edit.newPassword': 'New password (leave empty to keep)',
  'status.draft': 'Draft',
  'status.published': 'Published',
  'field.required': 'Required',
  'field.invalidJson': 'Invalid JSON',
  'field.addRow': 'Add row',
  'field.removeRow': 'Remove row {n}',
  'field.moveUp': 'Move row {n} up',
  'field.moveDown': 'Move row {n} down',
  'field.row': 'Row {n}',
  'field.none': '— None —',
  'field.searchRelation': 'Search…',
  'field.remove': 'Remove {title}',
  'field.noMatches': 'No matches',
  'rte.bold': 'Bold',
  'rte.italic': 'Italic',
  'rte.underline': 'Underline',
  'rte.code': 'Code',
  'rte.link': 'Link',
  'rte.linkPrompt': 'Link URL (empty to remove)',
  'rte.image': 'Image',
  'rte.imagePrompt': 'Image URL',
  'rte.bulletList': 'Bullet list',
  'rte.orderedList': 'Numbered list',
  'rte.blockquote': 'Quote',
  'rte.heading': 'Heading {level}',
  'rte.undo': 'Undo',
  'rte.redo': 'Redo',
  'account.title': 'Account',
  'account.changePassword': 'Change password',
  'account.passwordChanged': 'Password changed',
  'account.save': 'Save changes',
  'common.cancel': 'Cancel',
  'common.confirm': 'Confirm',
  'common.loading': 'Loading…',
  'common.error': 'Something went wrong: {message}',
  'common.forbidden': 'You are not allowed to do this.',
  'common.notFound': 'Page not found.',
  'common.back': 'Back',
} as const

export type MessageKey = keyof typeof en

const th: Record<MessageKey, string> = {
  'app.name': 'Easy CMS',
  'nav.dashboard': 'แดชบอร์ด',
  'nav.collections': 'คอลเลกชัน',
  'nav.globals': 'ตั้งค่าทั่วไป',
  'nav.account': 'บัญชีของฉัน',
  'nav.logout': 'ออกจากระบบ',
  'nav.language': 'English',
  'login.title': 'เข้าสู่ระบบ',
  'login.email': 'อีเมล',
  'login.password': 'รหัสผ่าน',
  'login.submit': 'เข้าสู่ระบบ',
  'login.failed': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
  'login.locked': 'ลองผิดหลายครั้งเกินไป กรุณาลองใหม่ภายหลัง',
  'setup.title': 'สร้างผู้ดูแลระบบคนแรก',
  'setup.intro': 'ยังไม่มีผู้ใช้ในระบบ บัญชีที่สร้างตรงนี้จะมีสิทธิ์ทั้งหมด',
  'setup.name': 'ชื่อ',
  'setup.submit': 'สร้างผู้ดูแลระบบ',
  'dashboard.title': 'แดชบอร์ด',
  'dashboard.welcome': 'สวัสดี {name}',
  'dashboard.documents': '{count} รายการ',
  'list.new': 'สร้างใหม่',
  'list.search': 'ค้นหาจาก{field}',
  'list.empty': 'ยังไม่มีข้อมูล',
  'list.noResults': 'ไม่พบข้อมูลที่ค้นหา',
  'list.selected': 'เลือกแล้ว {count} รายการ',
  'list.deleteSelected': 'ลบที่เลือก',
  'list.confirmDelete': 'ลบ {count} รายการ? การลบไม่สามารถย้อนกลับได้',
  'list.updated': 'แก้ไขล่าสุด',
  'list.status': 'สถานะ',
  'list.page': 'หน้า {page} จาก {pages}',
  'list.previous': 'ก่อนหน้า',
  'list.next': 'ถัดไป',
  'list.selectAll': 'เลือกทั้งหมดในหน้านี้',
  'list.selectRow': 'เลือก {title}',
  'edit.create': 'สร้าง{label}',
  'edit.save': 'บันทึก',
  'edit.saveDraft': 'บันทึกฉบับร่าง',
  'edit.publish': 'เผยแพร่',
  'edit.delete': 'ลบ',
  'edit.confirmDelete': 'ลบรายการนี้? การลบไม่สามารถย้อนกลับได้',
  'edit.unpublish': 'ยกเลิกการเผยแพร่',
  'edit.unpublished': 'ยกเลิกการเผยแพร่แล้ว',
  'edit.publishChanges': 'เผยแพร่การแก้ไข',
  'edit.discardChanges': 'ยกเลิกการแก้ไข',
  'edit.discarded': 'ยกเลิกการแก้ไขแล้ว',
  'edit.confirmDiscard': 'ยกเลิกการแก้ไขที่ยังไม่เผยแพร่ แล้วกลับไปใช้เวอร์ชันที่เผยแพร่อยู่?',
  'edit.draftSaved': 'บันทึกฉบับร่างแล้ว เวอร์ชันที่เผยแพร่ยังแสดงบนเว็บตามเดิม',
  'edit.published': 'เผยแพร่แล้ว',
  'status.changed': 'มีการแก้ไขที่ยังไม่เผยแพร่',
  'history.title': 'ประวัติ',
  'history.empty': 'ยังไม่มีเวอร์ชัน',
  'history.current': 'ปัจจุบัน',
  'history.by': 'โดย {name}',
  'history.you': 'คุณ',
  'history.user': 'ผู้ใช้ #{id}',
  'history.view': 'เวอร์ชันเมื่อ {date}',
  'history.restore': 'กู้คืนเวอร์ชันนี้',
  'history.restoreDraft': 'กู้คืนเป็นฉบับร่าง',
  'history.restored': 'กู้คืนเวอร์ชันแล้ว',
  'history.close': 'ปิด',
  'history.more': 'แสดงเวอร์ชันเก่ากว่า',
  'locale.label': 'ภาษาของเนื้อหา',
  'locale.localized': 'แปลแยกตามภาษา',
  'locale.switchUnsaved': 'มีการแก้ไขที่ยังไม่บันทึกในภาษานี้ เปลี่ยนภาษาเลยไหม?',
  'preview.show': 'ดูตัวอย่าง',
  'preview.hide': 'ปิดตัวอย่าง',
  'preview.title': 'ตัวอย่างสด',
  'preview.reload': 'โหลดใหม่',
  'preview.open': 'เปิดในแท็บใหม่',
  'preview.none': 'เอกสารนี้ไม่มีหน้าให้ดูตัวอย่าง',
  'media.upload': 'อัปโหลดไฟล์',
  'media.drop': 'ลากไฟล์มาวางที่นี่ หรือเลือกไฟล์เพื่ออัปโหลด',
  'media.uploading': 'กำลังอัปโหลด {name}…',
  'media.uploaded': 'อัปโหลดแล้ว {count} ไฟล์',
  'media.failed': '{name}: {message}',
  'media.choose': 'เลือกจากคลังสื่อ',
  'media.change': 'เปลี่ยน',
  'media.remove': 'นำออก',
  'media.pickerTitle': 'เลือกไฟล์',
  'media.empty': 'ยังไม่มีไฟล์ อัปโหลดไฟล์แรกได้เลย',
  'media.preview': 'ตัวอย่าง',
  'media.size': '{width} × {height} px · {size}',
  'rte.imageFromUrl': 'หรือใส่ URL ของรูป',
  'edit.saved': 'บันทึกแล้ว',
  'edit.created': 'สร้างแล้ว',
  'edit.deleted': 'ลบแล้ว',
  'edit.fixErrors': 'กรุณาแก้ไขช่องที่ทำเครื่องหมายไว้',
  'edit.unsaved': 'มีการแก้ไขที่ยังไม่ได้บันทึก ต้องการออกจากหน้านี้หรือไม่',
  'edit.readOnly': 'คุณดูรายการนี้ได้ แต่แก้ไขไม่ได้',
  'edit.notFound': 'ไม่พบรายการนี้',
  'edit.password': 'รหัสผ่าน',
  'edit.newPassword': 'รหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)',
  'status.draft': 'ฉบับร่าง',
  'status.published': 'เผยแพร่แล้ว',
  'field.required': 'จำเป็น',
  'field.invalidJson': 'JSON ไม่ถูกต้อง',
  'field.addRow': 'เพิ่มแถว',
  'field.removeRow': 'ลบแถวที่ {n}',
  'field.moveUp': 'เลื่อนแถวที่ {n} ขึ้น',
  'field.moveDown': 'เลื่อนแถวที่ {n} ลง',
  'field.row': 'แถวที่ {n}',
  'field.none': '— ไม่เลือก —',
  'field.searchRelation': 'ค้นหา…',
  'field.remove': 'นำ {title} ออก',
  'field.noMatches': 'ไม่พบรายการ',
  'rte.bold': 'ตัวหนา',
  'rte.italic': 'ตัวเอียง',
  'rte.underline': 'ขีดเส้นใต้',
  'rte.code': 'โค้ด',
  'rte.link': 'ลิงก์',
  'rte.linkPrompt': 'URL ของลิงก์ (เว้นว่างเพื่อลบ)',
  'rte.image': 'รูปภาพ',
  'rte.imagePrompt': 'URL ของรูปภาพ',
  'rte.bulletList': 'รายการแบบจุด',
  'rte.orderedList': 'รายการแบบตัวเลข',
  'rte.blockquote': 'ข้อความอ้างอิง',
  'rte.heading': 'หัวข้อระดับ {level}',
  'rte.undo': 'เลิกทำ',
  'rte.redo': 'ทำซ้ำ',
  'account.title': 'บัญชีของฉัน',
  'account.changePassword': 'เปลี่ยนรหัสผ่าน',
  'account.passwordChanged': 'เปลี่ยนรหัสผ่านแล้ว',
  'account.save': 'บันทึกการเปลี่ยนแปลง',
  'common.cancel': 'ยกเลิก',
  'common.confirm': 'ยืนยัน',
  'common.loading': 'กำลังโหลด…',
  'common.error': 'เกิดข้อผิดพลาด: {message}',
  'common.forbidden': 'คุณไม่มีสิทธิ์ทำรายการนี้',
  'common.notFound': 'ไม่พบหน้านี้',
  'common.back': 'ย้อนกลับ',
}

const messages: Record<Locale, Record<MessageKey, string>> = { en, th }
const STORAGE_KEY = 'easy-cms-locale'

function initialLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'en' || stored === 'th') return stored
  } catch {
    // storage unavailable (private mode): use the default
  }
  return settings.locale
}

export const locale = ref<Locale>(initialLocale())
document.documentElement.lang = locale.value

export function setLocale(next: Locale) {
  locale.value = next
  document.documentElement.lang = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // ignore
  }
}

export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  const template = messages[locale.value][key] ?? en[key]
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`))
}

/** Resolves a config label (string or per-locale object), falling back to a humanized name. */
export function label(value: unknown, fallback: string): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const map = value as Record<string, string>
    return map[locale.value] ?? map.en ?? Object.values(map)[0] ?? humanize(fallback)
  }
  return humanize(fallback)
}

/** "publishedAt" → "Published at", "site-settings" → "Site settings". */
export function humanize(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .trim()
    .toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function formatDate(value: unknown): string {
  if (typeof value !== 'string') return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale.value === 'th' ? 'th-TH' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

/** Best-effort English singular for labels derived from slugs: "categories" → "category". */
export function singularize(word: string): string {
  if (/ies$/i.test(word)) return word.replace(/ies$/i, 'y')
  if (/(ss|us)$/i.test(word)) return word
  if (/(x|ch|sh|sses)es$/i.test(word)) return word.replace(/es$/i, '')
  return word.replace(/s$/i, '')
}

/** "1.2 MB" style sizes. */
export function formatBytes(bytes: unknown): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes)) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`
}
