---
"@easy-cms/core": minor
---

Webhook deliveries are saved before the first attempt, so a process that stops while sending no longer loses the event; it is retried by the next `runJobs()` after 5 minutes.
