// Screenshots of the admin for the docs site: `pnpm docs:screenshots` (after `pnpm build`).
// Starts the Nuxt example on a temporary database, adds sample content in Thai and English,
// and saves every shot in both languages and both themes to website/public/screenshots.
import { type ChildProcess, spawn } from 'node:child_process'
import { createHash, createHmac, randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Page } from '@playwright/test'
import sharp from 'sharp'
import { type MockProvider, startMockProvider } from '../packages/auth-oauth/test/mock-provider.ts'

const PORT = 3210
const ORIGIN = `http://localhost:${PORT}`
const API = `${ORIGIN}/api/cms`
const OUT = fileURLToPath(new URL('../website/public/screenshots/', import.meta.url))
const EXAMPLE = fileURLToPath(new URL('../examples/nuxt-blog/', import.meta.url))
// A throwaway account on a throwaway database.
const ADMIN = {
  email: 'editor@example.com',
  password: randomBytes(12).toString('hex'),
  name: 'Ploy',
}

const scratch = mkdtempSync(join(tmpdir(), 'easy-cms-shots-'))
let server: ChildProcess | undefined
let oidc: MockProvider | undefined

/** The CMS's secret, to sign an invitation link like its email would have it. */
const SECRET = randomBytes(24).toString('hex')

/** An invitation token for a user without a password (see auth/tokens.ts in core). */
function inviteToken(userId: number) {
  const payload = Buffer.from(
    JSON.stringify({ u: String(userId), p: 'invite', e: Date.now() + 3_600_000 }),
  ).toString('base64url')
  const fingerprint = createHash('sha256').update('no-password').digest('base64url').slice(0, 22)
  return `${payload}.${createHmac('sha256', SECRET).update(`password:${payload}:${fingerprint}`).digest('base64url')}`
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  // A sign-in provider, for the single sign-on pages.
  oidc = await startMockProvider()
  server = spawn('pnpm', ['exec', 'nuxi', 'dev', '--port', String(PORT)], {
    cwd: EXAMPLE,
    stdio: 'ignore',
    env: {
      ...process.env,
      EASY_CMS_SECRET: SECRET,
      DATABASE_URL: `file:${join(scratch, 'shots.db')}`,
      NUXT_TELEMETRY_DISABLED: '1',
      OIDC_ISSUER: oidc.url,
      OIDC_NAME: 'Company SSO',
      OIDC_CLIENT_ID: oidc.clientId,
      OIDC_CLIENT_SECRET: oidc.clientSecret,
    },
  })
  await waitFor(`${API}/users/init`)
  const ids = await seed()

  const browser = await chromium.launch(process.env.CI ? {} : { channel: 'chrome' })
  try {
    for (const locale of ['en', 'th'] as const) {
      for (const theme of ['light', 'dark'] as const) {
        const context = await browser.newContext({
          viewport: { width: 1440, height: 900 },
          colorScheme: theme,
        })
        await context.addInitScript(
          ([l, t]) => {
            localStorage.setItem('easy-cms-locale', l as string)
            localStorage.setItem('easy-cms-theme', t as string)
            // Content in the same language as the admin.
            localStorage.setItem('easy-cms-content-locale', l as string)
          },
          [locale, theme],
        )
        const page = await context.newPage()
        await login(page)
        const shot = async (name: string) => {
          await page.waitForTimeout(400)
          const png = await page.screenshot()
          await sharp(png)
            .webp({ quality: 80 })
            .toFile(join(OUT, `${name}-${locale}-${theme}.webp`))
          console.log(`  ${name}-${locale}-${theme}.webp`)
        }
        const t = locale === 'th' ? TH : EN

        await page.goto(`${ORIGIN}/admin/`)
        await page.getByRole('heading', { level: 1 }).waitFor()
        await shot('dashboard')

        await page.goto(`${ORIGIN}/admin/collections/posts`)
        await page.getByRole('row').nth(3).waitFor()
        await shot('posts')

        await page.goto(`${ORIGIN}/admin/collections/posts/${ids.featured}`)
        await page.locator('.rte-content').waitFor()
        await shot('edit')

        await page.getByRole('region', { name: t.preview }).scrollIntoViewIfNeeded()
        await shot('seo')

        // The post's gallery: an upload field with hasMany.
        const gallery = page.getByRole('group', { name: t.gallery })
        await gallery.locator('img').first().waitFor()
        // In the middle of the window: the editor's header covers the top.
        await gallery.evaluate((el) => el.scrollIntoView({ block: 'center' }))
        await shot('gallery')

        await page.goto(`${ORIGIN}/admin/collections/posts/${ids.featured}`)
        await page.locator('.rte-content').waitFor()
        // The other language's tab: the same post, translated.
        await page.getByRole('button', { name: t.other, exact: true }).click()
        await page.locator('.rte-content').waitFor()
        await shot('translate')
        await page.getByRole('button', { name: t.same, exact: true }).click()

        await page.getByRole('button', { name: t.showPreview }).click()
        await page.frameLocator('iframe').getByRole('heading', { level: 1 }).waitFor()
        await shot('preview')

        await page.goto(`${ORIGIN}/admin/collections/media`)
        await page.locator('img').nth(2).waitFor()
        await shot('media')

        await page.goto(`${ORIGIN}/admin/collections/categories?edit=${ids.category}`)
        await page.getByRole('dialog').waitFor()
        await shot('drawer')

        // Plugins: a form with its submissions panel, redirects under Settings, a new API key.
        await page.goto(`${ORIGIN}/admin/collections/forms/${ids.form}`)
        await page.getByRole('region', { name: t.submissions }).getByText(/\d/).waitFor()
        await shot('forms')

        await page.goto(`${ORIGIN}/admin/p/forms-overview`)
        await page.locator('ecms-forms-overview tbody tr').first().waitFor()
        await shot('forms-overview')

        await page.goto(`${ORIGIN}/admin/backups`)
        await page.locator('#settings-heading').waitFor()
        await shot('backups')

        await page.goto(`${ORIGIN}/admin/roles?role=editor`)
        await page.locator('#content-heading').waitFor()
        await shot('roles')

        await page.goto(`${ORIGIN}/admin/email`)
        await page.locator('#settings-heading').waitFor()
        await shot('email-settings')

        await page.goto(`${ORIGIN}/admin/collections/redirects?edit=${ids.redirect}`)
        await page.getByRole('dialog').waitFor()
        await shot('redirects')

        // Nested pages: the tree with About open, and a page's side panel.
        await page.goto(`${ORIGIN}/admin/collections/pages`)
        await page.getByRole('button', { name: t.expandAbout }).click()
        await page.getByRole('link', { name: t.team, exact: true }).waitFor()
        await shot('nested-docs')
        await page.goto(`${ORIGIN}/admin/collections/pages/${ids.team}`)
        await page.getByRole('list', { name: t.trail }).waitFor()
        await shot('nested-docs-page')

        // An invitation link, as the invited person sees it.
        await page.goto(
          `${ORIGIN}/admin/reset-password?token=${encodeURIComponent(inviteToken(ids.invited))}`,
        )
        await page.getByRole('heading', { name: t.inviteTitle }).waitFor()
        await shot('reset-password')

        await page.goto(`${ORIGIN}/admin/collections/api-keys/new`)
        await page.getByRole('textbox').first().fill(t.keyName)
        // Posts: read, create and update; media: read and create.
        const boxes = page.getByRole('checkbox')
        await boxes.first().waitFor()
        for (const name of t.keyChecks)
          await page.getByRole('checkbox', { name, exact: true }).check()
        await shot('api-keys')

        // The form on the site, as visitors see it (the example blog has no dark theme).
        await page.goto(`${ORIGIN}/contact${locale === 'en' ? '?locale=en' : ''}`)
        await page.locator('easy-form form').waitFor()
        await shot('form-page')

        await page.goto(`${ORIGIN}/admin/audit`)
        await page.locator('.entry').first().waitFor()
        await page.locator('.entry .row').nth(1).click()
        await shot('audit')

        await page.goto(`${ORIGIN}/admin/sso`)
        await page.locator('#who-heading').waitFor()
        await shot('sso')

        // Signed out: the login page with the provider's button.
        await context.clearCookies()
        await page.goto(`${ORIGIN}/admin/login`)
        await page.getByRole('link', { name: /Company SSO/ }).waitFor()
        await shot('login-sso')

        await context.close()
      }
    }
  } finally {
    await browser.close()
  }
}

const EN = {
  preview: 'Search result preview',
  same: 'English',
  other: 'Thai',
  showPreview: 'Preview',
  submissions: 'Submissions',
  keyName: 'Writing assistant',
  keyChecks: ['Posts: Read', 'Posts: Create', 'Posts: Update', 'Media: Read', 'Media: Upload'],
  // Lists show the default language (Thai).
  gallery: 'Gallery',
  inviteTitle: 'Set your password',
  expandAbout: 'Show pages under เกี่ยวกับเรา',
  team: 'ทีมงาน',
  trail: 'Where this page sits',
}
const TH = {
  preview: 'ตัวอย่างผลการค้นหา',
  same: 'ไทย',
  other: 'อังกฤษ',
  showPreview: 'ดูตัวอย่าง',
  submissions: 'ข้อมูลที่ส่งมา',
  keyName: 'ผู้ช่วยเขียนบทความ',
  keyChecks: ['บทความ: อ่าน', 'บทความ: สร้าง', 'บทความ: แก้ไข', 'คลังสื่อ: อ่าน', 'คลังสื่อ: อัปโหลด'],
  gallery: 'แกลเลอรี',
  inviteTitle: 'ตั้งรหัสผ่านของคุณ',
  expandAbout: 'แสดงหน้าย่อยของ เกี่ยวกับเรา',
  team: 'ทีมงาน',
  trail: 'ตำแหน่งของหน้านี้',
}

async function login(page: Page) {
  await page.goto(`${ORIGIN}/admin/login`)
  await page.locator('input[type="email"]').fill(ADMIN.email)
  await page.locator('input[type="password"]').fill(ADMIN.password)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(`${ORIGIN}/admin/`)
}

async function waitFor(url: string) {
  for (let i = 0; i < 180; i++) {
    const ok = await fetch(url)
      .then((r) => r.ok)
      .catch(() => false)
    if (ok) return
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`${url} did not come up`)
}

/** A REST client logged in as the first admin. */
async function client() {
  const register = await fetch(`${API}/users/first-register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify(ADMIN),
  })
  if (!register.ok) throw new Error(`first-register: ${register.status} ${await register.text()}`)
  const { csrfToken } = (await register.json()) as { csrfToken: string }
  const cookie = register.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')
  const headers = { cookie, 'x-csrf-token': csrfToken, origin: ORIGIN }
  return async (method: string, path: string, body?: unknown) => {
    const form = body instanceof FormData
    const response = await fetch(`${API}${path}`, {
      method,
      headers: form ? headers : { ...headers, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: form ? body : JSON.stringify(body) }),
    })
    if (!response.ok)
      throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`)
    return (await response.json()) as Record<string, unknown> & { id: number }
  }
}

/** A soft gradient cover with a few shapes, so the media library and posts look real. */
async function cover(
  hue: number,
  name: string,
  alt: string,
  call: Awaited<ReturnType<typeof client>>,
) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue} 55% 42%)"/><stop offset="1" stop-color="hsl(${hue + 40} 60% 70%)"/>
    </linearGradient></defs>
    <rect width="1200" height="630" fill="url(#g)"/>
    <circle cx="930" cy="170" r="190" fill="white" fill-opacity="0.16"/>
    <circle cx="220" cy="520" r="260" fill="white" fill-opacity="0.1"/>
    <rect x="120" y="150" width="520" height="44" rx="22" fill="white" fill-opacity="0.85"/>
    <rect x="120" y="224" width="380" height="28" rx="14" fill="white" fill-opacity="0.55"/>
  </svg>`
  const png = await sharp(Buffer.from(svg)).png().toBuffer()
  const form = new FormData()
  form.set('file', new File([png], `${name}.png`, { type: 'image/png' }))
  form.set('alt', alt)
  return call('POST', '/media?depth=0', form)
}

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const heading = (text: string) => ({
  type: 'heading',
  attrs: { level: 2 },
  content: [{ type: 'text', text }],
})
const doc = (...content: unknown[]) => ({ type: 'doc', content })

async function seed() {
  const call = await client()
  const me = (await call('GET', '/users/me')) as unknown as { user: { id: number } }
  const guides = await call('POST', '/categories', { name: 'คู่มือ', color: '#2f6f5e' })
  await call('POST', '/categories', { name: 'ข่าว', color: '#2563eb' })
  await call('POST', '/categories', { name: 'เบื้องหลัง', color: '#e8a33d' })
  const covers = [
    await cover(162, 'getting-started', 'ภาพปก: เริ่มต้นใช้งาน', call),
    await cover(210, 'content-model', 'ภาพปก: content model', call),
    await cover(28, 'seo-plugin', 'ภาพปก: plugin SEO', call),
    await cover(280, 'thai-slugs', 'ภาพปก: slug ภาษาไทย', call),
  ]

  const posts = [
    {
      th: {
        title: 'เริ่มต้นใช้ Easy CMS ใน 5 นาที',
        excerpt: 'ติดตั้ง กำหนด collection แรก แล้วเปิดหน้า admin ได้ทันทีในแอป Nuxt หรือ Next.js ของคุณ',
        body: doc(
          paragraph(
            'Easy CMS ฝังอยู่ในแอปของคุณ ไม่ต้องดูแล server แยก เนื้อหาทั้งหมดกำหนดใน easy-cms.config.ts',
          ),
          heading('ขั้นที่ 1: ติดตั้ง'),
          paragraph(
            'รัน npx create-easy-cms แล้วเลือก Nuxt หรือ Next.js ระบบจะสร้าง config และตัวอย่างให้',
          ),
          heading('ขั้นที่ 2: เปิดหน้า admin'),
          paragraph('ไปที่ /admin สร้างผู้ดูแลคนแรก แล้วเริ่มเขียนบทความได้เลย'),
        ),
      },
      en: {
        title: 'Get started with Easy CMS in 5 minutes',
        excerpt:
          'Install, define your first collection and open the admin inside your Nuxt or Next.js app.',
        body: doc(
          paragraph(
            'Easy CMS lives inside your app: no separate server to run. Content is defined in easy-cms.config.ts.',
          ),
          heading('Step 1: install'),
          paragraph(
            'Run npx create-easy-cms and pick Nuxt or Next.js. It writes the config and an example for you.',
          ),
          heading('Step 2: open the admin'),
          paragraph('Go to /admin, create the first admin and start writing.'),
        ),
      },
      cover: covers[0]?.id,
      gallery: covers.map((c) => c?.id).reverse(),
      tags: ['nuxt', 'cms'],
      status: 'published',
      daysAgo: 1,
    },
    {
      th: {
        title: 'ออกแบบ content model ให้ทีมใช้ง่าย',
        excerpt: 'เลือกระหว่าง group, array และ blocks อย่างไร ให้บรรณาธิการทำงานได้โดยไม่ต้องถามนักพัฒนา',
      },
      en: {
        title: 'Designing a content model editors love',
        excerpt: 'When to use groups, arrays and blocks, so editors never have to ask a developer.',
      },
      cover: covers[1]?.id,
      tags: ['cms'],
      status: 'published',
      daysAgo: 4,
    },
    {
      th: {
        title: 'เปิดตัว plugin SEO',
        excerpt: 'ตัวนับความยาว ตัวอย่างผลการค้นหา และปุ่มสร้างให้ ในหน้าแก้ไขบทความ',
      },
      en: {
        title: 'Introducing the SEO plugin',
        excerpt: 'Length meters, a search preview and Generate buttons in the editor.',
      },
      cover: covers[2]?.id,
      tags: ['cms'],
      status: 'draft',
      daysAgo: 0,
    },
    {
      th: { title: 'slug ภาษาไทยที่อ่านออก', excerpt: 'URL ภาษาไทยที่แชร์แล้วอ่านรู้เรื่อง' },
      en: {
        title: 'Thai slugs that stay readable',
        excerpt: 'Thai URLs people can read when they share them.',
      },
      cover: covers[3]?.id,
      tags: ['thai'],
      status: 'published',
      daysAgo: 9,
    },
    {
      th: {
        title: 'ร่าง: คู่มือ deploy บน Vercel',
        excerpt: 'Postgres, Cloudflare R2 และ cron สำหรับงานตั้งเวลา',
      },
      en: {
        title: 'Draft: deploying on Vercel',
        excerpt: 'Postgres, Cloudflare R2 and a cron for scheduled jobs.',
      },
      tags: ['nuxt'],
      status: 'draft',
      daysAgo: 0,
    },
  ]

  let featured = 0
  for (const post of posts) {
    const publishedAt = new Date(Date.now() - post.daysAgo * 86_400_000).toISOString()
    const created = await call('POST', '/posts?locale=th', {
      ...post.th,
      category: guides.id,
      tags: post.tags,
      author: me.user.id,
      publishedAt,
      ...(post.cover ? { cover: post.cover } : {}),
      ...(post.gallery ? { gallery: post.gallery } : {}),
      status: post.status,
      meta: { title: `${post.th.title} | Easy CMS Blog`, description: post.th.excerpt },
    })
    // A second save in Thai, so the history has more than one version.
    await call('PATCH', `/posts/${created.id}?locale=th`, { status: post.status })
    await call('PATCH', `/posts/${created.id}?locale=en`, {
      ...post.en,
      status: post.status,
      meta: { title: `${post.en.title} | Easy CMS Blog`, description: post.en.excerpt },
    })
    if (!featured) featured = created.id
  }
  await call('POST', '/globals/site?locale=th', {
    siteName: 'บล็อก Easy CMS',
    tagline: 'เรื่องราวจากทีม',
  })
  await call('POST', '/globals/site?locale=en', {
    siteName: 'Easy CMS Blog',
    tagline: 'Notes from the team',
  })
  // A contact form in both languages, with a few messages sent through the public endpoint.
  const text = (name: string, th: string, en: string, extra = {}) => ({
    th: { name, label: th, ...extra },
    en: { label: en },
  })
  const fields = [
    text('name', 'ชื่อ', 'Name', { blockType: 'text', required: true, width: 'half' }),
    text('email', 'อีเมล', 'Email', { blockType: 'email', required: true, width: 'half' }),
    text('topic', 'เรื่อง', 'Topic', {
      blockType: 'select',
      options: [
        { label: 'สอบถามทั่วไป', value: 'general' },
        { label: 'ร่วมงานกับเรา', value: 'work' },
      ],
    }),
    text('message', 'ข้อความ', 'Message', { blockType: 'textarea', required: true }),
    text('agree', 'ยินยอมให้ติดต่อกลับ', 'You may contact me back', {
      blockType: 'checkbox',
      required: true,
    }),
  ]
  const form = await call('POST', '/forms?locale=th', {
    title: 'ติดต่อเรา',
    slug: 'contact',
    status: 'published',
    submitLabel: 'ส่งข้อความ',
    fields: fields.map((f) => f.th),
    confirmationMessage: doc(paragraph('ขอบคุณ เราจะตอบกลับภายในหนึ่งวันทำการ')),
    emails: [{ subject: 'ข้อความใหม่จาก {{name}}', replyTo: '{{email}}' }],
  })
  const saved = (form.fields as { id: string }[]) ?? []
  await call('PATCH', `/forms/${form.id}?locale=en`, {
    title: 'Contact us',
    status: 'published',
    submitLabel: 'Send message',
    fields: saved.map((row, i) => ({ ...row, ...fields[i]?.en })),
    confirmationMessage: doc(paragraph('Thank you, we reply within one working day.')),
  })
  const pub = (await (await fetch(`${API}/form/contact`)).json()) as { token: string }
  // Forms sent sooner than 2 seconds after loading count as bots.
  await new Promise((resolve) => setTimeout(resolve, 2_100))
  for (const [name, email, message] of [
    ['สมชาย', 'somchai@example.com', 'อยากใช้ Easy CMS กับเว็บบริษัท'],
    ['Anna', 'anna@example.com', 'Do you support Postgres on Vercel?'],
    ['วิภา', 'wipa@example.com', 'สนใจร่วมงานครับ'],
  ]) {
    const sent = await fetch(`${API}/form/contact/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({
        data: { name, email, message, topic: 'general', agree: true },
        token: pub.token,
      }),
    })
    if (!sent.ok) throw new Error(`submit: ${sent.status} ${await sent.text()}`)
  }

  // Redirects: an old address to a post, and one to another site.
  await call('POST', '/redirects', { from: '/blog/hello', to_posts: featured })
  const redirect = await call('POST', '/redirects', {
    from: '/old-docs',
    to: 'https://maritonx.github.io/easy-cms/',
    type: '302',
  })
  await call('POST', '/redirects', { from: '/start', to: '/posts/get-started' })

  // Pages inside pages, in both languages.
  const addPage = async (th: string, en: string, slug: string, parent?: number) => {
    const created = await call('POST', '/pages', {
      title: th,
      slug,
      status: 'published',
      ...(parent ? { parent } : {}),
    })
    await call('PATCH', `/pages/${created.id}?locale=en`, { title: en, slug })
    return created.id as number
  }
  const about = await addPage('เกี่ยวกับเรา', 'About us', 'about')
  const team = await addPage('ทีมงาน', 'Our team', 'team', about)
  await addPage('ประวัติ', 'Our story', 'story', about)
  await addPage('ร่วมงานกับเรา', 'Careers', 'careers', about)
  const services = await addPage('บริการ', 'Services', 'services')
  await addPage('ออกแบบเว็บไซต์', 'Web design', 'web-design', services)
  await addPage('ที่ปรึกษา', 'Consulting', 'consulting', services)
  await addPage('ติดต่อเรา', 'Contact', 'contact')

  // Someone invited by email who hasn't set a password yet.
  const invited = (
    await call('POST', '/users', { email: 'nok@example.com', name: 'Nok', role: 'editor' })
  ).id as number

  return { featured, category: guides.id, form: form.id, redirect: redirect.id, team, invited }
}

try {
  await main()
} finally {
  server?.kill()
  await oidc?.close()
  rmSync(scratch, { recursive: true, force: true })
}
