---
"@easy-cms/core": minor
"@easy-cms/admin": minor
---

Account hardening (#97):

- Passwords that are among the ~2,000 most common (from SecLists, 8 characters or more) are refused. Existing passwords keep working.
- Account lists your API keys with Revoke and Revoke all; after a password reset the admin shows your keys first and offers to revoke them.
- In production the server warns while no admin exists and no setup code is set; creating the first admin is in the audit log (`setup`).
- `cronSecret` must be at least 32 characters (a shorter `CRON_SECRET` is a warning), and `<api>/jobs/run` with the session cookie takes `POST` only.
