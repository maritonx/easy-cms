# Other frameworks

::: info What you'll learn
Run Easy CMS inside a framework without its own package: Astro, SvelteKit, React Router, Hono or any
server that handles Web `Request`s.

**Before this page:** [Getting started](./getting-started).
:::

Easy CMS has packages for [Nuxt](./nuxt) and [Next.js](./next), and its own
[standalone server](./standalone). Underneath, the API and the admin are plain
`(Request) => Response` handlers, so any framework that hands you a Web `Request` can mount them.
The packages for Nuxt and Next.js are built from the same three pieces:

| | From | What it does |
|---|---|---|
| `sharedEasyCMS(config)` | `@easy-cms/core` | One instance per server, kept across hot reloads; a changed config makes a new one |
| `createApiHandler(config, options?)` | `@easy-cms/core` | The REST API on that instance |
| `adminHandlerFor(resolvedConfig, overrides?)` | `@easy-cms/admin` | The admin app for the config's path, language and brand |

And `cms.auth.userFromHeaders(headers)` gives the signed-in user of a request (session cookie or
Bearer token), e.g. to show drafts to editors.

## Mount the API and the admin

Install the core, your database adapter and the admin:

```sh
npm install @easy-cms/core @easy-cms/db-sqlite @easy-cms/admin
```

Then, in one module your routes import:

```ts
// cms.ts
import { adminHandlerFor } from '@easy-cms/admin'
import { createApiHandler, resolveConfig, sharedEasyCMS } from '@easy-cms/core'
import config from './easy-cms.config'

/** The Local API, typed from the config, for your pages. */
export const getCMS = () => sharedEasyCMS(config)

/** `/api/cms/*`, every method. */
export const api = createApiHandler(config, {
  // Behind a proxy you trust (Vercel, Netlify, a load balancer): the client's IP for login limits.
  trustProxy: true,
})

/** `/admin/*`, GET and HEAD. */
export const admin = async (request: Request) =>
  adminHandlerFor(await resolveConfig(config), { siteUrl: '/' })(request)
```

Route every request under `routes.api` (default `/api/cms`) to `api`, and under `admin.path`
(default `/admin`) to `admin`. For example, in a server that takes a `fetch` handler:

```ts
import { admin, api } from './cms'

export default {
  fetch(request: Request) {
    const { pathname } = new URL(request.url)
    if (pathname.startsWith('/api/cms')) return api(request)
    if (pathname === '/admin' || pathname.startsWith('/admin/')) return admin(request)
    return new Response('Not found', { status: 404 })
  },
}
```

In a framework with file-based routes, export the handler from a catch-all route for each path,
for every HTTP method the framework asks you to name.

## Read content in your pages

```ts
import { getCMS } from './cms'

const cms = await getCMS()
const { docs } = await cms.find('posts', { where: { status: { equals: 'published' } } })
// Editors see drafts:
const user = await cms.auth.userFromHeaders(request.headers)
```

## Good to know

- **Server only.** Easy CMS runs in Node.js 22.12 or newer, not in edge runtimes.
- **The admin's files** are read from `@easy-cms/admin` on disk. If your framework bundles server
  code, keep `@easy-cms/admin` (and your database driver) external, so the files stay where it
  looks for them; or pass `appDir` to `adminHandlerFor`.
- **Trailing slashes:** the admin redirects `/admin` to `/admin/`. If your framework strips trailing
  slashes, pass `trailingSlashRedirect: false` to avoid a loop.
- **Hot reloads** keep the same instance while the config is alike; a change to a hook's code alone
  needs a restart.
- **Migrations** are the same as everywhere: [Deployment](./deployment#production-migrations).

These pieces are what the packages use, but only Nuxt, Next.js and the standalone server are tested
end to end. If you mount Easy CMS in another framework, tell us how it went.

## Next steps

- [Local API](./local-api): reading and writing content in your pages.
- [REST API](./rest-api): for code in the browser.
