# Deploy บน VPS {#deploy-on-a-vps}

::: info หน้านี้สอนอะไร
เว็บพร้อม Easy CMS บน Linux server เครื่องเดียวที่คุณดูแลเอง (Ubuntu หรือ Debian): Node.js, SQLite และไฟล์อัปโหลด
บน disk ของเครื่อง, systemd คอยรันให้ตลอด, Caddy สำหรับ HTTPS และสำรองข้อมูลทุกวัน

**ควรอ่านก่อน:** [เลือกที่ deploy](./), [Migration และการ deploy](../deployment)
:::

server เครื่องเดียวเป็นวิธีที่ง่ายและถูกที่สุดในการรัน Easy CMS server รันอยู่ตลอด จึงรัน
[งานตามเวลา](../drafts#scheduled-publishing)เองทุกนาที และ SQLite ต้องการแค่ไฟล์เดียว

## 1. Node.js และ user {#1-node-js-and-a-user}

ติดตั้ง Node.js 22.12 ขึ้นไป (24 LTS) เช่นจาก [nodejs.org](https://nodejs.org/en/download) หรือแพ็กเกจ NodeSource
ของ distribution แล้วสร้าง user สำหรับรันเว็บและเป็นเจ้าของไฟล์:

```bash
node -v   # v22.12 ขึ้นไป
sudo useradd --system --create-home --shell /usr/sbin/nologin cms
sudo mkdir -p /srv/site && sudo chown cms:cms /srv/site
```

## 2. ตัวเว็บ {#2-the-site}

ในสิทธิ์ user `cms` นำโค้ดไปไว้ที่ `/srv/site` (`git clone` หรือคัดลอกไป) ใส่ secret ติดตั้ง และ build ให้ build บน
server เครื่องนั้นเลย เพราะ native driver ของ SQLite ต้องตรงกับระบบของเครื่อง

```bash
sudo -u cms bash
cd /srv/site
git clone https://github.com/you/your-site.git .
printf 'EASY_CMS_SECRET=%s\nEASY_CMS_SETUP_CODE=%s\n' "$(openssl rand -hex 32)" "choose-a-phrase" > .env
chmod 600 .env
npm ci
npm run build   # Next.js หรือ Nuxt; standalone server ไม่ต้อง build
exit
```

ถ้าไม่ตั้ง `DATABASE_URL` config `sqlite({ url: process.env.DATABASE_URL ?? 'file:./cms.db' })` จะเก็บฐานข้อมูลที่
`/srv/site/cms.db` และไฟล์อัปโหลดไปอยู่ที่ `/srv/site/uploads` จะใช้ Postgres ก็ได้ ติดตั้งบน server หรือใช้แบบ hosted
แล้วตั้ง `DATABASE_URL` ใน `.env`

## 3. systemd service {#3-a-systemd-service}

systemd start เว็บตอนเปิดเครื่อง รัน migration ก่อน start ทุกครั้ง และ restart ให้ถ้าเว็บหยุด

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

`EnvironmentFile` ส่ง `.env` ให้ server (Nuxt ไม่อ่าน `.env` เอง) และ `WorkingDirectory` ทำให้ `file:./cms.db`,
migration และ `uploads` อยู่ในโปรเจกต์ เช็คตำแหน่งของ `npx` และ `node` ด้วย `which npx` แล้วแก้ path ให้ตรง จากนั้น:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now easy-cms
journalctl -u easy-cms -f   # migration ที่รัน แล้วตามด้วย server
```

## HTTPS ด้วย Caddy {#https-with-caddy}

[Caddy](https://caddyserver.com) ขอและต่ออายุใบรับรอง HTTPS ให้เอง ชี้ DNS ของโดเมนมาที่ server เปิด port 80 และ 443
ติดตั้ง Caddy แล้วใช้:

```txt [/etc/caddy/Caddyfile]
cms.example.com

reverse_proxy localhost:3000
```

```bash
sudo systemctl reload caddy
```

Caddy ส่ง `X-Forwarded-For` และ `X-Forwarded-Proto` จึงต้องเชื่อมัน: `trustProxy: true` ใน route handler ของ
Next.js หรือ module ของ Nuxt (`--trust-proxy` สำหรับ standalone server ซึ่งอยู่ใน unit ข้างบนแล้ว) และตั้ง
`serverURL: 'https://cms.example.com'` ใน config ถ้าใช้ nginx ให้ proxy ไปที่ port เดียวกันและตั้ง header เหล่านั้นเอง

## สำรองข้อมูล {#backups}

ให้ Easy CMS สำรองฐานข้อมูลทุกวัน (ดู [สำรองข้อมูล](../backups)):

```ts
backups: { every: 'day', at: '03:00', keep: 7 },
```

ไฟล์สำรองอยู่ใน `backups/` บน disk เดียวกัน จึงควรคัดลอกไฟล์สำรองและ `uploads/` ไปไว้ที่อื่นด้วย
[สำรองข้อมูลอัตโนมัติ](../recipes/automate-backups) ใช้ cron กับ S3 หรือ rclone

## การอัปเดต {#updating}

```bash
cd /srv/site
sudo -u cms git pull
sudo -u cms npm ci
sudo -u cms npm run build
sudo systemctl restart easy-cms   # migrate แล้ว start
```

เว็บจะหยุดไม่กี่วินาทีระหว่าง restart

## ขั้นต่อไป {#next-steps}

- [ความปลอดภัย](../security): checklist สำหรับ server ที่เปิดสู่อินเทอร์เน็ต
- [Docker](./docker): เว็บเดียวกันใน container
