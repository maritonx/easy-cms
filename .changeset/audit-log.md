---
"@easy-cms/core": minor
"@easy-cms/admin": minor
---

Audit log: who changed what and when, sign-ins, and admin actions.

- Turn it on with **`audit: true`** (or `{ keep: 365, values: true, failedLogins: 20 }`). It adds the internal `audit-logs` table: create a migration (`easy-cms migrate:create audit`).
- **Recorded:** creating, changing, publishing, unpublishing, restoring and deleting documents and globals (with each changed field's value before and after; hidden fields never, the password only as changed), scheduling; logins, failed logins, lock-outs, logouts, password links and single sign-on; roles, backups, test emails and deliveries. Each entry has who (their email then), how (signed in, API key, code, scheduled job), the IP address and the browser.
- **Settings → Audit log** (admins, and roles given it): filters, each change's fields, CSV export and an integrity check. A document's page shows its **Activity**.
- **Tamper evidence:** entries can't be changed or deleted through Easy CMS (only older than `keep` days, oldest first), and each is signed with the secret; the check finds edited and missing entries, daily with scheduled jobs.
- The dashboard warns about many failed logins within an hour, entries that couldn't be written, and a failed check.
- `cms.audit.record({ action, target, doc })` writes your own entries. New endpoints: `GET <api>/admin/audit`, `/admin/audit.csv`, `POST /admin/audit/verify`.
