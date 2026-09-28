import { type DefaultTheme, defineConfig } from 'vitepress'

// GitHub Pages serves the site under /<repo>/; the deploy workflow sets DOCS_BASE.
const base = process.env.DOCS_BASE ?? '/'

type Labels = Record<string, string>

const RECIPES = [
  'own-posts',
  'rebuild-on-publish',
  'reading-time',
  'landing-page',
  'navigation-menu',
  'vercel',
  'sqlite-to-postgres',
  'automate-backups',
]

/** The same pages in every language; `prefix` is '' for English and '/th' for Thai. */
function sidebar(prefix: string, t: Labels): DefaultTheme.SidebarItem[] {
  const page = (slug: string) => ({ text: t[slug] as string, link: `${prefix}/guide/${slug}` })
  const at = (path: string, key: string) => ({ text: t[key] as string, link: `${prefix}/${path}` })
  return [
    {
      text: t.introduction,
      items: [
        ...['what-is-easy-cms', 'getting-started'].map(page),
        page('tutorial'),
        ...['nuxt', 'next', 'standalone'].map(page),
      ],
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
      items: ['local-api', 'typescript', 'rich-text', 'live-preview'].map(page),
    },
    {
      text: t.plugins,
      items: ['plugins', 'seo'].map(page),
    },
    {
      text: t.operations,
      items: ['databases', 'deployment', 'backups', 'webhooks', 'security'].map(page),
    },
    {
      text: t.recipes,
      collapsed: true,
      items: [
        at('guide/recipes/', 'recipes-all'),
        ...RECIPES.map((slug) => at(`guide/recipes/${slug}`, `recipe-${slug}`)),
      ],
    },
    {
      text: t.reference,
      items: [
        at('reference/config', 'ref-config'),
        at('reference/fields', 'ref-fields'),
        at('reference/local-api', 'ref-local-api'),
        page('rest-api'),
        page('cli'),
      ],
    },
  ]
}

const en: Labels = {
  introduction: 'Introduction',
  content: 'Content',
  using: 'Using content',
  plugins: 'Plugins',
  operations: 'Operations',
  recipes: 'Recipes',
  reference: 'Reference',
  tutorial: 'Tutorial: build a blog',
  'recipes-all': 'All recipes',
  'recipe-own-posts': 'Authors edit only their own posts',
  'recipe-rebuild-on-publish': 'Rebuild a static site on publish',
  'recipe-reading-time': 'Reading time with a hook',
  'recipe-landing-page': 'A landing page from blocks',
  'recipe-navigation-menu': 'A navigation menu in a global',
  'recipe-vercel': 'Deploy on Vercel',
  'recipe-sqlite-to-postgres': 'Move from SQLite to Postgres',
  'recipe-automate-backups': 'Automate backups',
  'ref-config': 'Config',
  'ref-fields': 'Fields',
  'ref-local-api': 'Local API',
  'what-is-easy-cms': 'What is Easy CMS?',
  'getting-started': 'Getting started',
  nuxt: 'Nuxt',
  next: 'Next.js',
  standalone: 'Standalone server',
  configuration: 'Configuration',
  fields: 'Fields',
  'access-control': 'Access control',
  hooks: 'Hooks',
  drafts: 'Drafts, versions & scheduling',
  localization: 'Localization',
  uploads: 'Uploads & media',
  auth: 'Users & auth',
  'local-api': 'Local API',
  'rest-api': 'REST API',
  typescript: 'TypeScript',
  'rich-text': 'Rich text',
  'live-preview': 'Live preview',
  seo: 'SEO',
  databases: 'Databases',
  deployment: 'Migrations & deployment',
  backups: 'Backups & upgrades',
  webhooks: 'Webhooks',
  cli: 'CLI',
  security: 'Security',
}

const th: Labels = {
  introduction: 'เริ่มต้น',
  content: 'เนื้อหา',
  using: 'การใช้เนื้อหา',
  plugins: 'Plugins',
  operations: 'การดูแลระบบ',
  recipes: 'สูตรสำเร็จ',
  reference: 'อ้างอิง',
  tutorial: 'บทเรียน: สร้างบล็อก',
  'recipes-all': 'สูตรทั้งหมด',
  'recipe-own-posts': 'ผู้เขียนแก้ได้เฉพาะบทความของตัวเอง',
  'recipe-rebuild-on-publish': 'build เว็บ static ใหม่เมื่อเผยแพร่',
  'recipe-reading-time': 'เวลาอ่านด้วย hook',
  'recipe-landing-page': 'หน้า landing page จาก blocks',
  'recipe-navigation-menu': 'เมนูนำทางใน global',
  'recipe-vercel': 'Deploy บน Vercel',
  'recipe-sqlite-to-postgres': 'ย้ายจาก SQLite ไป Postgres',
  'recipe-automate-backups': 'สำรองข้อมูลอัตโนมัติ',
  'ref-config': 'Config',
  'ref-fields': 'Fields',
  'ref-local-api': 'Local API',
  'what-is-easy-cms': 'Easy CMS คืออะไร',
  'getting-started': 'เริ่มใช้งาน',
  nuxt: 'Nuxt',
  next: 'Next.js',
  standalone: 'Standalone server',
  configuration: 'การตั้งค่า',
  fields: 'Fields',
  'access-control': 'การควบคุมสิทธิ์',
  hooks: 'Hooks',
  drafts: 'ฉบับร่าง เวอร์ชัน และการตั้งเวลา',
  localization: 'หลายภาษา (localization)',
  uploads: 'อัปโหลดและ media',
  auth: 'ผู้ใช้และการยืนยันตัวตน',
  'local-api': 'Local API',
  'rest-api': 'REST API',
  typescript: 'TypeScript',
  'rich-text': 'Rich text',
  'live-preview': 'ตัวอย่างสด (live preview)',
  seo: 'SEO',
  databases: 'ฐานข้อมูล',
  deployment: 'Migration และการ deploy',
  backups: 'Backup และการอัปเกรด',
  webhooks: 'Webhooks',
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
          { text: 'Tutorial', link: '/guide/tutorial' },
          { text: 'Recipes', link: '/guide/recipes/' },
          { text: 'Reference', link: '/reference/config' },
        ],
        sidebar: sidebar('', en),
        editLink: {
          pattern: 'https://github.com/maritonx/easy-cms/edit/main/website/:path',
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
          { text: 'บทเรียน', link: '/th/guide/tutorial' },
          { text: 'สูตรสำเร็จ', link: '/th/guide/recipes/' },
          { text: 'อ้างอิง', link: '/th/reference/config' },
        ],
        sidebar: sidebar('/th', th),
        editLink: {
          pattern: 'https://github.com/maritonx/easy-cms/edit/main/website/:path',
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
    socialLinks: [{ icon: 'github', link: 'https://github.com/maritonx/easy-cms' }],
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
