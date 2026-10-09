# Multi-tenant example

Two brands (or clients) in one CMS with `@easy-cms/plugin-multi-tenant`: each tenant has its
own posts, pages, media library and site settings, and its own members with a role there.
Categories are shared.

```bash
echo "EASY_CMS_SECRET=$(openssl rand -hex 32)" > .env
pnpm dev     # http://localhost:4000/admin
```

1. Create the first admin, then two tenants under **Settings → Tenants** (`brand-a`, `brand-b`;
   add a domain to each if you have one).
2. Choose a tenant at the top of the menu and write a post; switch, and the list is the other
   brand's.
3. Add people under **Settings → Members**: their role holds in that tenant only.

A frontend names its tenant:

```bash
curl -H 'x-easy-cms-tenant: brand-a' http://localhost:4000/api/cms/posts
curl 'http://localhost:4000/api/cms/globals/site?tenant=brand-b'
```

or by domain: a request whose host is in a tenant's **Domains** reads that tenant.

See the [Multi-tenant guide](https://maritonx.github.io/easy-cms/guide/multi-tenant).
