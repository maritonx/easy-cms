---
"@easy-cms/core": minor
"easy-cms": minor
---

Webhook deliveries that fail are saved in the database (`webhook-deliveries`) and retried for about a day, so a restart or a stopped serverless function no longer loses them. Retries run with scheduled jobs: `cms.runJobs()`, `cms.retryWebhooks()`, `GET <api>/jobs/run` (now also returns `webhooks: { sent, failed }`) and `easy-cms run-scheduled`. Projects with `webhooks` need a new migration.
