# Next.js

::: info What you'll learn
How the Next.js route handlers mount the admin and the API, and how to read content in server components.

**Before this page:** [Getting started](./getting-started).
:::

`@easy-cms/next` supports the App Router in Next.js 15 and later.

## Setup

`npx create-easy-cms` does these steps for you.

**1. Wrap `next.config.ts`**, so the server build keeps the admin files, migrations and database
drivers (it sets `serverExternalPackages` and `outputFileTracingIncludes`):

```ts
import type { NextConfig } from 'next'
import { withEasyCMS } from '@easy-cms/next/config'

const nextConfig: NextConfig = {}
export default withEasyCMS(nextConfig)
```

**2. Add the route handlers.** Their paths must match `routes.api` and `admin.path`:

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

`createRouteHandlers(config, options)` takes these options (`RouteHandlerOptions`, the same as
`ApiHandlerOptions`; both are exported):

| Option | Default | |
|---|---|---|
| `basePath` | `routes.api` | Where the API is mounted. |
| `getClientIp` | — | `(request) => string \| undefined`: the client's IP, for login rate limiting and the audit log. Wins over `trustProxy`. |
| `trustProxy` | `false` | Use the last address in `X-Forwarded-For` (see below). Vercel and Netlify need nothing. |

## Reading content

```tsx
import { getEasyCMS, getEasyCMSUser } from '@easy-cms/next'
import config from '@/easy-cms.config'

export const dynamic = 'force-dynamic'

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const cms = await getEasyCMS(config)
  const user = await getEasyCMSUser(config)
  const { docs } = await cms.find('posts', {
    where: { slug: { equals: slug } },
    overrideAccess: false,
    user,
    draft: user !== null,
    limit: 1,
  })
  // …
}
```

`getEasyCMS(config)` returns one instance per server that survives hot reloads. It can be used
in Server Components, Route Handlers and Server Actions.

## Things to know

- **Make CMS-backed pages dynamic** (`export const dynamic = 'force-dynamic'`) or use
  revalidation. Otherwise `next build` prerenders them and queries the database at build time.
- Login rate limiting needs the client's IP. On Vercel and Netlify it is found by itself.
  Behind another proxy that adds to `X-Forwarded-For`, use `createRouteHandlers(config,
  { trustProxy: true })`: the last address in the header counts (the one your proxy added).
- Next.js removes trailing slashes, so the admin lives at `/admin` (not `/admin/`).
- In `next dev`, changing fields or options reloads the CMS; after changing only the code of a
  hook, access rule or other function in the config, restart the dev server.

See the [Next.js example](https://github.com/maritonx/easy-cms/tree/main/examples/next-blog).

## Next steps

- [Local API](./local-api): read and write content in server code.
- [Live preview](./live-preview): show unsaved changes on your pages.
