---
"@easy-cms/db-postgres": minor
"@easy-cms/drizzle": minor
---

Filters on Postgres stay fast for every value (#257):

- **`customPlans`** (on unless `prepare` is false) sends `plan_cache_mode = force_custom_plan`, so each query is planned for its own values. After a few runs Postgres otherwise moves a prepared statement to one plan for every value; at 1M posts a filter by author then took up to 40 s. Behind PgBouncer with prepared statements, which refuses the parameter, set `customPlans: false` and `ALTER ROLE … SET plan_cache_mode = force_custom_plan`.
- **Statistics on each field indexed with `status`** (`CREATE STATISTICS … (mcv)`), so Postgres knows a value whose documents are all drafts, such as an author who hasn't published yet, has nothing to show, instead of reading a whole index for it (at 1M posts, about 1.6 s → under 1 ms). Postgres projects with drafts collections need a migration (`easy-cms migrate:create`); SQLite's schema doesn't change.
