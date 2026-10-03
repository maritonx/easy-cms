import { type DefaultTheme, defineConfig } from 'vitepress'
import navigation from '../sidebar.json' with { type: 'json' }
import { packageManagerPlugin } from './package-managers.ts'

// GitHub Pages serves the site under /<repo>/; the deploy workflow sets DOCS_BASE.
const base = process.env.DOCS_BASE ?? '/'

type Locale = 'en' | 'th'

/**
 * The same pages in every language, from sidebar.json (which easy-cms.io reads too);
 * `prefix` is '' for English and '/th' for Thai.
 */
function sidebar(prefix: string, locale: Locale): DefaultTheme.SidebarItem[] {
  return navigation.groups.map((group) => ({
    text: group.title[locale],
    ...('collapsed' in group ? { collapsed: group.collapsed } : {}),
    items: group.items.map((item) => ({
      text: item.title[locale],
      link: `${prefix}/${item.path.replace(/(^|\/)index$/, '$1')}`,
    })),
  }))
}

export default defineConfig({
  base,
  title: 'Easy CMS',
  cleanUrls: true,
  lastUpdated: true,
  // ```sh [pm] blocks: the command for npm, pnpm, Yarn and Bun.
  markdown: { config: packageManagerPlugin },
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
        sidebar: sidebar('', 'en'),
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
        sidebar: sidebar('/th', 'th'),
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
