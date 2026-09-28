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
    badge: 'New in 0.15: API keys and MCP for AI assistants',
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
      'A plugin is a function over your config. It can add fields, REST endpoints and admin components.',
    plugins: [
      {
        name: 'SEO',
        pkg: '@easy-cms/plugin-seo',
        text: 'Meta title, description and share image, with length meters, a search preview and Generate buttons. seoMeta() fills your page metadata.',
        link: '/guide/seo',
        status: 'Available',
      },
      {
        name: 'MCP',
        pkg: '@easy-cms/plugin-mcp',
        text: 'Let AI assistants read and write your content through the Model Context Protocol, with API keys and per-collection permissions.',
        link: '/guide/mcp',
        status: 'Available',
      },
    ],
    pluginsWrite: 'Write your own plugin',
    seoAlt: 'The SEO plugin in the post editor',
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
    badge: 'ใหม่ใน 0.15: API key และ MCP สำหรับผู้ช่วย AI',
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
    ],
    stepsTitle: 'จาก config ถึงเนื้อหาใน 3 ขั้น',
    steps: [
      ['อธิบายเนื้อหา', 'collection และ field ในไฟล์ TypeScript ไฟล์เดียว type สร้างจากไฟล์นี้'],
      ['เปิดหน้า admin', 'ที่ /admin ในแอปของคุณ บรรณาธิการได้ฟอร์ม ฉบับร่าง ประวัติ และตัวอย่างสด'],
      ['ใช้ในหน้าเว็บ', 'อ่านเอกสารแบบมี type ด้วย Local API หรือผ่าน REST จาก frontend ใดก็ได้'],
    ],
    tour: ['แดชบอร์ด', 'บทความ', 'ตัวอย่างสด', 'แปลภาษา', 'คลังสื่อ'],
    pluginsTitle: 'Plugins',
    pluginsLead: 'plugin คือฟังก์ชันที่ปรับ config เพิ่ม field, REST endpoint และ component ในหน้า admin ได้',
    plugins: [
      {
        name: 'SEO',
        pkg: '@easy-cms/plugin-seo',
        text: 'ชื่อ คำอธิบาย และรูปสำหรับแชร์ พร้อมตัวนับความยาว ตัวอย่างผลการค้นหา และปุ่มสร้างให้ ส่วน seoMeta() เติม metadata ให้หน้าเว็บ',
        link: '/th/guide/seo',
        status: 'พร้อมใช้',
      },
      {
        name: 'MCP',
        pkg: '@easy-cms/plugin-mcp',
        text: 'ให้ผู้ช่วย AI อ่านและเขียนเนื้อหาผ่าน Model Context Protocol โดยใช้ API key และสิทธิ์แยกตาม collection',
        link: '/th/guide/mcp',
        status: 'พร้อมใช้',
      },
    ],
    pluginsWrite: 'เขียน plugin เอง',
    seoAlt: 'plugin SEO ในหน้าแก้ไขบทความ',
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
]
</script>

<template>
  <div class="home">
    <!-- Hero -->
    <section class="hero container">
      <div class="hero-text">
        <a class="badge" :href="guide('mcp')">{{ t.badge }} <span aria-hidden="true">→</span></a>
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
          <component
            :is="plugin.link ? 'a' : 'div'"
            v-for="plugin in t.plugins"
            :key="plugin.name"
            class="plugin"
            :class="{ soon: !plugin.link }"
            :href="plugin.link ? withBase(plugin.link) : undefined"
          >
            <div class="plugin-head">
              <h3>{{ plugin.name }}</h3>
              <span class="status">{{ plugin.status }}</span>
            </div>
            <code>{{ plugin.pkg }}</code>
            <p>{{ plugin.text }}</p>
          </component>
          <div class="vp-doc code"><slot name="plugin" /></div>
          <a class="more" :href="guide('plugins')">{{ t.pluginsWrite }} →</a>
        </div>
        <figure class="frame">
          <img :src="shot('seo')" :alt="t.seoAlt" width="1440" height="900" loading="lazy" />
        </figure>
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
  grid-template-columns: repeat(3, minmax(0, 1fr));
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
a.plugin:hover {
  border-color: var(--vp-c-brand-1);
}
.plugin.soon {
  border-style: dashed;
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
.status {
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  font-size: 12px;
  font-weight: 600;
}
.soon .status {
  background: var(--vp-c-default-soft);
  color: var(--vp-c-text-2);
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
  .section {
    margin-top: 80px;
  }
  .cta {
    margin-left: 16px;
    margin-right: 16px;
  }
}
</style>
