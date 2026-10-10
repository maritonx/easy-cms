# Deploy ด้วย Docker {#deploy-with-docker}

::: info หน้านี้สอนอะไร
สร้าง container image ของเว็บที่มี Easy CMS แล้วรันด้วย Docker Compose แบบใช้ Postgres ใน container ที่สอง หรือแบบ
SQLite บน volume image เดียวกันนี้รันได้บน server หรือแพลตฟอร์มใดก็ได้ที่รัน container

**ควรอ่านก่อน:** [เลือกที่ deploy](./), [Migration และการ deploy](../deployment)
:::

container รันอยู่ตลอด server จึงรัน[งานตามเวลา](../drafts#scheduled-publishing)เองทุกนาที และเก็บ SQLite กับไฟล์
อัปโหลดไว้บน volume ได้ การ build ใน image ยังทำให้ native driver ของ SQLite ตรงกับระบบที่รันจริงด้วย

## 1. Dockerfile {#1-the-dockerfile}

image จะ migrate ฐานข้อมูลตอน start แล้วจึงเสิร์ฟเว็บ เลือกตามแบบที่ใช้:

::: code-group

```dockerfile [Next.js]
# Build: ติดตั้งทุกอย่างแล้ว build Next.js ไม่ต้องใช้ฐานข้อมูลตอน build
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx next build

# Run: แอปที่ build แล้วพร้อม node_modules (CLI easy-cms ใช้รัน migration)
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app ./
EXPOSE 3000
HEALTHCHECK --interval=30s --start-period=30s \
  CMD node -e "fetch('http://localhost:3000/api/cms/auth/init').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
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
  CMD node -e "fetch('http://localhost:3000/api/cms/auth/init').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
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

- script `build` ต้องไม่ migrate เพราะ image ถูก build โดยไม่มีฐานข้อมูล ให้รัน `next build` (หรือ `nuxi build`) ตรงๆ
  แบบข้างบน
- health check เรียก `<api>/auth/init` ซึ่งต้องต่อฐานข้อมูลได้ standalone server ตอบ `/healthz` ได้ด้วย
- image แบบ standalone ติดตั้งโดยไม่มี dev dependency จึงต้องมี `easy-cms` อยู่ใน `dependencies` (ไม่ใช่แค่
  `devDependencies`)
- ถ้าใช้ pnpm ให้เริ่ม stage build ด้วย `RUN corepack enable` คัดลอก `pnpm-lock.yaml` และรัน
  `pnpm install --frozen-lockfile`

กันไฟล์บนเครื่องไม่ให้เข้าไปใน image ด้วย `.dockerignore`:

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

## 2. Compose {#2-compose}

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

config อ่านฐานข้อมูลจาก `DATABASE_URL` เช่น `postgres({ url: process.env.DATABASE_URL })` หรือ
`sqlite({ url: process.env.DATABASE_URL })` ถ้าใช้ SQLite ให้รัน container เดียว เพราะไฟล์ SQLite มี server ได้ตัวเดียว

ใส่ secret ในไฟล์ `.env` ข้าง `compose.yaml` (ไม่ใส่ใน image) แล้ว start:

```bash
printf 'EASY_CMS_SECRET=%s\nEASY_CMS_SETUP_CODE=%s\n' "$(openssl rand -hex 32)" "choose-a-phrase" > .env
docker compose up -d --build
docker compose logs -f app
```

log จะแสดง migration ที่รัน แล้วตามด้วย server เปิด `http://localhost:3000/admin` แล้วสร้าง admin คนแรกด้วยรหัส
setup เปลี่ยนรหัสผ่าน Postgres ก่อนใช้ที่อื่นนอกจากเครื่องของคุณ

## 3. การอัปเดต {#3-updating}

ดึงโค้ดใหม่แล้ว build ใหม่ container ใหม่จะรัน migration ที่ค้างก่อน start และ volume เก็บฐานข้อมูลกับไฟล์อัปโหลดไว้

```bash
git pull
docker compose up -d --build
```

## 4. HTTPS และ proxy {#4-https-and-the-proxy}

วาง reverse proxy ไว้ข้างหน้าสำหรับ HTTPS เช่น Caddy, Traefik, nginx หรือของแพลตฟอร์ม proxy จะตั้ง
`X-Forwarded-For` ให้ จึงต้องเชื่อมัน: `--trust-proxy` (standalone ซึ่งอยู่ใน image ข้างบนแล้ว) หรือ
`trustProxy: true` (route handler ของ Next.js, module ของ Nuxt) จากนั้นตั้ง `serverURL` เป็นที่อยู่สาธารณะ
proxy ควร redirect HTTP ไป HTTPS ด้วย ตัวอย่างการตั้งค่า Caddy อยู่ใน [VPS](./vps#https-with-caddy)

## สำรองข้อมูล {#backups}

ทุกอย่างอยู่ใน volume: สำรอง volume `pgdata` หรือ `data` และ `uploads` หรือให้ Easy CMS สำรองฐานข้อมูลเอง
(`backups` ใน config เก็บไว้บน volume อื่นหรือใน S3) ดู [สำรองข้อมูล](../backups)

## ขั้นต่อไป {#next-steps}

- [VPS](./vps): รันเว็บเดียวกันโดยไม่ใช้ container
- [โฮสต์อื่นๆ](./other-hosts): แพลตฟอร์มที่ build และรัน image นี้ให้
