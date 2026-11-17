---
"@easy-cms/core": minor
"@easy-cms/drizzle": minor
"@easy-cms/db-sqlite": minor
"@easy-cms/db-postgres": minor
"easy-cms": minor
---

SQL and data migrations, and `easy-cms seed` (#441). `easy-cms migrate:create <name> --empty` writes an empty SQL migration to write yourself (your app's own tables, views, indexes), run and recorded with the others. `--data` writes the config's changes with a `<name>.ts` data step (`export default async (tx) => {}`, typed `DataMigration`) that runs after the SQL in the same transaction, so a failure rolls both back. `migrate:status` marks migrations with a data step. `easy-cms seed` runs `easy-cms/seed.ts` (or `--file`), whose default export gets the Local API (typed `Seed`); in development it pushes the schema first unless the project has migrations. The Next.js starter template seeds with it.
