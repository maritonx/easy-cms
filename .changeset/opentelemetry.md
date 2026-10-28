---
"@easy-cms/core": minor
"@easy-cms/admin": minor
---

OpenTelemetry: `telemetry: true` (or `{ traces, metrics }`) sends spans and metrics through `@opentelemetry/api`, an optional peer dependency, wherever the app's own SDK sends them. Each API request gets a span (inside the framework's when it traces requests), with spans for Local API calls and database calls (`db find posts`), and `easy-cms jobs.run` spans for background work, its jobs and outbox entries. Metrics: `http.server.request.duration`, `db.client.operation.duration`, `easy_cms.jobs.runs`, `easy_cms.jobs.duration`, `easy_cms.queue.size` and `easy_cms.scheduled.late`. Spans carry names of collections, routes and operations, never query values or documents. JSON log lines carry the active span's `traceId` and `spanId`. The dashboard's System card says when telemetry is on. Off by default; without it, `@opentelemetry/api` isn't loaded.
