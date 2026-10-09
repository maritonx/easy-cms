# เมนูนำทางใน global {#a-navigation-menu-in-a-global}

::: info สิ่งที่จะได้
เมนูเดียวสำหรับทั้งเว็บที่ผู้แก้เปลี่ยนได้ในหน้า admin พร้อมชื่อลิงก์ทุกภาษา
**ใช้:** [globals](../configuration#globals), [arrays](../fields#array-and-group),
[หลายภาษา](../localization)
:::

## 1. Global {#1-the-global}

```ts
globals: [
  {
    slug: 'navigation',
    label: { en: 'Navigation', th: 'เมนู' },
    admin: { icon: 'link' },
    access: { read: () => true },
    fields: [
      {
        name: 'links',
        type: 'array',
        maxRows: 8,
        fields: [
          { name: 'label', type: 'text', required: true, localized: true },
          { name: 'url', type: 'text', required: true },
          { name: 'external', type: 'boolean' },
        ],
      },
    ],
  },
],
```

ผู้แก้จะเห็นเมนูนี้ที่ **ตั้งค่า → เมนู** เพิ่มลิงก์และลากเรียงลำดับได้

## 2. แสดงใน layout {#2-show-it-in-the-layout}

::: code-group

```ts [Nuxt: server/api/navigation.get.ts]
export default defineEventHandler(async (event) => {
  const cms = await useEasyCMS()
  return cms.findGlobal('navigation', { locale: getQuery(event).locale as string | undefined })
})
```

```tsx [Next.js: app/layout.tsx]
import { getEasyCMS } from '@easy-cms/next'
import type { ReactNode } from 'react'
import config from '@/easy-cms.config'

export default async function Layout({ children }: { children: ReactNode }) {
  const nav = await (await getEasyCMS(config)).findGlobal('navigation', { locale: 'th' })
  return (
    <html lang="th">
      <body>
        <nav>
          {nav.links?.map((link) => (
            <a key={link.id} href={link.url} {...(link.external ? { target: '_blank', rel: 'noopener' } : {})}>
              {link.label}
            </a>
          ))}
        </nav>
        {children}
      </body>
    </html>
  )
}
```

:::

ใน Nuxt ให้ดึงครั้งเดียวใน `app.vue` ด้วย `useFetch('/api/navigation', { query: { locale } })`

## เคล็ดลับ {#tips}

- ลิงก์ไปหน้าที่อาจเปลี่ยนชื่อ? ใช้ `relationship` ไปยัง `pages` แทน `url` แล้วสร้าง path จาก slug ของหน้านั้น
- ถ้าใส่ `drafts: true` ให้ global ผู้แก้จะเตรียมเมนูใหม่ไว้ แล้วเผยแพร่ทีเดียวได้
