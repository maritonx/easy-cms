# Email

::: info What you'll learn
How Easy CMS sends email (for [password links](./auth#forgotten-passwords-and-invitations), [forms](./forms) and your own hooks), how to connect SMTP, and
what happens when sending fails.

**Before this page:** [Configuration](./configuration).
:::

Easy CMS doesn't send email until you give it an **email adapter** in the config. The CMS uses it
for forgotten passwords and invitations, plugins such as the form builder for notifications,
and your own code with `cms.sendEmail()`.

## SMTP

`@easy-cms/email-smtp` sends through any SMTP server: Gmail or Google Workspace, Amazon SES,
Resend, Mailgun, Postmark, or your own.

```bash [pm]
npm install @easy-cms/email-smtp
```

```ts
import { smtp } from '@easy-cms/email-smtp'

export default defineConfig({
  // …
  email: smtp({ from: 'My Site <no-reply@example.com>' }),
})
```

```bash [.env]
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASSWORD=re_…
```

| Option | Default | |
|---|---|---|
| `host` | `SMTP_HOST` | The SMTP server. |
| `port` | `SMTP_PORT`, else `587` | |
| `secure` | `true` for port 465 | TLS from the start; other ports upgrade with STARTTLS. |
| `requireTLS` | `true` for port 587 | Refuse to send unless the connection upgrades with STARTTLS. `false` e.g. for a local mail catcher without TLS. |
| `user`, `password` | `SMTP_USER`, `SMTP_PASSWORD` | |
| `from` | `SMTP_FROM` | The sender when a message sets none. |
| `transport` | — | Other [nodemailer](https://nodemailer.com/smtp/) options (pooling, DKIM…). |

The settings are read when the first email is sent, so the config loads without them, e.g. in a
build.

::: tip Deliverability
Send from an address on your own domain, and set up SPF, DKIM and DMARC for it with your
provider. Mail from `@gmail.com` addresses sent through another server usually lands in spam.
:::

## Checking the settings

<Screenshot name="email-settings" alt="Settings → Email: the SMTP settings in use and a test email" />

Admins find **Settings → Email** in the admin. It shows the adapter and the settings in use, and
where each comes from (`SMTP_HOST`, `smtp({ from })`…), `requireTLS` included. Passwords only show as set or not. To
change a setting, change the environment variable or the config and restart.

- **Check the connection** connects and logs in to the SMTP server without sending anything.
- **Send test email** sends one email right away, not through the queue, to you or another
  address (5 in 10 minutes at most).
  With `consoleEmail()` nothing is sent: the page says the email went to the server log, and so
  does the answer (`{ "ok": true, "logged": true }`), as it does for any adapter whose
  `describe()` says `delivery: log`.

Both show the server's answer, with a hint for the usual mistakes: a wrong user or password
(Gmail needs an app password), the port and `secure` not matching (465 is TLS from the start, 587
is STARTTLS), a server that can't be reached, or a sender the server refuses.

## In development

`consoleEmail()` prints each email in the server's log instead of sending it:

```ts
import { consoleEmail, defineConfig } from '@easy-cms/core'
import { smtp } from '@easy-cms/email-smtp'

export default defineConfig({
  email: process.env.SMTP_HOST ? smtp() : consoleEmail(),
})
```

## Email providers in the admin {#providers}

With `@easy-cms/plugin-email`, admins connect **Resend**, **Postmark** or **Brevo** (and any
**SMTP** server, with `smtpProvider`) in **Settings → Integrations → Email** and choose which one
sends the site's email. The config's `email`, if you set one, stays the default: **Use the
code's** goes back to it.

```bash [pm]
npm install @easy-cms/plugin-email
```

```ts
import { smtp, smtpProvider } from '@easy-cms/email-smtp'
import { emailPlugin, emailProviders } from '@easy-cms/plugin-email'

export default defineConfig({
  email: smtp(), // optional: the default until an admin chooses a provider
  plugins: [emailPlugin({ providers: [...emailProviders, smtpProvider] })],
})
```

1. **Connect**: an API key (or the SMTP server's host, user and password) and the sender, an
   address on a domain you verified with the provider. The key is checked first, and kept
   encrypted.
2. **Send email with it**: a test email goes to you with that connection. Only when it arrives
   at the provider does the site switch to it, so a domain the provider hasn't verified changes
   nothing. Every server follows within a minute.
3. The connection that sends can't be removed or turned off: choose another, or the code's, first.

Only admins of the whole site choose, and the audit log keeps who did. Emails waiting to be
retried go with the provider in use when they are retried.

| Provider | What to fill in | Webhook |
|---|---|---|
| Resend {#resend} | API key (`re_…`), and the webhook's signing secret (`whsec_…`) | `email.delivered`, `email.bounced`, `email.complained`, signed (Svix) |
| Postmark {#postmark} | Server API token, message stream (default `outbound`) | Delivery, Bounce, Spam Complaint |
| Brevo {#brevo} | API key (`xkeysib-…`) | Delivered, Hard bounce, Soft bounce, Complaint |
| SMTP | Host, port, user, password | — |

### What happened after sending {#delivery-events}

Each connection of Resend, Postmark and Brevo shows a **webhook URL**: add it at the provider with
the events in the table. The secret part of the URL names the connection (it changes with
`secret`), and Resend's requests are also checked against the signing secret. The email log then
shows each email as **delivered**, **bounced** or **reported as spam**, and can show only those.
A bounce that may pass (a full mailbox) isn't kept.

### The suppression list {#suppressions}

An address that bounced for good, or whose owner reported spam, goes on the list under **Settings →
Email**, and gets no more email: the log shows those as **not sent**. Admins can add addresses
and take them off. Emails people ask for (a password reset, an invitation, an email check) still
go to an address that reported spam, but not to one that bounced: it can't receive them.

The list is the internal `email-suppressions` table, made with email (see [Upgrading](./upgrading)).
`email.bounced` and `email.complained` are [system events](./webhooks#when-something-fails): with
`@easy-cms/plugin-notify`, tick them for a chat to hear about them.

### Your own provider {#your-own-provider}

```ts
import { defineEmailProvider } from '@easy-cms/plugin-email'

export const myProvider = defineEmailProvider({
  id: 'my-provider',
  label: 'My provider',
  fields: [{ name: 'apiKey', label: 'API key', required: true, secret: true }],
  create: (values) => ({
    async send(message) {
      // values.apiKey, values.from…; return the provider's id for the email
      return { id: '…' }
    },
  }),
  // Optional: check the key, and read the provider's webhook.
  test: async (values) => ({ ok: true }),
  events: (request, values) => [{ id: '…', type: 'bounced', address: 'a@x.co' }],
})
```

## Sending from your code

```ts
await cms.sendEmail({
  to: 'editor@example.com',
  subject: `New comment on ${post.title}`,
  text: comment.body,
  html: `<p>${escapeHtml(comment.body)}</p>`, // escapeHtml from @easy-cms/richtext
})
```

`to`, `cc` and `bcc` take one address or a list; `from` and `replyTo` are optional. Escape
anything that comes from visitors before you put it in `html`. `tag` (e.g. `'comment'`) names the
kind of email in the [log](#the-email-log); it isn't sent.

## Queued and retried

`sendEmail` resolves once the email is saved in the database (the internal `email-deliveries`
collection); it is sent in the background. When sending fails (the SMTP server is down, a
limit is reached), the email is tried again after 1 minute, then 5, 30 minutes, 2, 6 and 12
hours, and then marked failed: admins see failed emails under **Settings → Deliveries** and can
retry or delete them; they are deleted after 30 days. Retries run with [scheduled jobs](./drafts#scheduled-publishing):
every minute on a long-running server, or from your cron (`GET <api>/jobs/run`).

On serverless hosts, call `await cms.flushEmails()` before the function returns, or let the cron
pick up what didn't finish.

The table is created only when `email` is set (or `@easy-cms/plugin-email` is installed): add it with a migration
(`easy-cms migrate:create email`).

## The email log {#the-email-log}

**Settings → Email** lists every email sent in the last 30 days, newest first: when, to whom (the
number of blind copies, not who), the subject, its kind and how it went (sent, waiting with how many
tries, or not sent with why). Search by recipient or subject, or show one state or kind. Only admins
of the whole site see it.

It never keeps what an email said: password links and invitations sign people in, and forms carry
what visitors typed. Kinds come from `tag`: Easy CMS's own are `password-reset`, `invite`,
`password-changed`, `verify-email`, `member-added`, `order:confirmation`, `order:new`, `order:paid`
and `form:<form>`.

```ts
emailLog: { keepDays: 90 }, // default 30; `false` keeps no log
```

The log is the internal `email-log` table, made when `email` is set: add it with a migration
(see [Upgrading](./upgrading)). Test emails from Settings → Email aren't in it.

## Your own adapter

An adapter is an object with `send()`. For example, with an HTTP API instead of SMTP:

```ts
import type { EmailAdapter } from '@easy-cms/core'

const resend: EmailAdapter = {
  // Shown to admins on the dashboard (System).
  name: 'resend',
  from: 'My Site <no-reply@example.com>',
  async send(message) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: message.from,
        to: message.to,
        cc: message.cc,
        bcc: message.bcc,
        reply_to: message.replyTo,
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    })
    // Throw to have the email retried later.
    if (!response.ok) throw new Error(`Resend answered ${response.status}`)
  },
  // Optional, for Settings → Email: what to show (never secrets) and a connection check.
  describe: () => [{ key: 'from', value: 'My Site <no-reply@example.com>' }],
  async verify() {
    const response = await fetch('https://api.resend.com/domains', {
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    })
    if (!response.ok) throw new Error(`Resend answered ${response.status}`)
  },
}
```

## Next steps

- [Forms](./forms): notifications when someone sends a form.
- [Deployment](./deployment): set the SMTP variables where you host.
