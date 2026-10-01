# @easy-cms/next

Next.js adapter for Easy CMS (App Router, 15 or later): route handlers for the REST API and the admin UI, and a typed `getEasyCMS()` for Server Components. Part of [Easy CMS](https://github.com/maritonx/easy-cms), the embedded, code-first headless CMS for Nuxt and Next.js.

## Install

```bash
npm install @easy-cms/next @easy-cms/core @easy-cms/db-postgres
```

Or `pnpm add`, `yarn add` or `bun add`.

## Usage

**1. Wrap `next.config.ts`** so the server build keeps the admin UI and database drivers:

```ts
import { withEasyCMS } from '@easy-cms/next/config'
export default withEasyCMS({ /* your Next config */ })
```

**2. Add two route handlers** (paths match `routes.api` and `admin.path` in your Easy CMS config):

```ts
// app/api/cms/[[...path]]/route.ts
import { createRouteHandlers } from '@easy-cms/next'
import config from '@/easy-cms.config'
export const { GET, HEAD, POST, PATCH, PUT, DELETE, OPTIONS } = createRouteHandlers(config)
```

```ts
// app/admin/[[...path]]/route.ts
import { createAdminRouteHandlers } from '@easy-cms/next'
import config from '@/easy-cms.config'
export const { GET, HEAD } = createAdminRouteHandlers(config)
```

**3. Read content in Server Components** with the typed Local API:

```tsx
import { getEasyCMS, getEasyCMSUser } from '@easy-cms/next'
import config from '@/easy-cms.config'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const cms = await getEasyCMS(config)
  const { docs } = await cms.find('posts', { limit: 10 })
  const user = await getEasyCMSUser(config) // logged-in Easy CMS user or null
  // …
}
```

Pages that read from the CMS should be dynamic (or use `revalidate`), otherwise `next build`
tries to query the database while prerendering.

`createRouteHandlers(config, { trustProxy: true })` uses `X-Forwarded-For` for login rate limiting;
enable it behind a proxy you trust, such as Vercel.

## Links

[Next.js](https://maritonx.github.io/easy-cms/guide/next) · [Documentation](https://maritonx.github.io/easy-cms/) ([ภาษาไทย](https://maritonx.github.io/easy-cms/th/)) · [GitHub](https://github.com/maritonx/easy-cms)

MIT License
