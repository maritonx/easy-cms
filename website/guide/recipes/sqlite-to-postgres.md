# Move from SQLite to Postgres

::: info What you'll build
The same site on Postgres instead of SQLite: before launch (easy), or with content you want to
keep. **Uses:** [databases](../databases), [migrations](../deployment), [backups](../backups).
:::

SQLite is a fine choice for one server with a disk. Move to Postgres when you deploy to
serverless, run several servers, or your host offers managed Postgres with backups.

## Before launch: switch and start fresh

If the content so far is test content, switch the adapter and recreate it:

```bash
npm install @easy-cms/db-postgres @electric-sql/pglite
```

```ts
import { postgres } from '@easy-cms/db-postgres'

db: process.env.DATABASE_URL
  ? postgres({ url: process.env.DATABASE_URL })
  : postgres({ pglite: '.pglite' }), // local Postgres in a folder, no server needed
```

Migrations are written in one database's SQL, so replace the SQLite ones:

```bash
rm -r easy-cms/migrations
npx easy-cms migrate:create init
```

Commit the new folder, run `npx easy-cms migrate` where you deploy, and create the first admin
again (`npx easy-cms create-admin`).

## With content to keep

Easy CMS has no built-in copy between databases yet. What works today:

1. **Back up** the SQLite database (`npx easy-cms backup backups/before-postgres.db`) and the
   uploads folder.
2. **Create the Postgres schema** from your config as above (`migrate:create init`, then
   `migrate` against the new database), so every table and column Easy CMS expects exists.
3. **Copy the rows** table by table with a database tool, for example
   [pgloader](https://pgloader.io) with its "data only" mode. The tables have the same names
   (prefix `ecms_`) and columns in both databases.
4. **Reset the id sequences** so new documents don't collide with copied ones:

   ```sql
   SELECT setval(pg_get_serial_sequence('ecms_posts', 'id'), (SELECT max(id) FROM ecms_posts));
   ```

   Repeat for every `ecms_` table with an `id` column.
5. **Check** the site against the new database: open the admin, a few documents with
   relationships and images, and the version history.

::: warning Test on a copy
We haven't tested every tool and edge case for step 3. Do the whole move against a copy of your
data first, and keep the SQLite backup until the Postgres site has run for a while.
:::

Uploads don't move: they stay in `uploads/` or your bucket, and documents keep pointing to them.
