---
"@easy-cms/core": minor
"@easy-cms/admin": minor
"@easy-cms/email-smtp": minor
---

Settings → Email in the admin: see the email settings in use, check the connection, send a test email.

- Admins see the email adapter and its settings with where each comes from (`SMTP_HOST`, `smtp({ from })`…). Passwords only show as set or not.
- **Check the connection** logs in to the SMTP server without sending; **Send test email** sends one now, not through the queue, to you or another address (5 in 10 minutes). Both show the server's answer with a hint for the usual mistakes (user or password, port and TLS, an unreachable server, a refused sender).
- `EmailAdapter` gets two optional methods for this: `describe()` (never secrets) and `verify()`. `smtp()` and `consoleEmail()` have them.
- New admin-only endpoints: `GET <api>/admin/email`, `POST <api>/admin/email/verify`, `POST <api>/admin/email/test`.
