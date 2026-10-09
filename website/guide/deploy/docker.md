# Deploy with Docker

::: info What you'll build
A container image of your site with Easy CMS, run with Docker Compose: with Postgres in a second
container, or with SQLite on a volume. The same image runs on any server or platform that runs
containers.

**Before this page:** [Choosing a host](./), [Migrations & deployment](../deployment).
:::

A container keeps running, so the server runs [scheduled jobs](../drafts#scheduled-publishing)
every minute by itself, and SQLite and uploads can live on volumes. Building inside the image also
puts SQLite's native driver on the right system.

## 1. The Dockerfile

The image migrates the database when it starts, then serves the site. Pick your setup:

::: code-group

```dockerfile [Next.js]
# Build: install everything and build Next.js. No database is needed to build.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx next build

# Run: the built app with its node_modules (the easy-cms CLI runs the migrations).
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app ./
EXPOSE 3000
HEALTHCHECK --interval=30s --start-period=30s \
  CMD node -e "fetch('http://localhost:3000/api/cms/users/init').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["sh", "-c", "npx easy-cms migrate && npx next start"]
```

```dockerfile [Nuxt]
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx nuxi build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
COPY --from=build /app ./
EXPOSE 3000
HEALTHCHECK --interval=30s --start-period=30s \
  CMD node -e "fetch('http://localhost:3000/api/cms/users/init').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["sh", "-c", "npx easy-cms migrate && node .output/server/index.mjs"]
```

```dockerfile [Standalone]
FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production PORT=4000
EXPOSE 4000
HEALTHCHECK --interval=30s --start-period=20s \
  CMD node -e "fetch('http://localhost:4000/healthz').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["sh", "-c", "npx easy-cms migrate && npx easy-cms serve --trust-proxy"]
```

:::

- The `build` script must not migrate: the image is built without a database. Run `next build`
  (or `nuxi build`) directly, as above.
- The health check calls `<api>/users/init`, which needs the database; the standalone server also
  answers `/healthz`.
- `easy-cms` must be in `dependencies` (not only `devDependencies`) for the standalone image, which
  installs without dev dependencies.
- With pnpm, start the build stage with `RUN corepack enable`, copy `pnpm-lock.yaml` and run
  `pnpm install --frozen-lockfile`.

Keep local files out of the image with a `.dockerignore`:

```txt [.dockerignore]
node_modules
.next
.output
.env
.pglite
uploads
data
*.db
.git
```

## 2. Compose

::: code-group

```yaml [With Postgres: compose.yaml]
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      EASY_CMS_SECRET: ${EASY_CMS_SECRET:?set EASY_CMS_SECRET in .env}
      EASY_CMS_SETUP_CODE: ${EASY_CMS_SETUP_CODE:-}
      DATABASE_URL: postgres://cms:cms@db:5432/cms
    volumes:
      - uploads:/app/uploads
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  db:
    image: postgres:17
    environment:
      POSTGRES_USER: cms
      POSTGRES_PASSWORD: cms
      POSTGRES_DB: cms
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U cms -d cms"]
      interval: 5s
      retries: 10
    restart: unless-stopped

volumes:
  uploads:
  pgdata:
```

```yaml [With SQLite: compose.yaml]
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      EASY_CMS_SECRET: ${EASY_CMS_SECRET:?set EASY_CMS_SECRET in .env}
      EASY_CMS_SETUP_CODE: ${EASY_CMS_SETUP_CODE:-}
      DATABASE_URL: file:/app/data/cms.db
    volumes:
      - data:/app/data
      - uploads:/app/uploads
    restart: unless-stopped

volumes:
  data:
  uploads:
```

:::

The config reads the database from `DATABASE_URL`, for example
`postgres({ url: process.env.DATABASE_URL })` or `sqlite({ url: process.env.DATABASE_URL })`. With
SQLite, run one container only: a SQLite file has one server.

Put the secrets in a `.env` file next to `compose.yaml` (not in the image), then start:

```bash
printf 'EASY_CMS_SECRET=%s\nEASY_CMS_SETUP_CODE=%s\n' "$(openssl rand -hex 32)" "choose-a-phrase" > .env
docker compose up -d --build
docker compose logs -f app
```

The log shows the applied migrations, then the server. Open `http://localhost:3000/admin` and
create the first admin with the setup code. Change the Postgres password before using this
anywhere but your machine.

## 3. Updating

Pull the new code and rebuild: the new container applies pending migrations before it starts, and
the volumes keep the database and uploads.

```bash
git pull
docker compose up -d --build
```

## 4. HTTPS and the proxy

Put a reverse proxy in front for HTTPS: Caddy, Traefik, nginx, or your platform's. It sets
`X-Forwarded-For`, so trust it: `--trust-proxy` (standalone, already in the image above) or
`trustProxy: true` (Next.js route handlers, Nuxt module). Then set `serverURL` to the public
address. A Caddy setup is in [VPS](./vps#https-with-caddy).

## Backups

The volumes hold everything: back up the `pgdata` or `data` volume and `uploads`, or let Easy CMS
make database backups itself (`backups` in the config, stored on another volume or in S3). See
[Backups](../backups).

## Next steps

- [VPS](./vps): run the same site without containers.
- [Other hosts](./other-hosts): platforms that build and run this image for you.
