---
"@easy-cms/plugin-email": minor
"@easy-cms/core": minor
"@easy-cms/admin": minor
"@easy-cms/email-smtp": minor
"@easy-cms/plugin-notify": minor
"@easy-cms/plugin-ecommerce": patch
---

Email providers chosen in the admin (#404). `@easy-cms/plugin-email` adds Resend, Postmark and Brevo to Settings → Integrations → Email, and `smtpProvider` from `@easy-cms/email-smtp` any SMTP server: an admin connects one and sends with it after a test email to themselves, while the config's `email` stays the default. Their webhooks mark each email in the log as delivered, bounced or reported as spam, and addresses that bounced for good or reported spam go on a suppression list (Settings → Email) that gets no more email, except emails people ask for after a spam report. `defineEmailProvider()` writes your own. `EmailAdapter.send()` may return the provider's `{ id }`; `email.bounced` and `email.complained` are new system events, sent by `@easy-cms/plugin-notify` to chats that tick them. Needs a migration: a new `email-suppressions` table and three columns on `email-log`.
