<script setup lang="ts">
import { useData, withBase } from 'vitepress'
import { computed, ref } from 'vue'

/**
 * The landing page. Text is here in both languages; code examples come from the page's
 * markdown through slots, so VitePress highlights them.
 */
const props = defineProps<{ lang: 'en' | 'th' }>()
const { isDark } = useData()

const COPY = {
  en: {
    badge: 'New in 0.31: check and test your email settings in the admin',
    badgeLink: 'email#checking-the-settings',
    title: 'Your CMS,',
    titleAccent: 'inside your app',
    tagline:
      'Define content in TypeScript. Get an admin, typed APIs and plugins, with no separate server to run.',
    start: 'Get started',
    github: 'GitHub',
    copy: 'Copy',
    copied: 'Copied',
    heroAlt: 'The Easy CMS admin: editing a post',
    featuresTitle: 'Everything a content team needs',
    featuresLead: 'Built in, not bolted on. No add-ons to buy, no second service to host.',
    groups: [
      {
        name: 'Model your content',
        items: [
          [
            'Fields and blocks',
            '15 field types, groups, arrays and blocks for pages editors lay out themselves.',
          ],
          [
            'Rich text',
            'A Tiptap editor with images from the media library, rendered to safe HTML.',
          ],
          ['Media library', 'Uploads with resized images, on disk or S3, Cloudflare R2 and MinIO.'],
        ],
      },
      {
        name: 'Work as a team',
        items: [
          [
            'Drafts and versions',
            'Save drafts, keep the published page live, restore any earlier version.',
          ],
          ['Scheduling', 'Publish and unpublish at a set time, with a cron or the built-in timer.'],
          ['Live preview', 'See unsaved changes on the real page, side by side with the form.'],
        ],
      },
      {
        name: 'Ship it',
        items: [
          [
            'Nuxt, Next.js or standalone',
            'A Nuxt module, Next.js route handlers, or its own server for any frontend.',
          ],
          [
            'SQLite or Postgres',
            'Start with a file, deploy on Postgres. Migrations are generated from the config.',
          ],
          [
            'Thai and English',
            'The admin in both languages, and content in as many locales as you need.',
          ],
        ],
      },
      {
        name: 'Connect',
        items: [
          [
            'API keys',
            'Keys for scripts, other apps and AI assistants, limited to the collections they need.',
          ],
          [
            'Webhooks',
            'Signed events on publish and change, retried for a day, to rebuild a static site.',
          ],
          ['Email', 'SMTP or your own adapter, queued and retried, for forms and your hooks.'],
        ],
      },
    ],
    stepsTitle: 'From config to content in three steps',
    steps: [
      [
        'Describe your content',
        'Collections and fields in one TypeScript file. Types are inferred from it.',
      ],
      ['Open the admin', 'At /admin, in your app. Editors get forms, drafts, history and preview.'],
      [
        'Use it on your pages',
        'Read typed documents with the Local API, or over REST from any frontend.',
      ],
    ],
    tour: ['Dashboard', 'Posts', 'Live preview', 'Translate', 'Media'],
    pluginsTitle: 'Plugins',
    pluginsLead:
      'A plugin is a function over your config. It can add fields, REST endpoints, admin components, pages and dashboard panels.',
    plugins: [
      {
        id: 'seo',
        name: 'SEO',
        pkg: '@easy-cms/plugin-seo',
        text: 'Meta tags with length meters and a search preview, a sitemap, robots.txt, hreflang and structured data, and llms.txt for AI search.',
        link: '/guide/seo',
        shot: 'seo',
        alt: 'The SEO plugin in the post editor',
      },
      {
        id: 'forms',
        name: 'Form builder',
        pkg: '@easy-cms/plugin-form-builder',
        text: 'Editors build forms in the admin. Submissions are checked, stored, emailed over SMTP and summed up on an overview page, bots are kept out, and <easy-form> shows a form on any page.',
        link: '/guide/forms',
        shot: 'forms',
        alt: 'A contact form in the admin, with its submissions',
      },
      {
        id: 'redirects',
        name: 'Redirects',
        pkg: '@easy-cms/plugin-redirects',
        text: '301s editors manage under Settings, and a redirect by itself when a published page gets a new slug.',
        link: '/guide/redirects',
        shot: 'redirects',
        alt: 'Redirects under Settings, one open in a panel',
      },
      {
        id: 'nested-docs',
        name: 'Nested pages',
        pkg: '@easy-cms/plugin-nested-docs',
        text: 'Pages inside pages: a parent for each page, its full path and breadcrumbs kept right when a page above moves, and a tree in the admin.',
        link: '/guide/nested-docs',
        shot: 'nested-docs',
        alt: 'Pages as a tree in the admin',
      },
      {
        id: 'fields',
        name: 'Field types',
        pkg: '@easy-cms/fields',
        text: 'More field types for your collections, starting with color: a picker with your brand colors, a check on every save, and swatches in lists.',
        link: '/guide/field-types',
        shot: 'drawer',
        alt: 'A category with a color picker, and swatches in its list',
      },
      {
        id: 'mcp',
        name: 'MCP',
        pkg: '@easy-cms/plugin-mcp',
        text: 'Let AI assistants read and write your content through the Model Context Protocol, with an API key that limits what they can do.',
        link: '/guide/mcp',
        shot: 'api-keys',
        alt: 'An API key for an assistant, with its permissions',
      },
    ],
    pluginsShow: 'Show',
    pluginsGuide: 'Guide',
    pluginsWrite: 'Write your own plugin',
    compareTitle: 'Why embedded?',
    compareCols: ['SaaS headless CMS', 'Separate CMS server', 'Easy CMS'],
    compareRows: [
      ['Where it runs', 'Their cloud', 'A second app you host', 'Inside your Nuxt or Next.js app'],
      [
        'Content model',
        'Clicked together in a UI',
        'Code or UI',
        'TypeScript, in your repo and reviews',
      ],
      ['Your data', 'On their servers', 'Your database', 'Your database: SQLite or Postgres'],
      [
        'To deploy and pay for',
        'A subscription per seat or record',
        'Another server and database',
        'Nothing extra',
      ],
      [
        'Types in your pages',
        'Generated from an API',
        'Generated or shared',
        'Inferred from the config',
      ],
    ],
    ctaTitle: 'Try it in five minutes',
    ctaText: 'Create a project, open /admin, write your first post.',
    ctaGuide: 'Read the guide',
  },
  th: {
    badge: 'ใหม่ใน 0.31: ตรวจและทดสอบการตั้งค่าอีเมลในหน้า admin',
    badgeLink: 'email#checking-the-settings',
    title: 'CMS ที่อยู่',
    titleAccent: 'ในแอปของคุณ',
    tagline: 'กำหนดเนื้อหาด้วย TypeScript ได้หน้า admin, API ที่มี type และ plugin โดยไม่ต้องดูแล server แยก',
    start: 'เริ่มใช้งาน',
    github: 'GitHub',
    copy: 'คัดลอก',
    copied: 'คัดลอกแล้ว',
    heroAlt: 'หน้า admin ของ Easy CMS ขณะแก้ไขบทความ',
    featuresTitle: 'ครบทุกอย่างที่ทีมเนื้อหาต้องใช้',
    featuresLead: 'มีมาในตัว ไม่ต้องซื้อส่วนเสริม ไม่ต้องดูแลบริการที่สอง',
    groups: [
      {
        name: 'ออกแบบเนื้อหา',
        items: [
          ['Field และ blocks', 'field 15 ประเภท รวม group, array และ blocks ให้บรรณาธิการจัดหน้าเองได้'],
          ['Rich text', 'editor แบบ Tiptap ใส่รูปจากคลังสื่อได้ และแปลงเป็น HTML ที่ปลอดภัย'],
          ['คลังสื่อ', 'อัปโหลดพร้อมย่อรูปอัตโนมัติ เก็บบนดิสก์ หรือ S3, Cloudflare R2 และ MinIO'],
        ],
      },
      {
        name: 'ทำงานเป็นทีม',
        items: [
          ['ฉบับร่างและเวอร์ชัน', 'บันทึกร่างโดยหน้าเว็บที่เผยแพร่ยังอยู่ และย้อนกลับไปเวอร์ชันไหนก็ได้'],
          ['ตั้งเวลาเผยแพร่', 'เผยแพร่และยกเลิกตามเวลาที่ตั้ง ใช้ cron หรือตัวจับเวลาในตัว'],
          ['ตัวอย่างสด', 'เห็นการแก้ที่ยังไม่บันทึกบนหน้าเว็บจริง คู่กับฟอร์ม'],
        ],
      },
      {
        name: 'ขึ้นระบบจริง',
        items: [
          [
            'Nuxt, Next.js หรือ standalone',
            'เป็น Nuxt module, route handler ของ Next.js หรือ server ของตัวเองสำหรับ frontend ใดก็ได้',
          ],
          ['SQLite หรือ Postgres', 'เริ่มจากไฟล์ แล้ว deploy บน Postgres migration สร้างจาก config ให้'],
          ['ภาษาไทยและอังกฤษ', 'หน้า admin สองภาษา และเนื้อหาได้หลายภาษาตามต้องการ'],
        ],
      },
      {
        name: 'เชื่อมต่อ',
        items: [
          ['API keys', 'key สำหรับสคริปต์ แอปอื่น และผู้ช่วย AI จำกัดเฉพาะ collection ที่ต้องใช้'],
          ['Webhooks', 'event ที่ลงลายเซ็นเมื่อเผยแพร่หรือแก้ไข ส่งซ้ำได้นานหนึ่งวัน ใช้ build เว็บ static ใหม่'],
          ['อีเมล', 'ผ่าน SMTP หรือ adapter ของคุณเอง มีคิวและส่งซ้ำ ใช้กับฟอร์มและ hook ของคุณ'],
        ],
      },
    ],
    stepsTitle: 'จาก config ถึงเนื้อหาใน 3 ขั้น',
    steps: [
      ['อธิบายเนื้อหา', 'collection และ field ในไฟล์ TypeScript ไฟล์เดียว type สร้างจากไฟล์นี้'],
      ['เปิดหน้า admin', 'ที่ /admin ในแอปของคุณ บรรณาธิการได้ฟอร์ม ฉบับร่าง ประวัติ และตัวอย่างสด'],
      ['ใช้ในหน้าเว็บ', 'อ่านเอกสารแบบมี type ด้วย Local API หรือผ่าน REST จาก frontend ใดก็ได้'],
    ],
    tour: ['แดชบอร์ด', 'บทความ', 'ตัวอย่างสด', 'แปลภาษา', 'คลังสื่อ'],
    pluginsTitle: 'Plugins',
    pluginsLead:
      'plugin คือฟังก์ชันที่ปรับ config เพิ่ม field, REST endpoint, component หน้าของตัวเอง และกล่องบนแดชบอร์ดในหน้า admin ได้',
    plugins: [
      {
        id: 'seo',
        name: 'SEO',
        pkg: '@easy-cms/plugin-seo',
        text: 'meta tag พร้อมตัวนับความยาวและตัวอย่างผลการค้นหา sitemap, robots.txt, hreflang ข้อมูลแบบมีโครงสร้าง และ llms.txt สำหรับการค้นหาด้วย AI',
        link: '/th/guide/seo',
        shot: 'seo',
        alt: 'plugin SEO ในหน้าแก้ไขบทความ',
      },
      {
        id: 'forms',
        name: 'Form builder',
        pkg: '@easy-cms/plugin-form-builder',
        text: 'ผู้แก้เนื้อหาสร้างฟอร์มเองในหน้า admin ข้อมูลที่ส่งมาผ่านการตรวจ ถูกเก็บ แจ้งทางอีเมลผ่าน SMTP และสรุปในหน้าภาพรวม กันบอทได้ และ <easy-form> แสดงฟอร์มในหน้าเว็บใดก็ได้',
        link: '/th/guide/forms',
        shot: 'forms',
        alt: 'ฟอร์มติดต่อในหน้า admin พร้อมข้อมูลที่ส่งมา',
      },
      {
        id: 'redirects',
        name: 'Redirects',
        pkg: '@easy-cms/plugin-redirects',
        text: 'redirect 301 ที่ผู้แก้จัดการเองใต้ตั้งค่า และสร้างให้เองเมื่อ slug ของหน้าที่เผยแพร่แล้วเปลี่ยน',
        link: '/th/guide/redirects',
        shot: 'redirects',
        alt: 'รายการ redirect ใต้ตั้งค่า เปิดแก้หนึ่งรายการในแผงด้านข้าง',
      },
      {
        id: 'nested-docs',
        name: 'หน้าย่อย',
        pkg: '@easy-cms/plugin-nested-docs',
        text: 'หน้าซ้อนในหน้า: แต่ละหน้ามีหน้าแม่ path เต็มและ breadcrumbs ที่ถูกต้องเสมอเมื่อหน้าด้านบนย้ายที่ และแสดงเป็นต้นไม้ในหน้า admin',
        link: '/th/guide/nested-docs',
        shot: 'nested-docs',
        alt: 'หน้าต่าง ๆ แสดงเป็นต้นไม้ในหน้า admin',
      },
      {
        id: 'fields',
        name: 'ชนิด field',
        pkg: '@easy-cms/fields',
        text: 'ชนิด field เพิ่มเติมสำหรับ collection เริ่มจากสี: ตัวเลือกสีพร้อมสีของแบรนด์ ตรวจค่าทุกครั้งที่บันทึก และแสดงจุดสีในหน้ารายการ',
        link: '/th/guide/field-types',
        shot: 'drawer',
        alt: 'หมวดหมู่ที่มีตัวเลือกสี และจุดสีในหน้ารายการ',
      },
      {
        id: 'mcp',
        name: 'MCP',
        pkg: '@easy-cms/plugin-mcp',
        text: 'ให้ผู้ช่วย AI อ่านและเขียนเนื้อหาผ่าน Model Context Protocol ด้วย API key ที่จำกัดว่าทำอะไรได้บ้าง',
        link: '/th/guide/mcp',
        shot: 'api-keys',
        alt: 'API key ของผู้ช่วย AI พร้อมสิทธิ์ที่ติ๊กไว้',
      },
    ],
    pluginsShow: 'ดูตัวอย่าง',
    pluginsGuide: 'คู่มือ',
    pluginsWrite: 'เขียน plugin เอง',
    compareTitle: 'ทำไมต้องฝังในแอป',
    compareCols: ['Headless CMS แบบ SaaS', 'CMS ที่แยก server', 'Easy CMS'],
    compareRows: [
      ['ทำงานที่ไหน', 'cloud ของผู้ให้บริการ', 'แอปที่สองที่คุณต้องดูแล', 'ในแอป Nuxt หรือ Next.js ของคุณ'],
      ['content model', 'คลิกสร้างใน UI', 'โค้ดหรือ UI', 'TypeScript อยู่ใน repo และผ่าน code review'],
      ['ข้อมูลของคุณ', 'อยู่บน server ของเขา', 'ฐานข้อมูลของคุณ', 'ฐานข้อมูลของคุณ: SQLite หรือ Postgres'],
      ['ต้อง deploy และจ่ายเพิ่ม', 'ค่าบริการตามผู้ใช้หรือจำนวนข้อมูล', 'server และฐานข้อมูลอีกชุด', 'ไม่มี'],
      ['type ในหน้าเว็บ', 'generate จาก API', 'generate หรือแชร์กัน', 'สร้างจาก config โดยตรง'],
    ],
    ctaTitle: 'ลองได้ใน 5 นาที',
    ctaText: 'สร้างโปรเจกต์ เปิด /admin แล้วเขียนบทความแรก',
    ctaGuide: 'อ่านคู่มือ',
  },
} as const

const t = computed(() => COPY[props.lang])
const prefix = computed(() => (props.lang === 'th' ? '/th' : ''))
const guide = (slug: string) => withBase(`${prefix.value}/guide/${slug}`)

const shot = (name: string) =>
  withBase(`/screenshots/${name}-${props.lang}-${isDark.value ? 'dark' : 'light'}.webp`)

const TOUR = ['dashboard', 'posts', 'preview', 'translate', 'media'] as const
const tour = ref(0)

const command = 'npx create-easy-cms'
const copied = ref(false)
async function copy() {
  try {
    await navigator.clipboard.writeText(command)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 1500)
  } catch {
    // Clipboard blocked: the command is still selectable.
  }
}

const tab = ref<'nuxt' | 'next'>('nuxt')
/** The plugin whose screenshot and code show next to the cards. */
const shown = ref(0)
function show(i: number) {
  shown.value = i
  // One column (phones): the example is below the cards, so bring it into view.
  if (window.matchMedia('(max-width: 960px)').matches)
    document
      .getElementById('plugin-example')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** Lucide paths (MIT) for the feature cards, in the order of the groups above. */
const ICONS = [
  'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  'M4 7V4h16v3M9 20h6M12 4v16',
  'M21 15l-5-5L5 21M3 3h18v18H3zM9 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2',
  'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8',
  'M12 6v6l4 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20',
  'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  'M16 18l6-6-6-6M8 6l-6 6 6 6',
  'M3 5c0-1.7 4-3 9-3s9 1.3 9 3-4 3-9 3-9-1.3-9-3M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5M3 12c0 1.7 4 3 9 3s9-1.3 9-3',
  'M5 8l6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6',
  'M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4zM16.5 7.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1',
  'M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2M6 17l3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06M12 6l3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8',
  'M22 7l-8.99 5.73a2 2 0 0 1-2.02 0L2 7M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
]
</script>

<template>
  <div class="home">
    <!-- Hero -->
    <section class="hero container">
      <div class="hero-text">
        <a class="badge" :href="guide(t.badgeLink)">{{ t.badge }} <span aria-hidden="true">→</span></a>
        <h1>
          {{ t.title }} <span class="accent">{{ t.titleAccent }}</span>
        </h1>
        <p class="tagline">{{ t.tagline }}</p>
        <div class="actions">
          <a class="btn brand" :href="guide('getting-started')">{{ t.start }}</a>
          <a class="btn alt" href="https://github.com/maritonx/easy-cms">{{ t.github }}</a>
        </div>
        <div class="command">
          <code><span class="prompt" aria-hidden="true">$</span> {{ command }}</code>
          <button type="button" :aria-label="t.copy" @click="copy">{{ copied ? t.copied : t.copy }}</button>
        </div>
      </div>
      <figure class="frame hero-shot">
        <div class="frame-bar" aria-hidden="true"><i /><i /><i /><span>localhost:3000/admin</span></div>
        <img :src="shot('edit')" :alt="t.heroAlt" width="1440" height="900" />
      </figure>
    </section>

    <!-- Features -->
    <section class="section container">
      <h2>{{ t.featuresTitle }}</h2>
      <p class="lead">{{ t.featuresLead }}</p>
      <div class="groups">
        <div v-for="(group, g) in t.groups" :key="group.name" class="group">
          <h3>{{ group.name }}</h3>
          <div v-for="([name, text], i) in group.items" :key="name" class="feature">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="ICONS[g * 3 + i]" /></svg>
            <div>
              <h4>{{ name }}</h4>
              <p>{{ text }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Three steps -->
    <section class="section container">
      <h2>{{ t.stepsTitle }}</h2>
      <div class="step">
        <div class="step-text">
          <span class="num">1</span>
          <h3>{{ t.steps[0][0] }}</h3>
          <p>{{ t.steps[0][1] }}</p>
        </div>
        <div class="vp-doc code"><slot name="config" /></div>
      </div>
      <div class="step">
        <div class="step-text">
          <span class="num">2</span>
          <h3>{{ t.steps[1][0] }}</h3>
          <p>{{ t.steps[1][1] }}</p>
          <div class="tour" role="tablist">
            <button
              v-for="(name, i) in t.tour"
              :key="name"
              type="button"
              role="tab"
              :aria-selected="tour === i"
              :class="{ active: tour === i }"
              @click="tour = i"
            >
              {{ name }}
            </button>
          </div>
        </div>
        <figure class="frame">
          <img :src="shot(TOUR[tour])" :alt="t.tour[tour]" width="1440" height="900" loading="lazy" />
        </figure>
      </div>
      <div class="step">
        <div class="step-text">
          <span class="num">3</span>
          <h3>{{ t.steps[2][0] }}</h3>
          <p>{{ t.steps[2][1] }}</p>
          <div class="tour" role="tablist">
            <button type="button" role="tab" :aria-selected="tab === 'nuxt'" :class="{ active: tab === 'nuxt' }" @click="tab = 'nuxt'">Nuxt</button>
            <button type="button" role="tab" :aria-selected="tab === 'next'" :class="{ active: tab === 'next' }" @click="tab = 'next'">Next.js</button>
          </div>
        </div>
        <div class="vp-doc code">
          <div v-show="tab === 'nuxt'"><slot name="nuxt" /></div>
          <div v-show="tab === 'next'"><slot name="next" /></div>
        </div>
      </div>
    </section>

    <!-- Plugins -->
    <section class="section container">
      <h2>{{ t.pluginsTitle }}</h2>
      <p class="lead">{{ t.pluginsLead }}</p>
      <div class="plugins">
        <div class="plugin-cards">
          <div
            v-for="(plugin, i) in t.plugins"
            :key="plugin.id"
            class="plugin"
            :class="{ active: shown === i }"
          >
            <div class="plugin-head">
              <h3>{{ plugin.name }}</h3>
              <button
                type="button"
                class="show"
                :aria-pressed="shown === i"
                :aria-label="`${t.pluginsShow}: ${plugin.name}`"
                aria-controls="plugin-example"
                @click="show(i)"
              >
                {{ t.pluginsShow }}
              </button>
            </div>
            <code>{{ plugin.pkg }}</code>
            <p>{{ plugin.text }}</p>
            <a class="guide-link" :href="withBase(plugin.link)">{{ t.pluginsGuide }} →</a>
          </div>
          <a class="more" :href="guide('plugins')">{{ t.pluginsWrite }} →</a>
        </div>
        <div id="plugin-example" class="plugin-example" aria-live="polite">
          <figure class="frame">
            <img
              :src="shot(t.plugins[shown].shot)"
              :alt="t.plugins[shown].alt"
              width="1440"
              height="900"
              loading="lazy"
            />
          </figure>
          <div class="vp-doc code">
            <div v-show="shown === 0"><slot name="plugin-seo" /></div>
            <div v-show="shown === 1"><slot name="plugin-forms" /></div>
            <div v-show="shown === 2"><slot name="plugin-redirects" /></div>
            <div v-show="shown === 3"><slot name="plugin-nested-docs" /></div>
            <div v-show="shown === 4"><slot name="plugin-fields" /></div>
            <div v-show="shown === 5"><slot name="plugin-mcp" /></div>
          </div>
        </div>
      </div>
    </section>

    <!-- Comparison -->
    <section class="section container">
      <h2>{{ t.compareTitle }}</h2>
      <div class="table">
        <table>
          <thead>
            <tr>
              <th />
              <th v-for="(col, i) in t.compareCols" :key="col" :class="{ ours: i === 2 }">{{ col }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in t.compareRows" :key="row[0]">
              <th scope="row">{{ row[0] }}</th>
              <td v-for="(cell, i) in row.slice(1)" :key="i" :class="{ ours: i === 2 }">{{ cell }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- CTA -->
    <section class="cta container">
      <h2>{{ t.ctaTitle }}</h2>
      <p>{{ t.ctaText }}</p>
      <div class="command">
        <code><span class="prompt" aria-hidden="true">$</span> {{ command }}</code>
        <button type="button" :aria-label="t.copy" @click="copy">{{ copied ? t.copied : t.copy }}</button>
      </div>
      <a class="btn brand" :href="guide('getting-started')">{{ t.ctaGuide }}</a>
    </section>
  </div>
</template>

<style scoped>
.home {
  padding-bottom: 64px;
}
/* The home layout renders this inside .vp-doc; undo its heading rules and table layout. */
.home h2 {
  margin: 0;
  padding-top: 0;
  border-top: 0;
}
.home table {
  display: table;
  margin: 0;
}
.home tr {
  background: transparent;
  border-top: 0;
}
.home th,
.home td {
  border-left: 0;
  border-right: 0;
}
.home a:hover {
  text-decoration: none;
}
.container {
  max-width: 1152px;
  margin: 0 auto;
  padding: 0 24px;
}
h1,
h2,
h3,
h4 {
  margin: 0;
  color: var(--vp-c-text-1);
}
p {
  margin: 0;
}

/* Hero */
.hero {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
  gap: 48px;
  align-items: center;
  padding-top: 56px;
}
.badge {
  display: inline-flex;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
}
.hero h1 {
  margin-top: 20px;
  font-size: clamp(36px, 5vw, 56px);
  line-height: 1.1;
  letter-spacing: -0.02em;
  font-weight: 700;
}
.accent {
  color: var(--vp-c-brand-1);
}
.tagline {
  margin-top: 20px;
  font-size: 18px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 28px;
}
.btn {
  display: inline-flex;
  align-items: center;
  padding: 0 20px;
  height: 44px;
  border-radius: 22px;
  font-weight: 600;
  text-decoration: none;
  transition: background-color 0.2s;
}
.btn.brand {
  background: var(--vp-button-brand-bg);
  color: var(--vp-button-brand-text);
}
.btn.brand:hover {
  background: var(--vp-button-brand-hover-bg);
}
.btn.alt {
  background: var(--vp-button-alt-bg);
  color: var(--vp-button-alt-text);
}
.btn.alt:hover {
  background: var(--vp-button-alt-hover-bg);
}
.command {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  margin-top: 20px;
  padding: 6px 6px 6px 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
  width: fit-content;
}
.command code {
  overflow-x: auto;
  white-space: nowrap;
  font-size: 14px;
  color: var(--vp-c-text-1);
  background: none;
}
.prompt {
  color: var(--vp-c-text-3);
  user-select: none;
}
.command button {
  flex-shrink: 0;
  padding: 6px 12px;
  border-radius: 8px;
  background: var(--vp-c-default-soft);
  color: var(--vp-c-text-1);
  font-size: 13px;
  font-weight: 500;
}
.command button:hover {
  background: var(--vp-c-default-2);
}
.frame {
  margin: 0;
  overflow: hidden;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
  box-shadow: 0 24px 48px -24px rgb(0 0 0 / 25%);
}
.frame img {
  display: block;
  width: 100%;
  height: auto;
}
.frame-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--vp-c-divider);
}
.frame-bar i {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--vp-c-divider);
}
.frame-bar span {
  margin-left: 12px;
  font-size: 12px;
  color: var(--vp-c-text-3);
}

/* Sections */
.section {
  margin-top: 112px;
}
.section > h2,
.cta h2 {
  font-size: clamp(26px, 3.4vw, 34px);
  line-height: 1.25;
  letter-spacing: -0.01em;
}
.lead {
  margin-top: 12px;
  max-width: 640px;
  font-size: 17px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}

.groups {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;
  margin-top: 40px;
}
.group {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 16px;
  background: var(--vp-c-bg-soft);
}
.group h3 {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--vp-c-brand-1);
}
.feature {
  display: flex;
  gap: 14px;
}
.feature svg {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  padding: 8px;
  border-radius: 10px;
  background: var(--vp-c-brand-soft);
  fill: none;
  stroke: var(--vp-c-brand-1);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.feature h4 {
  font-size: 16px;
  font-weight: 600;
}
.feature p {
  margin-top: 4px;
  font-size: 14px;
  line-height: 1.55;
  color: var(--vp-c-text-2);
}

.step {
  display: grid;
  grid-template-columns: minmax(0, 4fr) minmax(0, 7fr);
  gap: 40px;
  align-items: start;
  margin-top: 48px;
}
.num {
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--vp-c-brand-1);
  color: var(--vp-c-white);
  font-weight: 700;
}
.step h3 {
  margin-top: 14px;
  font-size: 20px;
}
.step-text p {
  margin-top: 8px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}
.code :deep(div[class*='language-']) {
  margin: 0;
}
.tour {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 20px;
}
.tour button {
  padding: 6px 14px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  font-size: 14px;
  color: var(--vp-c-text-2);
}
.tour button:hover {
  color: var(--vp-c-text-1);
}
.tour button.active {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  font-weight: 600;
}

.plugins {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
  gap: 40px;
  align-items: start;
  margin-top: 40px;
}
.plugin-cards {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.plugin {
  display: block;
  padding: 20px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 14px;
  background: var(--vp-c-bg-soft);
  color: inherit;
  text-decoration: none;
  transition: border-color 0.2s;
}
.plugin.active {
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 0 0 1px var(--vp-c-brand-1);
}
.plugin-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.plugin h3 {
  font-size: 18px;
}
.show {
  padding: 4px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.show:hover,
.show[aria-pressed='true'] {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}
.show:focus-visible,
.guide-link:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}
.guide-link {
  display: inline-block;
  margin-top: 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--vp-c-brand-1);
  text-decoration: none;
}
.plugin-example {
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: sticky;
  top: calc(var(--vp-nav-height, 64px) + 24px);
}
.plugin code {
  display: inline-block;
  margin-top: 6px;
  font-size: 13px;
  color: var(--vp-c-text-2);
}
.plugin p {
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}
.more {
  font-weight: 600;
  color: var(--vp-c-brand-1);
  text-decoration: none;
}

.table {
  margin-top: 32px;
  overflow-x: auto;
  border: 1px solid var(--vp-c-divider);
  border-radius: 14px;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 15px;
}
th,
td {
  padding: 14px 18px;
  border-bottom: 1px solid var(--vp-c-divider);
  text-align: left;
  vertical-align: top;
  line-height: 1.5;
}
tbody tr:last-child th,
tbody tr:last-child td {
  border-bottom: 0;
}
thead th {
  font-size: 14px;
  color: var(--vp-c-text-2);
}
tbody th {
  font-weight: 600;
  white-space: nowrap;
}
td {
  color: var(--vp-c-text-2);
}
.ours {
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-text-1);
  font-weight: 600;
}

.cta {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-top: 112px;
  padding-top: 56px;
  padding-bottom: 56px;
  border-radius: 24px;
  background: var(--vp-c-bg-soft);
  text-align: center;
}
.cta p {
  color: var(--vp-c-text-2);
  font-size: 17px;
}
.cta .command {
  margin: 16px 0 12px;
}

@media (max-width: 960px) {
  .hero,
  .step,
  .plugins {
    grid-template-columns: minmax(0, 1fr);
  }
  .groups {
    grid-template-columns: minmax(0, 1fr);
  }
  .plugin-example {
    position: static;
  }
  .section {
    margin-top: 80px;
  }
  .cta {
    margin-left: 16px;
    margin-right: 16px;
  }
}
</style>
