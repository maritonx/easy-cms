---
"@easy-cms/core": patch
"@easy-cms/admin": patch
---

Settings → Jobs is complete without `jobs` in the config: the Jobs tab always shows, with how to add jobs when there are none; a Built in section lists what Easy CMS does with every run (scheduled publishing, webhook and email retries, scheduled backups, the audit log check) with links to their pages; and the page says when jobs last ran, or warns when nothing has run them for 10 minutes (a missing cron on serverless hosts).
