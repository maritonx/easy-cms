# Move from SQLite to Postgres

::: info What you'll build
The same site on Postgres instead of SQLite: before launch (easy), or with content you want to
keep. **Uses:** [databases](../databases), [migrations](../deployment), [backups](../backups).
:::

SQLite is a fine choice for one server with a disk. Move to Postgres when you deploy to
serverless, run several servers, or your host offers managed Postgres with backups.

## Before launch: switch and start fresh

If the content so far is test content, switch the adapter and recreate it:

```bash [pm]
npm install @easy-cms/db-postgres @electric-sql/pglite
```

```ts
import { postgres } from '@easy-cms/db-postgres'

db: process.env.DATABASE_URL
  ? postgres({ url: process.env.DATABASE_URL })
  : postgres({ pglite: '.pglite' }), // local Postgres in a folder, no server needed
```

Migrations are written in one database's SQL, so replace the SQLite ones:

```bash [pm]
rm -r easy-cms/migrations
npx easy-cms migrate:create init
```

Commit the new folder, run `npx easy-cms migrate` where you deploy, and create the first admin
again (`npx easy-cms create-admin`).

## With content to keep

`easy-cms copy` moves everything: documents, versions, users (so logins keep working), globals,
scheduled jobs. Ids stay the same, so relationships still point to the right documents.

1. **Back up** first: `npx easy-cms backup backups/before-postgres.db`.
2. **Keep a config for the old database.** Create `easy-cms.old.config.ts` next to the main
   config; it reuses everything and changes only `db`:

   ```ts [easy-cms.old.config.ts]
   import { sqlite } from '@easy-cms/db-sqlite'
   import config from './easy-cms.config'

   export default { ...config, db: sqlite({ url: 'file:./cms.db' }) }
   ```

3. **Point the main config at Postgres**, as in the section above, and create the Postgres
   migrations (`rm -r easy-cms/migrations && npx easy-cms migrate:create init`).
4. **Prepare the new database.** Locally (PGlite, or `DATABASE_URL` set) the next step creates the
   tables itself. For a production database run `NODE_ENV=production npx easy-cms migrate` with
   its `DATABASE_URL` first.
5. **Copy**, while nobody is editing:

   ```bash [pm]
   npx easy-cms copy --from easy-cms.old.config.ts
   # Copying from sqlite (easy-cms.old.config.ts) to postgres…
   #   ecms_users: 3
   #   ecms_posts: 42
   #   …
   # Copied 318 row(s) from 17 table(s).
   ```

   The target must be empty, so running it twice by accident changes nothing.
6. **Check** the site: open the admin, a few documents with relationships and images, the history
   of a post, and log in.

Uploads don't move: they stay in `uploads/` or your bucket, and documents keep pointing to them.
When the site runs well on Postgres, delete `easy-cms.old.config.ts` (keep the backup a while).

The same command works the other way, from Postgres to SQLite.
