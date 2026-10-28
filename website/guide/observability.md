# Observability

::: info What you'll learn
Send traces and metrics from Easy CMS with OpenTelemetry: what it records, how to set up the SDK
in Next.js, Nuxt and `easy-cms serve`, and a local collector to try it.

**Before this page:** [Migrations & deployment](./deployment) (logs and health checks).
:::

[JSON logs](./deployment#logs) say what happened in each request. Traces say where its time went;
metrics say how that changes over hours. Easy CMS sends both through
[OpenTelemetry](https://opentelemetry.io), so they go to whatever your team uses: Jaeger, Grafana
Tempo and Prometheus, Datadog, Honeycomb, New Relic, AWS X-Ray.

```ts
export default defineConfig({
  telemetry: true,
  // ...
})
```

Easy CMS uses only `@opentelemetry/api`. Install it, and set up the OpenTelemetry SDK in your app
(below): the SDK decides where data goes. Without `telemetry`, Easy CMS doesn't load
`@opentelemetry/api` and does no extra work. `telemetry: { traces: false }` or
`{ metrics: false }` turns one of them off.

## Traces

Each API request gets a span, with a span for each Local API call and each database call inside:

```text
easy-cms GET /api/cms/:collection        42 ms   (server)
└─ easy-cms find posts                   40 ms
   ├─ db find posts                      31 ms   (client)
   └─ db findByIds categories             6 ms   (client)
```

- **Requests:** `easy-cms <METHOD> <route>`, with the route as a template (`/api/cms/:collection/:id`),
  `http.request.method`, `http.route` and `http.response.status_code`. When a framework already
  traces the request (Next.js does), the span sits inside its span; with `easy-cms serve` it is the
  server span itself. Health checks aren't traced.
- **Local API:** `easy-cms find posts`, `easy-cms update posts`, `easy-cms findGlobal site`… also
  when your own code calls the Local API inside a traced request.
- **Database:** `db <call> <collection>`, with `db.system.name` (`postgresql`, `sqlite`),
  `db.operation.name` and `db.collection.name`. Easy CMS doesn't trace each SQL statement; the
  instrumentation for `pg` or libSQL can, if you need that.
- **Background work:** `easy-cms jobs.run` for each run of the jobs, with `easy-cms job <name>` for
  your [jobs](./jobs) and `easy-cms outbox <event> <collection>` for [outbox](./hooks#outbox)
  entries inside.

Spans carry names, not values: collections, routes, operations, status codes and the kind of an
error (`error.type`, e.g. `VALIDATION_ERROR`). Never the values of a `where`, documents, query
strings, emails or user ids.

With JSON logs, each line logged inside a span has its `traceId` and `spanId`, next to the
`requestId`: from a log line you can open its trace.

## Metrics

| Metric | Type | Attributes |
|---|---|---|
| `http.server.request.duration` | histogram, seconds | `http.request.method`, `http.route`, `http.response.status_code` |
| `db.client.operation.duration` | histogram, seconds | `db.system.name`, `db.operation.name`, `db.collection.name` |
| `easy_cms.jobs.runs` | counter | `job`, `result` (`ok`, `failed`) |
| `easy_cms.jobs.duration` | histogram, seconds | `job` |
| `easy_cms.queue.size` | gauge | `queue` (`outbox`, `webhooks`, `emails`, `scheduled`), `state` (`pending`, `failed`) |
| `easy_cms.scheduled.late` | gauge | Scheduled publishes more than 10 minutes late |

The queue gauges are counted when jobs run (every minute, or when your cron calls them), not when
they are read, so a dashboard that refreshes often doesn't add queries. Good alerts to start with:
`easy_cms.scheduled.late` above 0 (nothing runs the jobs), and `easy_cms.queue.size` with
`state="failed"` growing.

## Setting up the SDK

### Next.js

Next.js loads `instrumentation.ts` before the app. With `@vercel/otel`:

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

Next.js already makes a span for each request, so Easy CMS's spans appear inside it.

### Nuxt and `easy-cms serve`

Load the Node SDK before the server starts, with `--import`. The repo's
[examples/otel](https://github.com/maritonx/easy-cms/tree/main/examples/otel) has the file:

```sh
npm install @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/sdk-metrics \
  @opentelemetry/exporter-trace-otlp-http @opentelemetry/exporter-metrics-otlp-http
```

```sh
node --import ./otel.mjs .output/server/index.mjs        # Nuxt
node --import ./otel.mjs node_modules/easy-cms/bin/easy-cms.js serve
```

`OTEL_EXPORTER_OTLP_ENDPOINT` says where to send (default `http://localhost:4318`), and
`OTEL_SERVICE_NAME` names the service. Keep one `@opentelemetry/api` in the app: two copies of
different minor versions may not see each other's SDK.

## Try it locally

[examples/otel](https://github.com/maritonx/easy-cms/tree/main/examples/otel) runs an OpenTelemetry
Collector that sends traces to Jaeger and metrics to Prometheus:

```sh
cd examples/otel
docker compose up -d
```

Start your app with `telemetry: true` and the SDK, open a few pages, then look at the traces at
http://localhost:16686 and query `http_server_request_duration_seconds_count` at
http://localhost:9090.
