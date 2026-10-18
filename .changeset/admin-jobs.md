---
"@easy-cms/core": minor
"@easy-cms/admin": minor
---

Settings → Jobs: admins (and roles given it) see the config's and plugins' `jobs` with their schedule, last run, result and next run, and the scheduled-publish queue, and can run due jobs now. Admins can pause and resume a job, and change the schedule of jobs with `adminSchedule: true`; the dashboard warns about failed and paused jobs, and changes go to the audit log. Jobs can run at a time of day (`at: '02:00'`, with `every` in whole days), in the new `timeZone` config option (also used by `backups.at`; default the server's).
