/** The global with the settings (Settings → Analytics & consent), unless `slugs` renames it. */
export const SETTINGS = 'analytics'
/** The collection of consent records. */
export const RECORDS = 'consent-records'

/** Where consent defaults to "denied": everywhere, or only the EEA, UK, Switzerland and Thailand. */
export type ConsentRegion = 'everywhere' | 'eea-th'

/** ISO 3166-1 codes Consent Mode's `region` takes: the EEA, the UK, Switzerland and Thailand. */
export const STRICT_REGIONS = [
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
  'IS',
  'LI',
  'NO',
  'GB',
  'CH',
  'TH',
] as const

/** What the banner says, per language. */
export interface BannerTexts {
  readonly title: string
  readonly text: string
  readonly privacy: string
  readonly privacyLabel: string
  readonly accept: string
  readonly reject: string
  readonly settings: string
  readonly save: string
  readonly necessary: string
  readonly necessaryText: string
  readonly analytics: string
  readonly analyticsText: string
  readonly marketing: string
  readonly marketingText: string
}

export const DEFAULT_TEXTS: Readonly<Record<'en' | 'th', BannerTexts>> = {
  en: {
    title: 'Cookies on this site',
    text: 'We use cookies to see how the site is used and, if you agree, for marketing. You can change your choice at any time.',
    privacy: '',
    privacyLabel: 'Privacy policy',
    accept: 'Accept all',
    reject: 'Reject all',
    settings: 'Settings',
    save: 'Save my choice',
    necessary: 'Necessary',
    necessaryText: 'Needed for the site to work, such as remembering this choice. Always on.',
    analytics: 'Analytics',
    analyticsText: 'Counting visits and seeing which pages are used, to improve the site.',
    marketing: 'Marketing',
    marketingText: 'Measuring ads and showing ads that fit your interests.',
  },
  th: {
    title: 'คุกกี้บนเว็บไซต์นี้',
    text: 'เราใช้คุกกี้เพื่อดูว่าเว็บไซต์ถูกใช้งานอย่างไร และเพื่อการตลาดหากคุณยินยอม คุณเปลี่ยนการเลือกได้ทุกเมื่อ',
    privacy: '',
    privacyLabel: 'นโยบายความเป็นส่วนตัว',
    accept: 'ยอมรับทั้งหมด',
    reject: 'ปฏิเสธทั้งหมด',
    settings: 'ตั้งค่า',
    save: 'บันทึกการเลือก',
    necessary: 'จำเป็น',
    necessaryText: 'ต้องใช้เพื่อให้เว็บไซต์ทำงาน เช่น จำการเลือกนี้ไว้ เปิดอยู่เสมอ',
    analytics: 'การวิเคราะห์',
    analyticsText: 'นับการเข้าชมและดูว่าหน้าไหนถูกใช้ เพื่อปรับปรุงเว็บไซต์',
    marketing: 'การตลาด',
    marketingText: 'วัดผลโฆษณา และแสดงโฆษณาที่ตรงกับความสนใจของคุณ',
  },
}

/** A Google Tag Manager container ID. */
export const GTM_ID = /^GTM-[A-Z0-9]{4,12}$/

/** What the browser sends to record a choice. */
export const CONSENT_ID = /^[A-Za-z0-9-]{8,64}$/
export const VERSION = /^[a-z0-9]{1,16}$/

/** A short, stable hash (djb2, base 36): the banner's version, so changed texts ask again. */
export function versionOf(text: string): string {
  let hash = 5381
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0
  return hash.toString(36)
}
