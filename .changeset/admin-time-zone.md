---
'@easy-cms/admin': minor
---

The admin shows and takes dates in `config.timeZone` (#271). With it set, every date and time (lists,
edit pages, dashboard, audit log, jobs, backups) is in that zone, and date inputs, scheduled
publishing and the audit log's day filters read what people type in it, so a publish at 09:00 is
09:00 for everyone. Someone whose browser is in another zone sees the zone named next to date
inputs. Without `timeZone`, the admin uses the browser's zone as before.
