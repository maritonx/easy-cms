# Database isolation

::: info What you'll learn
How far apart to keep Easy CMS from your app's data on Postgres, from sharing its database to
a server of its own, and how to set up a schema of its own.

**Before this page:** [Databases](./databases).
:::

By default Easy CMS creates its tables, all starting with `ecms_`, in your app's database. That
is simple and fine for most sites. Organisations often want the CMS kept apart from business
data: so its database role can't read customer tables, and so a busy CMS can't slow the app
down. Pick the level with the config and the database alone; no code changes.

| Level | Where the CMS data lives | How |
|---|---|---|
| **L0** shared | The app's database and schema, apart by `tablePrefix` | The default |
| **L1** own schema | The app's database, a schema and a role of its own | [The role's `search_path`](#a-schema-of-its-own-l1) |
| **L2** own database | Another database on the same server | Its own `url` |
| **L3** own server | Another Postgres server | Its own `url` |

## Which level

- **L0** for a site whose CMS and app are run by the same people.
- **L1 or above** when the CMS should only reach its own tables: its role can't read business
  data even if something goes wrong in the CMS, and a CMS migration can't touch the app's tables.
- **L3** when the CMS must not affect the app's performance. Levels L0 to L2 share the
  server's CPU, memory, disk and locks: a heavy import or a backup on the CMS side slows the app
  too.

A separate pool doesn't isolate anything but connections. Easy CMS always opens its own pool
(`max`, 10 by default) and never shares the app's, but both draw on the same server.

None of the levels replaces safe queries: Easy CMS uses parameterised queries throughout.
Isolation limits the damage if something goes wrong.

## A schema of its own (L1)

As a superuser, or the database owner, create a role and a schema it owns, and make it the
role's default schema:

```sql
CREATE ROLE cms LOGIN PASSWORD '…';
CREATE SCHEMA easy_cms AUTHORIZATION cms;
ALTER ROLE cms SET search_path = easy_cms;
```

Then connect as that role:

```ts
db: postgres({ url: 'postgres://cms:…@db.example.com:5432/app' })
```

Every table Easy CMS creates, and every migration it runs, lands in `easy_cms`. CI runs the
integration suites this way, through PgBouncer. The setting belongs to the role, not the
connection, so it also works behind poolers that refuse startup parameters.

- **Forgetting the role.** Without its own `search_path`, a role creates tables in `public`. On
  Postgres 15 and later a role that doesn't own `public` gets "permission denied for schema
  public" instead, so the mistake shows on the first start.
- **The app reading CMS tables.** Grant the app's role read access:

  ```sql
  GRANT USAGE ON SCHEMA easy_cms TO app;
  GRANT SELECT ON ALL TABLES IN SCHEMA easy_cms TO app;
  ALTER DEFAULT PRIVILEGES FOR ROLE cms IN SCHEMA easy_cms GRANT SELECT ON TABLES TO app;
  ```

  The last line covers tables later migrations create. Then refer to them as
  `easy_cms.ecms_posts`, or add the schema to the app role's `search_path`.

With [`index: 'trigram'`](./databases#search-with-like), the role can't create the `pg_trgm`
extension itself, and finds it only in its own schema. Create it there once, as the database's
owner:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA easy_cms;
```

A `schema` option for `postgres()`, independent of `search_path`, and running with a role that
can only read and write data are planned.

## Moving an existing install to L1

[Back up](./backups) first and stop the app, then move the tables as a superuser:

```sql
CREATE ROLE cms LOGIN PASSWORD '…';
CREATE SCHEMA easy_cms AUTHORIZATION cms;
ALTER ROLE cms SET search_path = easy_cms;

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'ecms\_%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I SET SCHEMA easy_cms', t);
    EXECUTE format('ALTER TABLE easy_cms.%I OWNER TO cms', t);
  END LOOP;
END $$;
```

Sequences and indexes move with their tables. Use your `tablePrefix` if you changed it. Point
`url` at the new role and start the app: `verify()` finds the migrations table in the new
schema and nothing is re-applied.

## Levels L2 and L3

Give the CMS its own `url`: another database (`CREATE DATABASE cms OWNER cms`) or another
server. Nothing else changes. Easy CMS never joins its tables with the app's, so the app reads
CMS content through the [Local API](./local-api) or [REST](./rest-api), not SQL.

On SQLite, a file of its own is already a database of its own.

## Next steps

- [Databases](./databases#connections): pool size, poolers and serverless.
- [Migrations & deployment](./deployment): running migrations in production.
- [Reference architecture](./deploy/production): several instances on one database.
