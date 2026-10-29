# Security

::: info What you'll learn
What Easy CMS protects for you, what stays your job, and a checklist before going live.

**Before this page:** [Access control](./access-control) and [Users & auth](./auth).
:::

## What Easy CMS does for you

### Accounts and sessions

- **Passwords** are hashed with scrypt (N=2¹⁷) and never returned by any API. They must be at
  least 8 characters, and not one of the ~2,000 most common passwords (such as `password1` or
  `iloveyou`).
- **Session tokens** are random, signed with `EASY_CMS_SECRET`, and stored only as hashes, so a
  copy of the database does not let anyone log in.
- **Cookies** are `HttpOnly`, `SameSite=Lax`, and `Secure` in production (or over HTTPS).
  Over HTTPS (or in production) the session, CSRF and SSO cookies are named with the `__Host-`
  prefix (`__Host-ecms-session`, `__Host-ecms-csrf`, `__Host-ecms-sso`), so only this exact host
  can set them, not a subdomain. Over plain HTTP in development they keep the plain names.
  Cookies under the old plain names are still read, and logging out clears both.
- **Logins are rate-limited**: after 5 failures for an email (and IP, when known) within 15
  minutes, login answers `429` (`auth.maxLoginAttempts`, `auth.lockWindow`).
- Logging out, changing the password or deactivating a user ends all of their sessions.
- **Logging out** answers with `Clear-Site-Data: "cache"`, so the browser drops cached pages.
  It is not `"storage"`, because your site may share the origin and keep its own data (such as
  a guest's cart). The admin also forgets what it kept in the browser about content: unsaved
  drafts, recent documents, the last media folder and list positions. Preferences such as the
  theme stay.

### Requests

- **CSRF**: a write authenticated by the session cookie must send the session's CSRF token in
  the `x-csrf-token` header, and its `Origin` must be the API's own or in
  `auth.trustedOrigins`. Cross-site requests without an `Origin` are refused. Requests with a
  Bearer token skip the token check (a browser never sends one on its own).
- **CORS** is closed by default. `cors` lists origins whose browser code may call the API;
  only `auth.trustedOrigins` may send cookies. Origins in `cors` may also write **without** a
  session cookie (e.g. a public [form](./forms)): there is no session to forge, and the
  collection's access rules still decide.
- **Rate limits** (`rateLimit`), when turned on: each visitor's IP, signed-in user and API key may
  send so many requests a minute, counted across instances. Over that, the API answers `429` with
  `Retry-After`. See [below](#rate-limits).
- **Request bodies** are limited to 1 MB (JSON) and `upload.maxFileSize` (files, 10 MB).
- **HSTS**: in production (`NODE_ENV=production`) the REST API and the admin send
  `Strict-Transport-Security: max-age=31536000` (without `includeSubDomains`), so browsers use
  HTTPS only for a year. Browsers ignore it over plain HTTP.
- **Errors** show their details in development only; in production unexpected errors answer
  `Internal Server Error` and are logged on the server.

### Content

- **Access is closed by default**: without rules, only logged-in users can read or change a
  collection. Field-level rules remove fields from responses and ignore them in input.
- **Uploads** are checked by their content (not the file name), limited in size, renamed, and
  served with `Content-Security-Policy: sandbox` and `nosniff`, so an uploaded SVG or HTML file
  can't run scripts on your site.
- **Rich text rendering** (`renderRichText`) escapes text and attributes and drops unsafe URLs
  such as `javascript:`.
- **Preview links** carry a signed token for one document or global that expires after an hour.

### The admin

- Admin pages send a strict Content Security Policy (scripts only from your own origin),
  `X-Frame-Options: DENY` and `Referrer-Policy: same-origin`.
- [Admin modules](./plugins#admin-components) are served by your server to logged-in users only;
  URLs of other sites are refused in the config.

## What stays your job

- **Keep `EASY_CMS_SECRET` secret and long** (32+ random characters, e.g. `openssl rand -hex 32`).
  [Rotate it](#rotating-the-secret) to change it without logging everyone out.
- **Write access rules on purpose**, especially `read`: a collection is public only when you
  say so, e.g. `read: () => true` or "published only".
- **Give people the smallest role they need**: editors get `editor`, not `admin`. Only admins
  can manage users.
- **Install plugins you trust.** A plugin runs on your server, and its admin components run with
  the rights of whoever is logged in.
- **Review migrations** before deploying and keep dependencies updated.
- **Back up** the database and uploads. See [Backups](./backups).

## Rate limits

`rateLimit` limits how many requests one client sends to the API in a minute. It protects the
database from a script or a visitor sending far more than people do, and it holds across instances.

```ts
export default defineConfig({
  rateLimit: {}, // the defaults below
  // rateLimit: { window: 60, anonymous: 300, users: 1200, apiKeys: 1200 },
})
```

| Who | Counted by | Default per minute |
|---|---|---|
| Visitors who are not signed in | IP address | 300 |
| Signed-in users (the admin included) | user | 1,200 |
| API keys | key | 1,200 |

`false` for one of them lifts its limit. Over the limit, the API answers `429 Too Many Requests` with
`Retry-After`, the seconds until the window ends. Health checks (`/healthz`, `/readyz`) and
`jobs/run` aren't counted. It covers everything under the API route, plugin endpoints included,
not the Local API or pages your app renders on the server.

- **Turning it on needs a migration**, for the `rate-limits` table (`easy-cms migrate:create`).
  Projects made with `create-easy-cms` 1.19 or later have it on.
- **Counts are shared through the database every few seconds**, not on every request, so the API
  doesn't write for each read. Between syncs, a client can go a little over, by what the other
  instances counted meanwhile.
- **The IP must be the visitor's.** Vercel and Netlify are recognized; behind your own proxy, set
  `trustProxy`. Without an IP, visitors who are not signed in aren't limited (counting them all as
  one would block everyone at once), and the server log says so once.
- **No IP is stored**: the table keeps an HMAC of it, made with the secret.
- **Static builds** fetch many pages at once: build with an API key, whose limit is higher (or
  `apiKeys: false`), or from the Local API.

Logins, sign-ups and form submissions keep their own, lower limits.

## Rotating the secret

Replace `EASY_CMS_SECRET` when it may have leaked, or on a schedule, without logging everyone out.
`previousSecrets` lists the secrets used before: what they signed still verifies, and everything
new is signed with `secret`.

```ts
export default defineConfig({
  secret: process.env.EASY_CMS_SECRET ?? '',
  previousSecrets: (process.env.EASY_CMS_PREVIOUS_SECRETS ?? '').split(',').filter(Boolean),
  // ...
})
```

Projects made with `create-easy-cms` 1.18 or later have that line; add it to older ones.

1. **Deploy with both.** Make a new secret (`openssl rand -hex 32`), set it as `EASY_CMS_SECRET`
   and the old one as `EASY_CMS_PREVIOUS_SECRETS`. Sessions, password and invitation links,
   preview tokens, links to private files and forms that were open keep working.
2. **Sign the audit log again.** `npx easy-cms audit:resign` signs the entries signed with the old
   secret with the new one. Entries no secret verifies were changed in the database: they are
   left as they are and listed.
3. **Remove the old secret** once what it signed has expired: sessions (`auth.tokenExpiration`,
   7 days by default) and invitation links (`auth.inviteExpiration`, 7 days). Sessions still
   using it then end.

If the old secret leaked, skip the waiting: remove it at once, and everyone signs in again.

- **Rate limits** of public forms start counting again: their keys come from the secret.
- **Not covered:** `backups.encryptionKey` is a key of its own; backups made with an old key need
  that key to be read. API keys don't depend on the secret.

## Checklist before going live

- [ ] `EASY_CMS_SECRET` is set in the server's environment, not only in `.env` on your laptop.
- [ ] `NODE_ENV=production`, and the site is served over HTTPS.
- [ ] The site is served over HTTPS only: the proxy or host redirects HTTP to HTTPS.
- [ ] Every collection's `read` rule is what you intend; test it logged out.
- [ ] `cors` and `auth.trustedOrigins` list only your own origins.
- [ ] Behind a proxy you control, enable trust-proxy (`trustProxy` for Nuxt and Next.js,
  `--trust-proxy` for standalone) so rate limiting sees real client IPs: the last address in
  `X-Forwarded-For` counts. The CSRF origin check then also uses `X-Forwarded-Host`; without
  trust-proxy, a proxy that changes the `Host` makes admin writes fail with `403`. Vercel and
  Netlify are recognized automatically and need nothing. Without an IP, failed logins count
  per email, and the server log says so.
- [ ] `EASY_CMS_SECRET` is random (`openssl rand -hex 32`): in production, one that looks like an
  example or a pattern is refused.
- [ ] `EASY_CMS_SETUP_CODE` is set until the first admin exists (in production the server warns
      while there is no admin and no code), and creating that admin is in the audit log.
- [ ] `CRON_SECRET` is a random string of at least 32 characters, like `EASY_CMS_SECRET`.
- [ ] The first admin has a strong password; other people have the `editor` role.
- [ ] Migrations are applied (`easy-cms migrate`) and backups run on a schedule.

## Reporting a vulnerability

Report vulnerabilities privately as described in
[SECURITY.md](https://github.com/maritonx/easy-cms/blob/main/SECURITY.md), not in a public issue.

## Next steps

- [Access control](./access-control): rules per collection, document and field.
- [Migrations & deployment](./deployment): ship schema changes safely.
