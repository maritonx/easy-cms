# Standalone server {#standalone-server}

::: info หน้านี้สอนอะไร
รัน Easy CMS เป็น server ของตัวเองสำหรับ frontend แบบ Vite, React, Vue หรือเว็บ static และการ deploy

**ควรอ่านก่อน:** [เริ่มใช้งาน](./getting-started)
:::

Easy CMS สามารถรันเป็น server ของตัวเองแทนการรันภายใน Nuxt หรือ Next.js ใช้เป็น backend สำหรับ
frontend ที่สร้างด้วย Vite, React, Vue, Svelte หรือเว็บแบบ static หรือเมื่อต้องการให้ CMS อยู่บนโดเมนของตัวเอง

## สร้างโปรเจกต์ {#create-a-project}

```bash [pm]
npm create easy-cms@latest my-cms
cd my-cms
npm run dev
```

ในไดเรกทอรีใหม่หรือไดเรกทอรีว่าง `create-easy-cms` จะตั้งค่า standalone server ให้: `package.json` พร้อม
script, `easy-cms.config.ts` และ secret ใน `.env` สำหรับโปรเจกต์ที่มีอยู่แล้วซึ่งไม่ใช่ Nuxt
หรือ Next.js ให้ใส่ `--standalone`

เปิด `http://localhost:4000/admin` แล้วสร้าง admin คนแรก `npm run dev` จะรัน
`easy-cms serve --watch` ซึ่งจะโหลดใหม่เมื่อ config หรือไฟล์ที่ config import มีการเปลี่ยนแปลง หาก config
มีข้อผิดพลาด ระบบจะแจ้งข้อผิดพลาดและยังคงใช้ config ก่อนหน้าต่อไป

## Routes {#routes}

| Path | |
|---|---|
| `/admin` | หน้า admin (`admin.path`) |
| `/api/cms` | [REST API](./rest-api) (`routes.api`) |
| `/healthz` | `ok` สำหรับ load balancer และ health check ของ container |
| `/` | redirect ไปยังหน้า admin |

## การเรียกใช้จาก frontend {#calling-it-from-a-frontend}

ระบุ origin ของ frontend ใน `cors` จากนั้น fetch จากเบราว์เซอร์:

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

request แบบไม่ระบุตัวตนจะเห็นข้อมูลตามที่สิทธิ์การอ่านอนุญาต (โดยทั่วไปคือเนื้อหาที่เผยแพร่แล้ว) หากต้องการ
response ที่มี type ให้สร้าง type ด้วย `npx easy-cms generate:types` แล้วคัดลอกไฟล์ไปยัง
frontend

request ที่เข้าสู่ระบบแล้วจาก origin อื่นต้องใช้ bearer token
(`Authorization: Bearer <token>`) หรือ cookie อย่างใดอย่างหนึ่ง cookie ใช้ได้เมื่อ frontend และ CMS อยู่บน
site เดียวกัน (เช่น `www.example.com` และ `cms.example.com`) และ origin ของ frontend อยู่ใน
`auth.trustedOrigins`; ส่ง cookie ด้วย `fetch(url, { credentials: 'include' })`

## ตัวเลือก {#options}

```bash
easy-cms serve [--port <n>] [--host <host>] [--watch] [--trust-proxy]
```

| ตัวเลือก | ค่าเริ่มต้น | |
|---|---|---|
| `--port` | `PORT` จากนั้น `4000` | |
| `--host` | `HOST` จากนั้นทุก interface | |
| `--watch` | ปิด | โหลดใหม่เมื่อมีการเปลี่ยนแปลง (ช่วงพัฒนา) |
| `--trust-proxy` | ปิด | ใช้ `X-Forwarded-For` (จำกัดอัตราการเข้าสู่ระบบ) และ `X-Forwarded-Proto` (secure cookie) จาก reverse proxy ของคุณ |

`easy-cms serve` อ่าน `.env` จาก root ของโปรเจกต์ เช่นเดียวกับคำสั่ง CLI อื่นๆ ทั้งหมด

## การ deploy {#deploying}

เหมือนกับ adapter: สร้างและรัน migration จากนั้นเริ่ม server ด้วย `NODE_ENV=production` ซึ่ง
จะไม่ยอมเริ่มทำงานหากยังมี migration ค้างอยู่ ดู [Migration และการ deploy](./deployment)

```bash [pm]
npx easy-cms migrate
NODE_ENV=production npx easy-cms serve --trust-proxy
```

ตัวอย่าง Dockerfile:

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

การอัปโหลดไปยังดิสก์ในเครื่องต้องใช้ volume (`/app/uploads`) หรือใช้ [S3 storage](./uploads#s3-cloudflare-r2-and-minio)

## ใช้ server ของคุณเอง {#use-your-own-server}

`createStandaloneHandler(cms)` จาก `easy-cms` คืน handler แบบ `(Request) => Response` ตัวเดียวกัน
สำหรับ Hono, Bun, Deno หรือ server ใดก็ได้ที่รองรับ Web request:

```ts
import { createEasyCMS, loadConfig } from '@easy-cms/core'
import { createStandaloneHandler } from 'easy-cms'

const cms = await createEasyCMS(await loadConfig())
const handler = createStandaloneHandler(cms)
Bun.serve({ port: 4000, fetch: (request) => handler(request) })
```

## ขั้นต่อไป {#next-steps}

- [REST API](./rest-api): เรียก API จาก frontend
- [TypeScript](./typescript): type สำหรับ frontend ใน repo อื่น
