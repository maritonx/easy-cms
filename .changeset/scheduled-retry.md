---
'@easy-cms/core': minor
'@easy-cms/admin': minor
---

Scheduled publishing that fails says why and can be retried (#333). A job's error now keeps its
causes, e.g. `Failed query: … — fetch failed ECONNRESET`, where it used to stop at the driver's
"Failed query". When the database doesn't answer (a dropped connection, a timeout, a busy
database), the job is tried twice more, seconds apart, before it counts as failed; validation and
access errors aren't retried. Settings → Jobs → Scheduled has **Retry** on a failed job for admins
of the whole site (`POST <api>/admin/jobs/scheduled/:id`, `cms.retryScheduled(id)`).
