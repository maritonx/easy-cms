# A navigation menu in a global

::: info What you'll build
One menu for the whole site that editors change in the admin, with labels in every language.
**Uses:** [globals](../configuration#globals), [arrays](../fields#array-and-group),
[localization](../localization).
:::

## 1. The global

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

Editors find it under **Settings → Navigation**, add links and drag them into order.

## 2. Show it in the layout

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

In Nuxt, fetch it once in `app.vue` with `useFetch('/api/navigation', { query: { locale } })`.

## Tips

- A link to a page that may be renamed? Use a `relationship` to `pages` instead of `url`, and
  build the path from the related page's slug.
- With `drafts: true` on the global, editors can prepare a new menu and publish it at once.
