import { type DefaultTheme, defineConfig } from 'vitepress'

// GitHub Pages serves the site under /<repo>/; the deploy workflow sets DOCS_BASE.
const base = process.env.DOCS_BASE ?? '/'

type Labels = Record<string, string>

/** The same pages in every language; `prefix` is '' for English and '/th' for Thai. */
function sidebar(prefix: string, t: Labels): DefaultTheme.SidebarItem[] {
  const page = (slug: string) => ({ text: t[slug] as string, link: `${prefix}/guide/${slug}` })
  return [
    {
      text: t.introduction,
      items: ['what-is-easy-cms', 'getting-started', 'nuxt', 'next', 'standalone'].map(page),
    },
    {
      text: t.content,
      items: [
        'configuration',
        'fields',
        'access-control',
        'hooks',
        'drafts',
        'localization',
        'uploads',
        'auth',
      ].map(page),
    },
    {
      text: t.using,
      items: ['local-api', 'rest-api', 'typescript', 'rich-text', 'live-preview'].map(page),
    },
    {
      text: t.operations,
      items: ['databases', 'deployment', 'cli', 'security'].map(page),
    },
  ]
}

const en: Labels = {
  introduction: 'Introduction',
  content: 'Content',
  using: 'Using content',
  operations: 'Operations',
  'what-is-easy-cms': 'What is Easy CMS?',
  'getting-started': 'Getting started',
  nuxt: 'Nuxt',
  next: 'Next.js',
  standalone: 'Standalone server',
  configuration: 'Configuration',
  fields: 'Fields',
  'access-control': 'Access control',
  hooks: 'Hooks',
  drafts: 'Drafts & versions',
  localization: 'Localization',
  uploads: 'Uploads & media',
  auth: 'Users & auth',
  'local-api': 'Local API',
  'rest-api': 'REST API',
  typescript: 'TypeScript',
  'rich-text': 'Rich text',
  'live-preview': 'Live preview',
  databases: 'Databases',
  deployment: 'Migrations & deployment',
  cli: 'CLI',
  security: 'Security',
}

const th: Labels = {
  introduction: 'เริ่มต้น',
  content: 'เนื้อหา',
  using: 'การใช้เนื้อหา',
  operations: 'การดูแลระบบ',
  'what-is-easy-cms': 'Easy CMS คืออะไร',
  'getting-started': 'เริ่มใช้งาน',
  nuxt: 'Nuxt',
  next: 'Next.js',
  standalone: 'Standalone server',
  configuration: 'การตั้งค่า',
  fields: 'Fields',
  'access-control': 'การควบคุมสิทธิ์',
  hooks: 'Hooks',
  drafts: 'ฉบับร่างและเวอร์ชัน',
  localization: 'หลายภาษา (localization)',
  uploads: 'อัปโหลดและ media',
  auth: 'ผู้ใช้และการยืนยันตัวตน',
  'local-api': 'Local API',
  'rest-api': 'REST API',
  typescript: 'TypeScript',
  'rich-text': 'Rich text',
  'live-preview': 'ตัวอย่างสด (live preview)',
  databases: 'ฐานข้อมูล',
  deployment: 'Migration และการ deploy',
  cli: 'CLI',
  security: 'ความปลอดภัย',
}

export default defineConfig({
  base,
  title: 'Easy CMS',
  cleanUrls: true,
  lastUpdated: true,
  head: [['link', { rel: 'icon', href: `${base}logo.svg` }]],
  locales: {
    root: {
      label: 'English',
      lang: 'en',
      description: 'Embedded, code-first headless CMS for Nuxt and Next.js',
      themeConfig: {
        nav: [
          { text: 'Guide', link: '/guide/getting-started' },
          { text: 'Reference', link: '/guide/configuration' },
        ],
        sidebar: sidebar('', en),
        editLink: {
          pattern: 'https://github.com/maritonx/easy-crm/edit/main/website/:path',
          text: 'Edit this page on GitHub',
        },
        footer: { message: 'Released under the MIT License.' },
      },
    },
    th: {
      label: 'ไทย',
      lang: 'th',
      link: '/th/',
      description: 'Headless CMS แบบ code-first ที่ฝังอยู่ในแอป Nuxt และ Next.js',
      themeConfig: {
        nav: [
          { text: 'คู่มือ', link: '/th/guide/getting-started' },
          { text: 'อ้างอิง', link: '/th/guide/configuration' },
        ],
        sidebar: sidebar('/th', th),
        editLink: {
          pattern: 'https://github.com/maritonx/easy-crm/edit/main/website/:path',
          text: 'แก้ไขหน้านี้บน GitHub',
        },
        footer: { message: 'เผยแพร่ภายใต้สัญญาอนุญาต MIT' },
        outline: { label: 'ในหน้านี้' },
        docFooter: { prev: 'ก่อนหน้า', next: 'ถัดไป' },
        lastUpdated: { text: 'อัปเดตล่าสุด' },
        returnToTopLabel: 'กลับขึ้นด้านบน',
        sidebarMenuLabel: 'เมนู',
        darkModeSwitchLabel: 'ธีม',
        langMenuLabel: 'เปลี่ยนภาษา',
      },
    },
  },
  themeConfig: {
    logo: '/logo.svg',
    socialLinks: [{ icon: 'github', link: 'https://github.com/maritonx/easy-crm' }],
    search: {
      provider: 'local',
      options: {
        locales: {
          th: {
            translations: {
              button: { buttonText: 'ค้นหา', buttonAriaLabel: 'ค้นหา' },
              modal: {
                noResultsText: 'ไม่พบผลลัพธ์สำหรับ',
                resetButtonTitle: 'ล้างการค้นหา',
                footer: { selectText: 'เลือก', navigateText: 'เลื่อน', closeText: 'ปิด' },
              },
            },
          },
        },
      },
    },
  },
})
