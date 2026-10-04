---
"@easy-cms/core": minor
"@easy-cms/admin": minor
---

Failed webhooks and emails in the admin.

- **Settings → Deliveries** (admins): webhook deliveries and emails that failed or wait for another attempt. Webhooks show what changed, the address, the last error and the body sent; emails show who to and the subject, not the content.
- **Retry** sends once now (removed when it goes through, kept with the new error when not), one at a time or all failed at once; **Delete** one or all failed.
- Failed deliveries are deleted after 30 days, when scheduled jobs run.
- The dashboard's "Needs attention" links failed webhooks and emails to this page.
- New admin-only endpoints: `GET <api>/admin/deliveries`, `POST …/:kind/:id/retry`, `POST …/:kind/retry`, `DELETE …/:kind/:id`, `DELETE …/:kind`.
