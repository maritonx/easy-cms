# Email

::: info What you'll learn
How Easy CMS sends email (for [forms](./forms) and your own hooks), how to connect SMTP, and
what happens when sending fails.

**Before this page:** [Configuration](./configuration).
:::

Easy CMS doesn't send email until you give it an **email adapter** in the config. Plugins such
as the form builder then use it, and so can your own code with `cms.sendEmail()`.

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
| `user`, `password` | `SMTP_USER`, `SMTP_PASSWORD` | |
| `from` | `SMTP_FROM` | The sender when a message sets none. |
| `transport` | — | Other [nodemailer](https://nodemailer.com/smtp/) options (pooling, DKIM…). |

The settings are read when the first email is sent, so the config loads without them, e.g. in a
build.

::: tip Deliverability
Send from an address on your own domain, and set up SPF, DKIM and DMARC for it with your
provider. Mail from `@gmail.com` addresses sent through another server usually lands in spam.
:::

## In development

`consoleEmail()` prints each email in the server's log instead of sending it:

```ts
import { consoleEmail, defineConfig } from '@easy-cms/core'
import { smtp } from '@easy-cms/email-smtp'

export default defineConfig({
  email: process.env.SMTP_HOST ? smtp() : consoleEmail(),
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
anything that comes from visitors before you put it in `html`.

## Queued and retried

`sendEmail` resolves once the email is saved in the database (the internal `email-deliveries`
collection); it is sent in the background. When sending fails (the SMTP server is down, a
limit is reached), the email is tried again after 1 minute, then 5, 30 minutes, 2, 6 and 12
hours, and then marked failed. Retries run with [scheduled jobs](./drafts#scheduled-publishing):
every minute on a long-running server, or from your cron (`GET <api>/jobs/run`).

On serverless hosts, call `await cms.flushEmails()` before the function returns, or let the cron
pick up what didn't finish.

The table is created only when `email` is set: add it with a migration
(`easy-cms migrate:create email`).

## Your own adapter

An adapter is an object with `send()`. For example, with an HTTP API instead of SMTP:

```ts
import type { EmailAdapter } from '@easy-cms/core'

const resend: EmailAdapter = {
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
}
```

## Next steps

- [Forms](./forms): notifications when someone sends a form.
- [Deployment](./deployment): set the SMTP variables where you host.
