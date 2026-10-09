# Upgrading

::: info What you'll learn
What changed between versions, and what to change in your app when you upgrade.

**Before this page:** [Configuration](./configuration).
:::

Upgrade every `@easy-cms/*` package and `easy-cms` together: they are released with the same
version number.

```sh [pm]
npm install @easy-cms/core@latest easy-cms@latest
```

Add the other `@easy-cms/*` packages your app uses (`@easy-cms/nuxt`, `@easy-cms/db-sqlite`, …)
to the same command.

Before 1.0, a minor version (0.48 → 0.60) may change names. Each change below says what to do.
When the config still uses an old name, the app doesn't start and the error names the new one:

```
Invalid Easy CMS config (1 problem):
  • admin.siteUrl: is now `siteURL`
```

## 0.60

0.60 settles the names and shapes kept through 1.x. Most apps only need the config changes
(the error tells you each one) and, if they call them, the renamed Local API methods.

### Config

| Before | Now |
| --- | --- |
| `admin.siteUrl` | `admin.siteURL` |
| `admin.menu` | `admin.order` on each collection, global and page |
| `icon`, `editIn` of a collection or global | `admin.icon`, `admin.editIn` |
| `position` of a field | `admin.position` |
| `admin.defaultValue` of a field | `admin.initialValue` |
| `to` of an `admin.commands` entry | `href` |
| `commands` | `cliCommands` |
| `auth.allowSignUp` | `auth.providerSignUp` |
| `auth.members.signup` | `auth.members.signUp` |
| `audit.keep` | `audit.keepDays` |
| `audit.scope(context)` | `audit.scope({ context, user })` |
| `versions.max` | `versions.keep` |
| `backups.every: 'day' \| 'week'` | `backups.frequency: 'daily' \| 'weekly'` |
| `localization: null`, `admin.switcher: null` | `false` |
| `notEquals` in an `admin.condition` | `not_equals`, as in `where` (`not_in` too) |

Hooks get `previousDoc` (it was `originalDoc` in `beforeValidate` and `beforeChange`). Options Easy CMS doesn't know are
now logged as warnings, with the closest name it knows.

Other changes in behaviour:

- **Webhooks** no longer send `users` events unless the webhook lists `users` in its
  collections.
- **Field access** has `create`. Without it, `update` applies when creating, as before.
- Globals have a `beforeValidate` hook, and `admin.group: false` hides a collection or global
  from the menu.

### Local API and access

| Before | Now |
| --- | --- |
| `isLoggedIn` | `isStaff` (`isSignedIn` is unchanged) |
| `cms.scheduled()` | `cms.findSchedule()` |
| `cms.scheduledGlobal()` | `cms.findGlobalSchedule()` |
| `cms.upcomingJobs()` | `cms.upcomingSchedules()` |
| type `ScheduledJob` | `ScheduledPublish` |
| `localStorage()` storage | `diskStorage()` (`DiskStorageOptions`) |

- `isAdmin` no longer allows admins of one part of the site (a user with `scoped: true`, e.g.
  the admin of one tenant). Use `isSystemAdmin` or your own rule if you relied on it.
- `cms.runJobs()` (and `GET <api>/jobs/run`) answers
  `{ scheduled: { ran, failed }, jobs, webhooks, emails }`.
- `cms.increment()` throws `NotFoundError` when the document doesn't exist. `null` now only
  means the value would go out of bounds.
- `cms.audit.list({ ...filter, page, limit })` answers like `find`: `{ docs, totalDocs, page, … }`.
- Helpers that only `@easy-cms/*` packages use moved to `@easy-cms/core/internal`, which is not
  covered by semver. Import from `@easy-cms/core` (or `@easy-cms/core/plugin`) only.

### Errors

Every `EasyCMSError` has a `code`, and REST errors carry it: `errors[].code`, e.g.
`VALIDATION_ERROR`, `UNAUTHORIZED`, `NOT_FOUND`, `TOO_MANY_REQUESTS`. GraphQL uses the same
codes. Check `code` rather than the message.

- `ConfigError` is an `EasyCMSError` (`CONFIG_ERROR`).
- `429` answers send `Retry-After`.
- Requests that start a session (login, first register, reset password) answer `200`.
- Cancelling a scheduled publish answers `{ deleted: 1 }`.

### REST routes

Only apps that call the REST API themselves need these.

- Signing in moved to `<api>/auth/<action>`: `login`, `logout`, `me`, `init`, `signup`,
  `verify-email`, `forgot-password`, `reset-password`, `first-register`. The old
  `<api>/users/<action>` paths keep working through 1.x.
- Globals are updated with `PATCH` (`POST` still works).
- `?fallbackLocale=` (`?fallback-locale=` still works).
- What only the admin uses moved to `<api>/admin/ui/*`, outside semver. Don't call it from
  your app.
- A plugin endpoint on a path the API also has, but with another method, now leaves that
  method to the API.

### CLI

| Before | Now |
| --- | --- |
| `easy-cms create-admin` | `easy-cms admin:create` |
| `easy-cms run-scheduled` | `easy-cms jobs:run` |

The old names still work. Built-in commands reject options they don't know, so a typo like
`--outt` is an error instead of being ignored.

### Plugins

Options whose names changed; the old names stop startup with the new name.

| Plugin | Before | Now |
| --- | --- | --- |
| SEO | `siteUrl` | `siteURL` |
| Forms | `fields` | `fieldKinds` |
| Forms | `minSubmitTime` (ms, 2000) | `minSubmitSeconds` (2) |
| Forms | `fetch` | removed |
| Multi-tenant | `tenantsSlug` | `slugs: { tenants }` |
| Multi-tenant | `findTenantFor(cms, by, slug)`, `tenantContext(cms, by, slug)` | `{ …by, collection: slug }` |
| Redirects | `slug` | `slugs: { redirects }` |
| Redirects | `cacheTTL` (ms, 60000) | `cacheMaxAge` (seconds, 60) |
| Nested docs | `fields` | `fieldNames` |
| GraphQL | `exclude` | `collections` and `globals`: the slugs in the schema (default all) |
| Shop | `customers.signup`, `signup()` | `customers.signUp`, `signUp()` |

Types: `FormBuilderOptions`, `MultiTenantOptions` and `EcommerceOptions` are now
`FormBuilderPluginOptions`, `MultiTenantPluginOptions` and `EcommercePluginOptions`.

Adapters:

| Adapter | Before | Now |
| --- | --- | --- |
| `sqlite()` | `busyTimeout` | `busyTimeoutMs` |
| `s3Storage()` | `publicUrl` | `publicURL` |

### Writing plugins

- Import `definePlugin`, `defineFieldType`, the plugin types and the error classes from
  `@easy-cms/core/plugin`. It has no server code, so admin elements can import it too.
- Declare the plugin API you wrote for: `definePlugin(fn, { name, version, apiVersion: 1 })`.
  A plugin for another version stops startup and says what to upgrade. Adapters can set
  `apiVersion: 1` too.
- `onRequest` may be a list. Plugins that add one should add to the list instead of calling the
  previous function: each sees the user the one before returned, and contexts are merged.
- `cliCommands` get `flags`: `--dry-run` is `flags.dryRun`, `--limit=5` is `flags.limit`.
- Admin element tags can be any custom element name with a hyphen, not only `ecms-…`.
- Dashboard widgets take an `id`, which roles use instead of the tag.
- `warnDeprecated(code, message)` logs a deprecation warning once per process, for options of
  your own that you rename. See [Versions and deprecations](./versioning#deprecations).

Next.js: `createRouteHandlers(config, options)` takes `basePath` and `getClientIp` as well as
`trustProxy`.
