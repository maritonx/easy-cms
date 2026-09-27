---
"@easy-cms/core": minor
"@easy-cms/admin": minor
"easy-cms": minor
---

Scheduled publishing: `schedule: true` on collections or globals with drafts. `cms.schedule(collection, id, { action, at })`, a Schedule button in the admin, a per-minute runner in long-running servers, `GET <api>/jobs/run` for cron (Bearer `CRON_SECRET`) and `easy-cms run-scheduled`.
