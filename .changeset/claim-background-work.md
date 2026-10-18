---
"@easy-cms/core": patch
---

Background work runs once when several instances share a database, or when the in-process scheduler and the cron endpoint (`GET <api>/jobs/run`) run at the same moment. Scheduled publishes, webhook and email retries, the admin's Retry and backups are now claimed first (compare and set), so they no longer publish, send or back up twice; a scheduled job claimed by an instance that stopped goes back to the queue after 10 minutes. No migration is needed. `jobs` in the config are covered separately.
