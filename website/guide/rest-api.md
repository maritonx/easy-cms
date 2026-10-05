# REST API

::: info What you'll learn
The HTTP API at `/api/cms`: endpoints, queries, authentication, CSRF and errors.

**Before this page:** [Local API](./local-api).
:::

Served at `routes.api` (default `/api/cms`). All responses are JSON; access rules always apply.

## Collections

| Method | Path | |
|---|---|---|
| GET | `/:collection` | List. Query: `where`, `sort`, `limit` (1–100), `page`, `depth`, `draft` |
| POST | `/:collection` | Create (JSON body) |
| GET | `/:collection/:id` | One document. Query: `depth`, `draft`, `preview` (a [preview token](./live-preview#preview-tokens): the current draft, no login) |
| PATCH | `/:collection/:id` | Update the given fields |
| DELETE | `/:collection/:id` | Delete |
| GET / POST | `/globals/:slug` | Read / update a global |
| POST | `/media` | Upload (`multipart/form-data`, field `file`), or JSON `{ url }` to download it ([from a link](/guide/uploads#from-a-link)) |
| GET | `/media/file/:name` | A stored file (public) |
| GET | `/auth/:provider/login` | Starts signing in with a provider (`?redirect=` an admin page); `/auth/:provider/callback` finishes. `POST /auth/:provider/link` (signed in) returns `{ url }` to link an account; `GET /auth/identities` and `DELETE /auth/identities/:id` list and unlink them ([Single sign-on](/guide/sso)) |
| GET | `/admin/sso` | For admins: the providers, their callback URLs, who may use a password |
| GET | `/admin/status` | For admins (and [roles](/guide/roles) given it): the system and what needs attention ([Health checks](/guide/health-checks)) |
| GET | `/admin/roles` | For admins, with `auth.rbac`: the roles and what can be given. `POST /admin/roles` with `{ key, name?, permissions? }` adds one; `PATCH /admin/roles/:id` with `{ name?, permissions? }` changes one; `DELETE /admin/roles/:id` deletes one; `GET /admin/roles/:id/history` lists its changes; `GET /admin/owned/:userId` says what a user owns, by collection ([Roles](/guide/roles)) |
| GET | `/admin/backups` | For admins: the backup settings and backups. `POST /admin/backups` backs up now (202); `GET /admin/backups/:id/download` downloads one; `DELETE /admin/backups/:id` deletes one |
| GET | `/admin/email` | For admins: the email adapter and its settings (never secrets). `POST /admin/email/verify` checks the connection; `POST /admin/email/test` with `{ to?, locale? }` sends a test email now (5 in 10 minutes) |
| GET | `/admin/deliveries` | For admins (and roles given it): saved webhook deliveries or emails (`kind=webhook\|email`, `state=failed\|pending`, `page`). `POST /admin/deliveries/:kind/:id/retry` and `/:kind/retry` (all failed) send now; `DELETE /admin/deliveries/:kind/:id` and `/:kind` (all failed) delete |
| GET | `/:collection/:id/versions` | Versions, newest first. Query: `limit`, `page` |
| GET | `/:collection/:id/versions/:version` | One version with its `data` |
| POST | `/:collection/:id/versions/:version/restore` | Restore a version |
| POST | `/:collection/:id/unpublish` | Unpublish (collections with drafts) |
| POST | `/:collection/:id/discard-draft` | Discard the pending draft |
| GET / POST | `/:collection/:id/schedule` | Pending [scheduled](./drafts#scheduled-publishing) jobs / schedule `{ action, at }` |
| DELETE | `/:collection/:id/schedule/:job` | Cancel a scheduled job |
| GET / POST | `/jobs/run` | Run due scheduled jobs and webhook retries (cron secret or admin) |
| POST | `/:collection/:id/preview` | [Live preview](./live-preview): `{ doc, url }` for unsaved changes (`/:collection/preview` for a new document) |

Globals have the same version routes under `/globals/:slug/…` (`versions`, `versions/:version`,
`versions/:version/restore`, `unpublish`, `discard-draft`, `preview`, `schedule`). Version and preview routes need update access.

`where` uses brackets or JSON:

```
GET /api/cms/posts?where[status][equals]=published&where[views][gte]=10&sort=-createdAt&limit=20
GET /api/cms/posts?where={"or":[{"featured":{"equals":true}},{"views":{"gt":100}}]}
```

`in` / `not_in` accept comma-separated values, `exists` takes `true`/`false`, and `equals=null`
matches empty values. `draft=true` only works for logged-in users. With
[localization](./localization), `locale` (`th`, `en`… or `all`) and `fallback-locale=false` work on
every read and write.

## Authentication

| Method | Path | |
|---|---|---|
| POST | `/users/login` | `{ email, password }` → session cookie, `{ user, exp, csrfToken }` |
| POST | `/users/logout` | Ends the session |
| GET | `/users/me` | `{ user, csrfToken }` for the current session |
| GET | `/users/init` | `{ hasUsers }` |
| POST | `/users/first-register` | Creates the first admin while there are no users |

**Browsers** send the session cookie. Every POST, PATCH, PUT and DELETE made with the cookie
must include the CSRF token as `x-csrf-token` (from the login response, `GET /users/me` or the
`ecms-csrf` cookie), and come from the API's own origin or one in `auth.trustedOrigins`.

**Servers and apps** send `Authorization: Bearer <token>` with the session token; no CSRF token
is needed.

## CORS

Browser code on another origin can call the API when that origin is listed in `cors` (or in
`auth.trustedOrigins`, which also allows cookies). Preflight `OPTIONS` requests are answered for
those origins; other origins get no CORS headers, so the browser blocks the response.

## Errors

```json
{ "errors": [{ "message": "is required", "field": "title" }] }
```

Statuses: 400 (validation, bad query), 401, 403, 404, 405, 413, 415, 429 and 500. In production,
500 responses don't include error details.

## Next steps

- [Users & auth](./auth): log in and tokens.
- [TypeScript](./typescript): types for other apps.
