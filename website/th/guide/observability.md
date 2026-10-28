# Observability {#observability}

::: info หน้านี้สอนอะไร
ส่ง trace และ metric จาก Easy CMS ด้วย OpenTelemetry: บันทึกอะไรบ้าง ตั้งค่า SDK ใน Next.js,
Nuxt และ `easy-cms serve` อย่างไร และ collector สำหรับลองในเครื่อง

**ควรอ่านก่อน:** [Migration และการ deploy](./deployment) (log และ health check)
:::

[log แบบ JSON](./deployment#logs) บอกว่าแต่ละ request เกิดอะไรขึ้น trace บอกว่าเวลาหมดไปที่ไหน
ส่วน metric บอกว่าเปลี่ยนไปอย่างไรตลอดหลายชั่วโมง Easy CMS ส่งทั้งสองอย่างผ่าน
[OpenTelemetry](https://opentelemetry.io) จึงไปที่เครื่องมือที่ทีมใช้อยู่ได้ เช่น Jaeger,
Grafana Tempo กับ Prometheus, Datadog, Honeycomb, New Relic หรือ AWS X-Ray

```ts
export default defineConfig({
  telemetry: true,
  // ...
})
```

Easy CMS ใช้แค่ `@opentelemetry/api` ให้ติดตั้ง package นี้และตั้งค่า SDK ของ OpenTelemetry
ในแอป (ดูด้านล่าง) SDK เป็นตัวตัดสินว่าข้อมูลไปที่ไหน ถ้าไม่ตั้ง `telemetry` Easy CMS
จะไม่โหลด `@opentelemetry/api` และไม่ทำงานเพิ่มเลย ส่วน `telemetry: { traces: false }` หรือ
`{ metrics: false }` ปิดอย่างใดอย่างหนึ่ง

## Trace {#traces}

ทุก API request มี span และข้างในมี span ของการเรียก Local API และการเรียกฐานข้อมูลแต่ละครั้ง

```text
easy-cms GET /api/cms/:collection        42 ms   (server)
└─ easy-cms find posts                   40 ms
   ├─ db find posts                      31 ms   (client)
   └─ db findByIds categories             6 ms   (client)
```

- **request:** `easy-cms <METHOD> <route>` โดย route เป็นแบบ template (`/api/cms/:collection/:id`)
  มี `http.request.method`, `http.route` และ `http.response.status_code` ถ้า framework trace
  request อยู่แล้ว (Next.js ทำ) span จะอยู่ใน span ของ framework ส่วน `easy-cms serve`
  จะเป็น server span เอง health check ไม่ถูก trace
- **Local API:** `easy-cms find posts`, `easy-cms update posts`, `easy-cms findGlobal site`…
  รวมถึงตอนโค้ดของคุณเองเรียก Local API ภายใน request ที่ถูก trace
- **ฐานข้อมูล:** `db <call> <collection>` มี `db.system.name` (`postgresql`, `sqlite`),
  `db.operation.name` และ `db.collection.name` Easy CMS ไม่ trace SQL ทีละคำสั่ง ถ้าต้องการ
  ใช้ instrumentation ของ `pg` หรือ libSQL ได้
- **งานเบื้องหลัง:** `easy-cms jobs.run` ทุกครั้งที่งานรัน ข้างในมี `easy-cms job <name>` สำหรับ
  [jobs](./jobs) ของคุณ และ `easy-cms outbox <event> <collection>` สำหรับรายการใน
  [outbox](./hooks#outbox)

span มีแค่ชื่อ ไม่มีค่า: collection, route, operation, status code และชนิดของ error
(`error.type` เช่น `VALIDATION_ERROR`) ไม่มีค่าใน `where`, เอกสาร, query string, อีเมล
หรือ user id

ถ้าใช้ log แบบ JSON ทุกบรรทัดที่ log ภายใน span จะมี `traceId` และ `spanId` คู่กับ
`requestId` จาก log บรรทัดหนึ่งจึงเปิด trace ของมันได้เลย

## Metric {#metrics}

| Metric | ชนิด | Attribute |
|---|---|---|
| `http.server.request.duration` | histogram, วินาที | `http.request.method`, `http.route`, `http.response.status_code` |
| `db.client.operation.duration` | histogram, วินาที | `db.system.name`, `db.operation.name`, `db.collection.name` |
| `easy_cms.jobs.runs` | counter | `job`, `result` (`ok`, `failed`) |
| `easy_cms.jobs.duration` | histogram, วินาที | `job` |
| `easy_cms.queue.size` | gauge | `queue` (`outbox`, `webhooks`, `emails`, `scheduled`), `state` (`pending`, `failed`) |
| `easy_cms.scheduled.late` | gauge | การ publish ตามเวลาที่สายเกิน 10 นาที |

gauge ของคิวนับตอนงานรัน (ทุกนาที หรือเมื่อ cron เรียก) ไม่ใช่ตอนอ่าน dashboard ที่ refresh
บ่อยจึงไม่เพิ่ม query alert ที่ควรตั้งก่อน: `easy_cms.scheduled.late` มากกว่า 0
(ไม่มีอะไรรันงาน) และ `easy_cms.queue.size` ที่ `state="failed"` เพิ่มขึ้นเรื่อยๆ

## ตั้งค่า SDK {#setting-up-the-sdk}

### Next.js {#next-js}

Next.js โหลด `instrumentation.ts` ก่อนแอป ใช้ `@vercel/otel` ได้แบบนี้

```sh
npm install @opentelemetry/api @vercel/otel
```

```ts
// instrumentation.ts
import { registerOTel } from '@vercel/otel'

export function register() {
  registerOTel({ serviceName: 'my-site' })
}
```

Next.js สร้าง span ให้ทุก request อยู่แล้ว span ของ Easy CMS จึงอยู่ข้างใน

### Nuxt และ `easy-cms serve` {#nuxt-and-easy-cms-serve}

โหลด Node SDK ก่อนเซิร์ฟเวอร์เริ่มด้วย `--import` ไฟล์อยู่ใน
[examples/otel](https://github.com/maritonx/easy-cms/tree/main/examples/otel) ของ repo

```sh
npm install @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/sdk-metrics \
  @opentelemetry/exporter-trace-otlp-http @opentelemetry/exporter-metrics-otlp-http
```

```sh
node --import ./otel.mjs .output/server/index.mjs        # Nuxt
node --import ./otel.mjs node_modules/easy-cms/bin/easy-cms.js serve
```

`OTEL_EXPORTER_OTLP_ENDPOINT` บอกว่าส่งไปที่ไหน (ค่าเริ่มต้น `http://localhost:4318`) และ
`OTEL_SERVICE_NAME` ตั้งชื่อ service ให้แอปมี `@opentelemetry/api` ชุดเดียว เพราะสองชุดที่
minor version ต่างกันอาจมองไม่เห็น SDK ของกันและกัน

## ลองในเครื่อง {#try-it-locally}

[examples/otel](https://github.com/maritonx/easy-cms/tree/main/examples/otel) รัน OpenTelemetry
Collector ที่ส่ง trace ไป Jaeger และ metric ไป Prometheus

```sh
cd examples/otel
docker compose up -d
```

เปิดแอปที่ตั้ง `telemetry: true` พร้อม SDK แล้วเปิดสักสองสามหน้า จากนั้นดู trace ที่
`http://localhost:16686` และ query `http_server_request_duration_seconds_count` ที่
`http://localhost:9090`
