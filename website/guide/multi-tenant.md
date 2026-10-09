# Multi-tenant

::: info What you'll learn
How to run several sites or clients in one CMS: each tenant with its own content, members and
settings, a tenant switcher in the admin, and frontends that read one tenant.

**Before this page:** [Access control](./access-control), [Roles](./roles) and [Plugins](./plugins).
:::

`@easy-cms/plugin-multi-tenant` adds tenants to one CMS, one database and one admin. A tenant is
a brand, a site, a branch or a client. Each has its own documents in the collections you name,
its own value of the globals you name, and its own members, each with a role there. Everything
else is shared.

It suits a company with several brands or sites, and an agency that runs its clients' sites:
the team works across tenants, each client only in theirs. If clients must not share a database
at all, run one CMS per client instead.

## Set it up

```bash [pm]
npm install @easy-cms/plugin-multi-tenant
```

```ts
import { multiTenantPlugin } from '@easy-cms/plugin-multi-tenant'

export default defineConfig({
  // …
  auth: { rbac: true }, // optional: roles from the admin, given per tenant
  plugins: [
    multiTenantPlugin({
      collections: ['posts', 'pages', 'media'], // each document belongs to one tenant
      globals: ['site-settings'], // one value per tenant
    }),
  ],
})
```

The plugin adds:

- **Settings → Tenants**: name, slug and the domains of each tenant.
- **A `tenant` field** on each collection you name, set from the tenant you work in. With
  `media` and `upload.folders`, media folders belong to a tenant too.
- **A tenant switcher** at the top of the admin's menu, for people in more than one tenant.
- **Settings → Members**: the people of the chosen tenant and their role there.
- **`tenants` on users**: the tenants each person is in, and their role in each.

Then create the database's changes as usual: `npx easy-cms migrate:create tenants`. For a site
that already has content, give it to a tenant once:

```bash
npx easy-cms tenants:assign brand-a
```

## Who sees what

| Who | Sees and changes |
|---|---|
| Users with access to all tenants (role `admin` by default) | Every tenant, or the one they choose; tenants, Settings, backups, roles. |
| Members | The tenant they work in, with their role there: one of their tenants, chosen in the switcher. |
| An admin of a tenant (role `admin` there) | That tenant's content and members; not Settings → Roles, Backups, Email or other tenants. |
| Visitors | The tenant their request names; nothing when it names none. |

- New documents get the tenant the request works in. Only users with access to all tenants
  choose another, or move a document.
- Relationships to tenant collections offer and accept that tenant's documents only.
- Unique values, slugs included, only need to differ within a tenant: two brands can both have
  `/posts/hello`.
- People are added under **Members**, by email: an account can be in several tenants. New people
  get an email to set a password when [email](./email) is set up. Admins of a tenant can't change
  people's accounts, only their membership.
- An [API key](./api-keys) keeps the tenant it was created in.

## Frontends

A request names its tenant, in this order:

1. The `x-easy-cms-tenant` header, with the tenant's slug or id.
2. `?tenant=` in the URL.
3. The admin's cookie (the switcher).
4. Its domain: a tenant whose **Domains** has the request's host.

```ts
// Another app or a static site
const posts = await fetch('https://cms.example.com/api/cms/posts', {
  headers: { 'x-easy-cms-tenant': 'brand-a' },
}).then((r) => r.json())
```

In Nuxt or Next.js pages, read with the Local API in the tenant of the page's domain:

```ts
import { tenantContext } from '@easy-cms/plugin-multi-tenant'

const context = await tenantContext(cms, { host: request.headers.get('host') ?? '' })
const posts = await cms.find('posts', { overrideAccess: false, user: null, context })
const site = await cms.findGlobal('site-settings', { overrideAccess: false, user: null, context })
```

`tenantContext(cms, { slug })` works with a slug from the URL, e.g. `/[tenant]/[slug]` routes.
`cms.forRequest(request)` gives the user and context of a request as REST does.

With the [SEO plugin](./seo), `/sitemap.xml` and `/llms.txt` list the pages of the tenant of
the requesting domain. Its helpers take the same `context`:
`sitemap(cms, { context: await tenantContext(cms, { host }) })`.

A request that names no tenant finds nothing in tenant collections. With
`publicReads: 'all'`, it finds every tenant's instead.

## Options

| Option | Default | |
|---|---|---|
| `collections` | — | **Required**. Collections whose documents belong to one tenant. |
| `globals` | `[]` | Globals with a value per tenant. |
| `tenantsSlug` | `tenants` | The tenants collection; declare it yourself to add fields. |
| `userHasAccessToAllTenants` | role `admin` | `(user) => boolean`: who sees every tenant and the system. |
| `publicReads` | `none` | `all`: requests that name no tenant read every tenant's. |
| `header` | `x-easy-cms-tenant` | The header that names the tenant. |
| `cookie` | `ecms-tenant` | Where the admin keeps the chosen tenant. |

## Deleting a tenant

Deleting a tenant under Settings → Tenants deletes its documents and files in the tenant
collections, and takes it off its members' lists. It can't be undone: make a
[backup](./backups) first.

## How it works

The plugin uses parts of the core you can use yourself:

- **`onRequest`** in the config works out each request's `context` (here, the tenant) and the
  user within it (their role there, `scoped`). Access rules, hooks and `filterOptions` receive
  the `context`; the Local API takes one as an option.
- **`scoped` users** are admins of their part only: Settings, backups, roles and other people's
  API keys need an admin of the whole system.
- **Globals with `scope`** keep a value per scope.
- **`uniqueWithin`** works on any unique field, with a unique index per scope in the database.
- **`admin.switcher`** adds the choice at the top of the menu.

Not yet: a backup or export of one tenant, webhooks per tenant, tenants that sign themselves
up, and single sign-on that puts people in a tenant by their email's domain.

## Next steps

- [Roles](./roles): what each role may do; members get one per tenant.
- [Access control](./access-control): your own rules see the request's `context`.
- [API keys](./api-keys): keys for one tenant's scripts.
