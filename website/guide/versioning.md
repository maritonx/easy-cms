# Versions and deprecations

::: info What you'll learn
What a version number promises, which parts of Easy CMS the promise covers, how old names are
retired, and how long releases get security fixes.

**Before this page:** [Upgrading](./upgrading).
:::

Easy CMS follows [semantic versioning](https://semver.org). Every `@easy-cms/*` package,
`easy-cms` and `create-easy-cms` are released together with the same version number, so upgrade
them together.

## What a version number promises

- **Before 1.0 (now):** a minor release (0.60 → 0.61) may change APIs, config or REST answers;
  the changelog and the [upgrade guide](./upgrading) say what and how to update. Patch releases
  (0.60.0 → 0.60.1) only fix bugs.
- **From 1.0:** breaking changes only in a major release (1.x → 2.0), with an upgrade guide.
  Minor releases add features; patch releases fix bugs.

## What the promise covers

| Covered | Not covered |
| --- | --- |
| `@easy-cms/core` and `@easy-cms/core/plugin`: their exports and types | `@easy-cms/core/internal` and `@easy-cms/drizzle`, which the packages share |
| Config options you set, and the documented shape of `cms.config` | Defaults filled into `cms.config`, which may grow |
| The [Local API](/reference/local-api) | `cms.db`: the adapter beneath access rules and hooks |
| REST routes and their answers, error `code`s | `<api>/admin/ui/*`, which only the admin uses |
| CLI commands and their options | The admin's look and wording |
| Your data: upgrades migrate it forward | Members marked `@internal`, left out of the published types |
| Adapters and their options | [Experimental packages](#experimental) |

Each change is tested against databases made by older releases (from 0.10) and the latest one,
on SQLite and Postgres: they are migrated with `easy-cms migrate` and their documents, versions
and files read back.

A change that fixes a security problem may break something the promise covers when there is no
other way; the changelog says so.

## Experimental packages {#experimental}

[`@easy-cms/plugin-ecommerce`](./ecommerce), [`@easy-cms/plugin-graphql`](./graphql) and
[`@easy-cms/plugin-mcp`](./mcp) share the version number but not the promise: their options,
endpoints and data may change in a minor release, after 1.0 too. Their pages and READMEs say so
at the top. They leave this list when they settle, in a minor release.

## Deprecations {#deprecations}

When a name changes in a minor release, the old one keeps working until the next major and
logs a warning **once per process**, with a code:

```
(node:4242) [EASY_CMS_DEP001] DeprecationWarning: POST <api>/users/login is now <api>/auth/login; the old path works through 1.x.
```

They are Node.js deprecation warnings, so Node's flags apply:

- `node --no-deprecation` hides them.
- `node --throw-deprecation` turns them into errors: useful in CI to find what still uses old
  names.
- `node --trace-deprecation` shows where each came from.

Set these with `NODE_OPTIONS`, e.g. `NODE_OPTIONS=--throw-deprecation npm test`.

Config options are the exception before 1.0: a renamed option stops startup with its new name
instead (``admin.siteUrl: is now `siteURL` ``), since a config is quick to fix and an ignored option
would quietly do nothing.

### Current deprecations

| Code | Old | New | Removed |
| --- | --- | --- | --- |
| `EASY_CMS_DEP001` | `<api>/users/<action>` (`login`, `me`, `init`, …) | `<api>/auth/<action>` | 2.0 |
| `EASY_CMS_DEP002` | `POST <api>/globals/<slug>` | `PATCH` | 2.0 |
| `EASY_CMS_DEP003` | `?fallback-locale=` | `?fallbackLocale=` | 2.0 |
| `EASY_CMS_DEP004` | `easy-cms create-admin` | `easy-cms admin:create` | 2.0 |
| `EASY_CMS_DEP005` | `easy-cms run-scheduled` | `easy-cms jobs:run` | 2.0 |

### In your plugins

`warnDeprecated(code, message)` from `@easy-cms/core` (or `@easy-cms/core/plugin`) does the same
for your own names. Use codes of your own:

```ts
import { warnDeprecated } from '@easy-cms/core/plugin'

export function acmePlugin(options: { apiKey?: string; key?: string }) {
  if (options.key !== undefined)
    warnDeprecated('ACME_DEP001', '`acmePlugin({ key })` is now `apiKey`; `key` goes in 2.0.')
  const apiKey = options.apiKey ?? options.key
  // …
}
```

## Security fixes

Security fixes go to the latest minor release. From 1.0, the previous major gets them too for
six months after the next major is out. Report a vulnerability as the
[security policy](https://github.com/maritonx/easy-cms/blob/main/SECURITY.md) says.

## Next steps

- [Upgrading](./upgrading): what changed in each release.
- [Backups & upgrades](./backups): back up before you deploy a new version.
