# Health checks

::: info What you'll learn
What the dashboard's **Needs attention** and **System** panels tell admins, and how to fix each
problem they report.

**Before this page:** [Deployment](./deployment).
:::

<Screenshot name="dashboard" alt="The dashboard, with the System panel at the bottom of the side column" />

Admins see two panels on the dashboard that editors don't:

- **Needs attention**, at the top, only when something is wrong. Each line links to its section
  below.
- **System**, at the bottom of the side column: the Easy CMS version, the database, where files
  are stored, the email adapter, the plugins with their versions and the
  [field types](./field-types) from packages. Handy when you report a problem or ask for help.

Both come from `GET <api>/admin/status`, for admins only (not for API keys). Easy CMS never
checks for new versions on its own.

## Failed webhooks

**Shown when** a [webhook](./webhooks) delivery failed for good in the last 7 days: every retry,
over about a day, got an error. The panel shows how many, and the address that failed most.

**Check:**

- The receiving service is up and answers `2xx`. Its last error is kept with the delivery.
- The URL in `webhooks` is still right (a redeployed build hook often gets a new address).
- The receiver checks the signature with the same secret.

Failed deliveries are not retried. Once the receiver works, trigger what it needs again (for a
site build, publish or save once more).

## Emails not sent

**Shown when** an email has waited in the queue for over an hour, or failed for good in the last
7 days. See [queued and retried](./email#queued-and-retried).

**Check:**

- The SMTP settings (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`) and that the server accepts this
  sender. Failures are logged with the server's answer.
- On serverless hosts, that something runs the queue: a cron calling `<api>/jobs/run` (as for
  [late scheduled publishing](#late-scheduled-publishing)).

## Late scheduled publishing

**Shown when** a [scheduled](./drafts#scheduled-publishing) publish or unpublish is more than 10
minutes late. Nothing is running the jobs.

**Fix:** long-running servers (Nuxt, `easy-cms serve`, a self-hosted Next.js) run them every
minute. On serverless platforms, call `<api>/jobs/run` every minute from a cron with
`Authorization: Bearer $CRON_SECRET`, or run `npx easy-cms run-scheduled` from one. The late jobs
run on the next call, and so do webhook and email retries.

## No email

**Shown when** the config has no `email`. Without it there are no forgotten-password links, no
invitations and no form notifications. Set one up: [Email](./email).

## No serverURL

**Shown when** the site runs in production (`NODE_ENV=production`) without `serverURL`. Links in
emails (forgotten password, invitations) need the site's public address, and in production Easy
CMS doesn't trust the address in the request. Set `serverURL: 'https://example.com'` in the
config.

## Next steps

- [Deployment](./deployment): the checklist before going live.
- [Plugins](./plugins#naming-your-plugin): how a plugin shows its name and version here.
