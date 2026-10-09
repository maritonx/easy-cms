---
"@easy-cms/core": minor
---

Names and shapes for 1.0. This release renames config options, Local API methods, CLI commands,
REST routes and plugin options; the config check names the new option when an old one is used.
See the upgrade guide: https://easy-cms-website.vercel.app/docs/upgrading

- Public API separated from what packages share (`@easy-cms/core/internal`, outside semver) and
  `@easy-cms/core/plugin` for plugin authors
- Error codes on every `EasyCMSError` and REST error; `Retry-After` on 429
- Config renames (`siteURL`, `admin.order`, `admin.icon`, `cliCommands`, `keepDays`,
  `backups.frequency`, …) and warnings for unknown options
- Local API: `isStaff`, `findSchedule`, `upcomingSchedules`, `runJobs()` result, `increment()`
  throws for a missing document
- REST: `/auth/<action>` (with `/users/<action>` aliases), `/admin/ui/*`, `PATCH` for globals
- Plugins and adapters declare `apiVersion`; `onRequest` lists; `flags` for plugin commands;
  CLI `admin:create` and `jobs:run`; plugin option renames
