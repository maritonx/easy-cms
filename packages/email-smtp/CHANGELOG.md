# @easy-cms/email-smtp

## 0.37.2

### Patch Changes

- Updated dependencies [63f0116]
  - @easy-cms/core@0.37.2

## 0.37.1

### Patch Changes

- @easy-cms/core@0.37.1

## 0.37.0

### Patch Changes

- Updated dependencies [cbf800c]
  - @easy-cms/core@0.37.0

## 0.36.1

### Patch Changes

- @easy-cms/core@0.36.1

## 0.36.0

### Patch Changes

- Updated dependencies [7fbd37e]
  - @easy-cms/core@0.36.0

## 0.35.0

### Patch Changes

- Updated dependencies [892f6cf]
  - @easy-cms/core@0.35.0

## 0.34.0

### Patch Changes

- Updated dependencies [f3c65cd]
- Updated dependencies [3e33a26]
  - @easy-cms/core@0.34.0

## 0.33.0

### Patch Changes

- Updated dependencies [a26533e]
  - @easy-cms/core@0.33.0

## 0.32.0

### Patch Changes

- Updated dependencies [281435f]
  - @easy-cms/core@0.32.0

## 0.31.0

### Minor Changes

- 36fc19b: Settings → Email in the admin: see the email settings in use, check the connection, send a test email.
  
  - Admins see the email adapter and its settings with where each comes from (`SMTP_HOST`, `smtp({ from })`…). Passwords only show as set or not.
  - **Check the connection** logs in to the SMTP server without sending; **Send test email** sends one now, not through the queue, to you or another address (5 in 10 minutes). Both show the server's answer with a hint for the usual mistakes (user or password, port and TLS, an unreachable server, a refused sender).
  - `EmailAdapter` gets two optional methods for this: `describe()` (never secrets) and `verify()`. `smtp()` and `consoleEmail()` have them.
  - New admin-only endpoints: `GET <api>/admin/email`, `POST <api>/admin/email/verify`, `POST <api>/admin/email/test`.

### Patch Changes

- Updated dependencies [36fc19b]
  - @easy-cms/core@0.31.0

## 0.30.0

### Patch Changes

- Updated dependencies [f9d5512]
  - @easy-cms/core@0.30.0

## 0.29.0

### Minor Changes

- 5e92063: The dashboard tells admins what needs attention, and what the system is.
  
  - **Needs attention** (admins only, shown only when something is wrong): webhook deliveries that failed in the last 7 days, emails waiting over an hour or failed, scheduled publishing over 10 minutes late (nothing calls `jobs/run`), no `email`, and no `serverURL` in production. Each links to the new Health checks guide.
  - **System** (admins only): the Easy CMS version, database, file storage, email adapter, plugins with their versions, and field types.
  - Both come from the new `GET <api>/admin/status`, for admins only. Easy CMS doesn't check for new versions.
  - **`definePlugin(plugin, { name, version })`** names a plugin for the dashboard; the official plugins name themselves. `EmailAdapter` gets an optional `name` (`smtp`, `console`). Core exports `VERSION`.
  - In development, the admin's HTML is read on each request, so a rebuilt admin shows up without a restart.

### Patch Changes

- Updated dependencies [5e92063]
  - @easy-cms/core@0.29.0

## 0.28.0

### Patch Changes

- Updated dependencies [479e17a]
  - @easy-cms/core@0.28.0

## 0.27.0

### Patch Changes

- Updated dependencies [ffa2f84]
  - @easy-cms/core@0.27.0

## 0.26.0

### Patch Changes

- Updated dependencies [bcf3c0c]
  - @easy-cms/core@0.26.0

## 0.25.0

### Patch Changes

- Updated dependencies [434599a]
  - @easy-cms/core@0.25.0

## 0.24.0

### Patch Changes

- Updated dependencies [230a347]
  - @easy-cms/core@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [0107902]
  - @easy-cms/core@0.23.0

## 0.22.2

### Patch Changes

- @easy-cms/core@0.22.2

## 0.22.1

### Patch Changes

- d742afc: Package READMEs: what each package does, how to install it with npm, pnpm, Yarn or Bun, a short example and links to its guide.
- Updated dependencies [d742afc]
  - @easy-cms/core@0.22.1

## 0.22.0

### Patch Changes

- Updated dependencies [63995c6]
  - @easy-cms/core@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies [0e69436]
  - @easy-cms/core@0.21.0

## 0.20.1

### Patch Changes

- @easy-cms/core@0.20.1

## 0.20.0

### Minor Changes

- b7564cb: Forms and email.
  
  - **Email:** `email` in the config sends email for plugins and your hooks: `smtp()` from the new `@easy-cms/email-smtp` (Gmail, SES, Resend, Mailgun or any SMTP server), `consoleEmail()` for development, or your own adapter. `cms.sendEmail()` queues each email in the database and retries it for about a day if sending fails (`runJobs`); `flushEmails()` waits for them on serverless hosts. Needs a migration for the `email-deliveries` table.
  - **New package `@easy-cms/plugin-form-builder`:** editors build forms in the admin from field blocks (text, long text, email, number, phone, choice, checkbox, date, message), with a confirmation message or redirect and notification emails (`{{name}}`, `{{*}}`, and confirmations to the sender). Submissions are validated on the server, stored without IP addresses and exported as CSV. A honeypot, a minimum time, a rate limit per visitor and optional Cloudflare Turnstile keep bots out. `<easy-form form="contact">` renders a form on any page (the CMS also serves it at `/api/cms/form/element.js`); `getForm()` and `submitForm()` are there for your own components. Needs a migration for the `forms` and `form-submissions` collections.
  - Requests without a session cookie from origins in `cors` now pass the CSRF check, so frontends on other origins can send forms without being trusted with cookies. Endpoints get the client's `ip`.
  - The admin's lists can be narrowed to one related document from the URL (`?f_form=3`).

### Patch Changes

- Updated dependencies [b7564cb]
  - @easy-cms/core@0.20.0
