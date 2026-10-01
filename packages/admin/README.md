# @easy-cms/admin

The admin UI of Easy CMS, a prebuilt Vue 3 app that talks to the REST API. Part of
[Easy CMS](https://github.com/maritonx/easy-cms), the embedded, code-first headless CMS for Nuxt
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

## Developing

```bash
pnpm --dir examples/nuxt-blog dev   # an Easy CMS API on :3000
pnpm --dir packages/admin dev       # Vite on :5173, proxies /api/cms to :3000
```

## Links

[Documentation](https://maritonx.github.io/easy-cms/) ([ภาษาไทย](https://maritonx.github.io/easy-cms/th/)) · [GitHub](https://github.com/maritonx/easy-cms)

MIT License
