# Deploy on a VPS

::: info What you'll build
Your site with Easy CMS on one Linux server you control (Ubuntu or Debian): Node.js, SQLite and
uploads on the server's disk, systemd to keep it running, Caddy for HTTPS, and daily backups.

**Before this page:** [Choosing a host](./), [Migrations & deployment](../deployment).
:::

One server is the simplest and cheapest way to run Easy CMS. The server keeps running, so it runs
[scheduled jobs](../drafts#scheduled-publishing) every minute by itself, and SQLite needs nothing
but a file.

## 1. Node.js and a user

Install Node.js 22.12 or newer (24 LTS), for example from
[nodejs.org](https://nodejs.org/en/download) or your distribution's NodeSource packages, then
create a user that runs the site and owns its files:

```bash
node -v   # v22.12 or newer
sudo useradd --system --create-home --shell /usr/sbin/nologin cms
sudo mkdir -p /srv/site && sudo chown cms:cms /srv/site
```

## 2. The site

As the `cms` user, put the code in `/srv/site` (`git clone`, or copy it), add the secrets, install
and build. Build on the server itself: SQLite's native driver must match its system.

```bash
sudo -u cms bash
cd /srv/site
git clone https://github.com/you/your-site.git .
printf 'EASY_CMS_SECRET=%s\nEASY_CMS_SETUP_CODE=%s\n' "$(openssl rand -hex 32)" "choose-a-phrase" > .env
chmod 600 .env
npm ci
npm run build   # Next.js or Nuxt; nothing to build for the standalone server
exit
```

Without `DATABASE_URL`, `sqlite({ url: process.env.DATABASE_URL ?? 'file:./cms.db' })` keeps the
database in `/srv/site/cms.db`, and uploads go to `/srv/site/uploads`. Postgres works too: install
it on the server or use a hosted one, and set `DATABASE_URL` in `.env`.

## 3. A systemd service

systemd starts the site at boot, applies migrations before each start and restarts it if it stops.

::: code-group

```ini [Next.js: /etc/systemd/system/easy-cms.service]
[Unit]
Description=Easy CMS site
After=network.target

[Service]
Type=simple
User=cms
WorkingDirectory=/srv/site
Environment=NODE_ENV=production
Environment=PORT=3000
EnvironmentFile=/srv/site/.env
ExecStartPre=/usr/bin/npx easy-cms migrate
ExecStart=/usr/bin/npx next start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```ini [Nuxt: /etc/systemd/system/easy-cms.service]
[Unit]
Description=Easy CMS site
After=network.target

[Service]
Type=simple
User=cms
WorkingDirectory=/srv/site
Environment=NODE_ENV=production
Environment=PORT=3000
EnvironmentFile=/srv/site/.env
ExecStartPre=/usr/bin/npx easy-cms migrate
ExecStart=/usr/bin/node .output/server/index.mjs
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```ini [Standalone: /etc/systemd/system/easy-cms.service]
[Unit]
Description=Easy CMS site
After=network.target

[Service]
Type=simple
User=cms
WorkingDirectory=/srv/site
Environment=NODE_ENV=production
Environment=PORT=3000
EnvironmentFile=/srv/site/.env
ExecStartPre=/usr/bin/npx easy-cms migrate
ExecStart=/usr/bin/npx easy-cms serve --trust-proxy
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

:::

`EnvironmentFile` gives the server `.env` (Nuxt doesn't read it by itself), and
`WorkingDirectory` makes `file:./cms.db`, the migrations and `uploads` resolve in the project.
Check where `npx` and `node` are with `which npx` and adjust the paths. Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now easy-cms
journalctl -u easy-cms -f   # the applied migrations, then the server
```

## HTTPS with Caddy

[Caddy](https://caddyserver.com) gets and renews the HTTPS certificate by itself. Point the
domain's DNS at the server, open ports 80 and 443, install Caddy and use:

```txt [/etc/caddy/Caddyfile]
cms.example.com

reverse_proxy localhost:3000
```

```bash
sudo systemctl reload caddy
```

Caddy sends `X-Forwarded-For` and `X-Forwarded-Proto`, so trust it: `trustProxy: true` in the
Next.js route handlers or the Nuxt module (`--trust-proxy` for the standalone server, already in
the unit above). Set `serverURL: 'https://cms.example.com'` in the config. With nginx, proxy to the
same port and set those headers yourself.

## Backups

Let Easy CMS back up the database every day (see [Backups](../backups)):

```ts
backups: { every: 'day', at: '03:00', keep: 7 },
```

Backups go to `backups/` on the same disk, so copy them and `uploads/` somewhere else too:
[Automate backups](../recipes/automate-backups) uses a cron job with S3 or rclone.

## Updating

```bash
cd /srv/site
sudo -u cms git pull
sudo -u cms npm ci
sudo -u cms npm run build
sudo systemctl restart easy-cms   # migrates, then starts
```

The site is down for the few seconds of the restart.

## Next steps

- [Security](../security): the checklist for a server on the internet.
- [Docker](./docker): the same site in a container.
