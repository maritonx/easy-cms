// Screenshots of the admin for the docs site: `pnpm docs:screenshots` (after `pnpm build`).
// Starts the Nuxt example on a temporary database, adds sample content in Thai and English,
// and saves every shot in both languages and both themes to website/public/screenshots.
import { type ChildProcess, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Page } from '@playwright/test'
import sharp from 'sharp'

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

async function main() {
  mkdirSync(OUT, { recursive: true })
  server = spawn('pnpm', ['exec', 'nuxi', 'dev', '--port', String(PORT)], {
    cwd: EXAMPLE,
    stdio: 'ignore',
    env: {
      ...process.env,
      EASY_CMS_SECRET: randomBytes(24).toString('hex'),
      DATABASE_URL: `file:${join(scratch, 'shots.db')}`,
      NUXT_TELEMETRY_DISABLED: '1',
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
}
const TH = { preview: 'ตัวอย่างผลการค้นหา', same: 'ไทย', other: 'อังกฤษ', showPreview: 'ดูตัวอย่าง' }

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
  const guides = await call('POST', '/categories', { name: 'คู่มือ' })
  await call('POST', '/categories', { name: 'ข่าว' })
  await call('POST', '/categories', { name: 'เบื้องหลัง' })
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
  return { featured, category: guides.id }
}

try {
  await main()
} finally {
  server?.kill()
  rmSync(scratch, { recursive: true, force: true })
}
