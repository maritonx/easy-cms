# Standalone example

Easy CMS as its own server, without Nuxt or Next.js: the admin at `/admin`, the REST API at
`/api/cms`. Use it as the backend for a Vite, React, Vue or static frontend.

```bash
echo "EASY_CMS_SECRET=$(openssl rand -hex 32)" > .env
pnpm dev                      # http://localhost:4000/admin, reloads on config changes
npx serve -l 5173 frontend    # a page on another origin that reads the API (CORS)
```

Production:

```bash
pnpm migrate:create init && pnpm migrate
NODE_ENV=production pnpm start
```
