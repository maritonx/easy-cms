# @easy-cms/admin

The admin UI of Easy CMS, a prebuilt Vue 3 app that talks to the REST API. Part of
[Easy CMS](https://github.com/maritonx/easy-cms), the code-first CMS and app backend for Nuxt
and Next.js.

**Internal:** the framework adapters (`@easy-cms/nuxt`, `@easy-cms/next`) and `easy-cms serve`
install and serve it at `/admin`. You don't need to install it yourself.

- Dashboard, lists with search, filters, columns, bulk actions and tree views
- Forms for every field type, rich text (Tiptap), relationships, blocks and the media library
- Drafts, version history, live preview, scheduled publishing and translations
- English and Thai, light and dark themes, plugin components

## Serving it yourself

```ts
import { createAdminHandler } from '@easy-cms/admin'

const admin = createAdminHandler({ basePath: '/admin', apiPath: '/api/cms', locale: 'th' })
// (request: Request) => Promise<Response>: static assets + the HTML shell with security headers
```

For static hosting, serve `dist/app` at the admin path and answer every other admin route with
`renderShell(readFileSync('dist/app/shell.html', 'utf8'), options)` plus `SECURITY_HEADERS`.
The files are exported as `@easy-cms/admin/app/*`, and `renderShell` without Node's modules as
`@easy-cms/admin/shell`.

## Studio mode

For Studio (ADR-0074); outside semver, like the `admin/ui/*` routes. Render the shell with
`renderShell(shell, { studio: { origin: 'https://studio.example' } })` and frame the admin from a
page at that origin:

- Its requests carry no credentials of their own: the page's Service Worker answers the API and
  signs each request in (`Authorization: Bearer <session token>`). There is no Log out.
- It posts `{ type: 'easy-cms:ready' }` to the framing page once mounted.
- Posted `{ type: 'easy-cms:reload' }` by the framing page (only that window, only that origin),
  it loads the session and schema again and shows its page afresh, on the same route, without
  reloading; then posts `{ type: 'easy-cms:reloaded' }`.

## Developing

```bash
pnpm --dir examples/nuxt-blog dev   # an Easy CMS API on :3000
pnpm --dir packages/admin dev       # Vite on :5173, proxies /api/cms to :3000
```

## Links

[Documentation](https://easycms.dev/docs) ([ภาษาไทย](https://easycms.dev/th/docs)) · [GitHub](https://github.com/maritonx/easy-cms)

MIT License
