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
  Changing it logs everyone out.
- **Write access rules on purpose**, especially `read`: a collection is public only when you
  say so, e.g. `read: () => true` or "published only".
- **Give people the smallest role they need**: editors get `editor`, not `admin`. Only admins
  can manage users.
- **Install plugins you trust.** A plugin runs on your server, and its admin components run with
  the rights of whoever is logged in.
- **Review migrations** before deploying and keep dependencies updated.
- **Back up** the database and uploads. See [Backups](./backups).

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
