# Standalone server

::: info What you'll learn
Run Easy CMS as its own server for a Vite, React, Vue or static frontend, and deploy it.

**Before this page:** [Getting started](./getting-started).
:::

Easy CMS can run as its own server instead of inside Nuxt or Next.js. Use it as the backend for
a Vite, React, Vue, Svelte or static frontend, or when the CMS should live on its own domain.

## Create a project

```bash [pm]
npm create easy-cms@latest my-cms
cd my-cms
npm run dev
```

In a new or empty directory `create-easy-cms` sets up a standalone server: `package.json` with
scripts, `easy-cms.config.ts`, and a secret in `.env`. In an existing project that is not Nuxt
or Next.js, pass `--standalone`.

Open `http://localhost:4000/admin` and create the first admin. `npm run dev` runs
`easy-cms serve --watch`, which reloads when the config or files it imports change; a config
with an error is reported and the previous one keeps serving.

## Routes

| Path | |
|---|---|
| `/admin` | Admin UI (`admin.path`) |
| `/api/cms` | [REST API](./rest-api) (`routes.api`) |
| `/healthz` | `ok`, for load balancers and container health checks |
| `/` | Redirects to the admin |

## Calling it from a frontend

List the frontend's origin in `cors`, then fetch from the browser:

```ts
// easy-cms.config.ts
export default defineConfig({
  // …
  cors: ['http://localhost:5173', 'https://www.example.com'],
})
```

```ts
// in the frontend
const { docs } = await fetch('https://cms.example.com/api/cms/posts?depth=1').then((r) => r.json())
```

Anonymous requests see what read access allows (typically published content). For typed
responses, generate types with `npx easy-cms generate:types` and copy the file into the
frontend.

Logged-in requests from another origin need either a bearer token
(`Authorization: Bearer <token>`) or cookies. Cookies work when the frontend and the CMS are on
the same site (e.g. `www.example.com` and `cms.example.com`) and the frontend's origin is in
`auth.trustedOrigins`; send them with `fetch(url, { credentials: 'include' })`.

## Options

```bash
easy-cms serve [--port <n>] [--host <host>] [--watch] [--trust-proxy]
```

| Option | Default | |
|---|---|---|
| `--port` | `PORT`, then `4000` | |
| `--host` | `HOST`, then all interfaces | |
| `--watch` | off | Reload on changes (development) |
| `--trust-proxy` | off | Use `X-Forwarded-For` (login rate limiting) and `X-Forwarded-Proto` (secure cookies) from your reverse proxy |

`easy-cms serve` reads `.env` from the project root, like every CLI command.

## Deploying

Same as the adapters: create and apply migrations, then start with `NODE_ENV=production`, which
refuses to start while migrations are pending. See [Migrations & deployment](./deployment).

```bash [pm]
npx easy-cms migrate
NODE_ENV=production npx easy-cms serve --trust-proxy
```

A Dockerfile:

```dockerfile
FROM node:24-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production PORT=4000
EXPOSE 4000
HEALTHCHECK CMD node -e "fetch('http://localhost:4000/healthz').then(r => process.exit(r.ok ? 0 : 1))"
CMD ["sh", "-c", "npx easy-cms migrate && npx easy-cms serve"]
```

Uploads on local disk need a volume (`/app/uploads`); or use [S3 storage](./uploads#s3-cloudflare-r2-and-minio).

## Use your own server

`createStandaloneHandler(cms)` from `easy-cms` returns the same `(Request) => Response` handler,
for Hono, Bun, Deno or any server that speaks Web requests:

```ts
import { createEasyCMS, loadConfig } from '@easy-cms/core'
import { createStandaloneHandler } from 'easy-cms'

const cms = await createEasyCMS(await loadConfig())
const handler = createStandaloneHandler(cms)
Bun.serve({ port: 4000, fetch: (request) => handler(request) })
```

## Next steps

- [REST API](./rest-api): call the API from your frontend.
- [TypeScript](./typescript): types for a frontend in another repository.
