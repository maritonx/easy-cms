---
"@easy-cms/db-postgres": minor
---

`postgres()` plans each query for its own values (`plan_cache_mode = force_custom_plan`, the new `customPlans` option, on by default unless `prepare` is false). After a few runs Postgres moves a prepared statement to one plan for every value, and for a filter that plan can read every matching row to sort them: at 1M posts a filter by author took up to 40 s instead of a few milliseconds. Behind PgBouncer with prepared statements, which refuses the parameter, set `customPlans: false` and `ALTER ROLE … SET plan_cache_mode = force_custom_plan`.
