---
"@easy-cms/core": minor
"@easy-cms/admin": minor
"@easy-cms/plugin-ecommerce": patch
"@easy-cms/plugin-form-builder": patch
"@easy-cms/plugin-multi-tenant": patch
---

A log of emails sent, in Settings → Email: when, to whom (blind copies only counted), the subject, its kind and how it went (sent, waiting with its tries, or not sent with why), searchable and filtered by state and kind, for admins of the whole site. It never keeps an email's content, whose links sign people in. Kept 30 days (`emailLog: { keepDays }`, or `emailLog: false` for none). `EmailMessage.tag` names an email's kind and isn't sent; Easy CMS's own emails and the shop's, forms' and teams' are tagged.

Needs a migration: a new `email-log` table for apps with `email` (see Upgrading → 1.41).
