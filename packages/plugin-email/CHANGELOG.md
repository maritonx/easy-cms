# @easy-cms/plugin-email

## 1.46.1

### Patch Changes

- @easy-cms/core@1.46.1

## 1.46.0

### Patch Changes

- Updated dependencies [04e00e5]
  - @easy-cms/core@1.46.0

## 1.45.0

### Patch Changes

- @easy-cms/core@1.45.0

## 1.44.0

### Patch Changes

- Updated dependencies [b765b61]
- Updated dependencies [fb5f6e9]
  - @easy-cms/core@1.44.0

## 1.43.1

### Patch Changes

- @easy-cms/core@1.43.1

## 1.43.0

### Patch Changes

- Updated dependencies [b1f8284]
  - @easy-cms/core@1.43.0

## 1.42.1

### Patch Changes

- Updated dependencies [eede511]
  - @easy-cms/core@1.42.1

## 1.42.0

### Minor Changes

- 020e266: Email providers chosen in the admin (#404). `@easy-cms/plugin-email` adds Resend, Postmark and Brevo to Settings → Integrations → Email, and `smtpProvider` from `@easy-cms/email-smtp` any SMTP server: an admin connects one and sends with it after a test email to themselves, while the config's `email` stays the default. Their webhooks mark each email in the log as delivered, bounced or reported as spam, and addresses that bounced for good or reported spam go on a suppression list (Settings → Email) that gets no more email, except emails people ask for after a spam report. `defineEmailProvider()` writes your own. `EmailAdapter.send()` may return the provider's `{ id }`; `email.bounced` and `email.complained` are new system events, sent by `@easy-cms/plugin-notify` to chats that tick them. Needs a migration: a new `email-suppressions` table and three columns on `email-log`.

### Patch Changes

- Updated dependencies [020e266]
  - @easy-cms/core@1.42.0
