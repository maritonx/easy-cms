---
'@easy-cms/core': minor
'easy-cms': minor
'@easy-cms/plugin-graphql': patch
'@easy-cms/plugin-ecommerce': patch
---

JSON logs and request ids. `logs: { format: 'json' }` (or `EASY_CMS_LOG_FORMAT=json`) writes one JSON object per line: `time`, `level`, `message`, the `requestId`, and `error` with its stack. Every API response has an `X-Request-Id` header, keeping a plain one from the load balancer, and with JSON logs every request gets a line with method, path, status and duration (`logs.requests: false` turns that off). Each run of the background jobs logs with its own `runId`. `easy-cms serve` follows the setting. The `Logger` methods take optional details, and `jsonLogger()` is exported; the readable default prints an error's stack under its line.
