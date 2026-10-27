# Databases

::: info What you'll learn
SQLite, Turso, Postgres and PGlite: how to connect, choose and tune each.

**Before this page:** [Getting started](./getting-started).
:::

## SQLite

```bash [pm]
npm install @easy-cms/db-sqlite
```

```ts
import { sqlite } from '@easy-cms/db-sqlite'

db: sqlite({ url: 'file:./cms.db' }) // relative to the project root
db: sqlite({ url: 'libsql://my-db.turso.io', authToken: process.env.TURSO_TOKEN })
```

Uses libSQL. In-memory databases (`:memory:`) are not supported.

SQLite has one writer at a time. Writes from one process wait their turn in a queue; when
another process writes to the same file (a second server, `easy-cms` commands), a write waits
for it up to `busyTimeoutMs` (default 10000 ms), during which that process pauses. Many busy
processes writing to one file are better served by Postgres.

```ts
db: sqlite({ url: 'file:./cms.db', busyTimeoutMs: 5_000 })
```

## Postgres

```bash [pm]
npm install @easy-cms/db-postgres
```

```ts
import { postgres } from '@easy-cms/db-postgres'

db: postgres({ url: process.env.DATABASE_URL }) // a server, via postgres.js
db: postgres({ pglite: '.pglite' }) // PGlite: Postgres in WebAssembly, needs @electric-sql/pglite
```

PGlite is handy locally and in tests: real Postgres with nothing to install. A common setup:

```ts
db: process.env.DATABASE_URL ? postgres({ url: process.env.DATABASE_URL }) : postgres({ pglite: '.pglite' }),
```

### Connections

| Option | Default | |
|---|---|---|
| `max` | `10` | Connections in the pool, per instance |
| `prepare` | `true` | Prepared statements. Turn off behind a pooler that can't keep them |
| `statementTimeoutMs` | — | Cancels a statement that runs longer. Not behind PgBouncer (see below) |
| `idleTimeoutMs` | — | Closes connections left idle this long |
| `connectTimeoutMs` | `30000` | Gives up opening a connection after this long |
| `applicationName` | `easy-cms` | Shown in `pg_stat_activity`. `PGAPPNAME` also works |

Options in the URL (`?prepare=false`) and the `PG*` environment variables still apply when
the option isn't set. `statementTimeoutMs` has no default because migrations and backups can
take a while: `easy-cms migrate` and `easy-cms backup` read the same config, so leave them room.

**How many connections.** Every instance opens up to `max`, so the total is instances ×
`max`. Keep it under 10–20% of the server's `max_connections` (`SHOW max_connections`), leaving
room for your app, migrations and admin tools.

**Serverless and poolers.** Each serverless function instance has its own pool, and a burst of
traffic starts many of them: connect through a pooler (PgBouncer, or your host's: Neon,
Supabase, RDS Proxy) and keep `max` small, 1–3.

```ts
db: postgres({ url: process.env.DATABASE_POOLER_URL, max: 2, prepare: false })
```

- **Transaction mode** gives each transaction any server connection. Easy CMS keeps nothing
  between transactions, so it works, tested in CI against PgBouncer.
- **`prepare: false`** unless the pooler keeps prepared statements across server connections:
  PgBouncer does from 1.24 (`max_prepared_statements`, default 200). Otherwise queries fail
  with "prepared statement … does not exist".
- **Settings on the role**, not the connection: PgBouncer refuses startup parameters such as
  `statement_timeout`. Use `ALTER ROLE cms SET statement_timeout = '15s'` instead of
  `statementTimeoutMs`.
- **Migrations** run through the pooler too, or over a direct connection if your host offers
  one.

## Common options

| Option | Default | |
|---|---|---|
| `tablePrefix` | `ecms_` | Prefix of every table Easy CMS creates |
| `migrationDir` | `easy-cms/migrations` | Where migration files live |

## Sharing a database with your app

Easy CMS creates and changes only tables with its prefix, so it can use your app's database.
Your own tables are never touched, in development or by migrations. To keep it further apart,
in a schema, database or server of its own, see [Database isolation](./database-isolation).

## Differences to know

- Text sorting follows the database's collation: SQLite and PGlite sort case-sensitively, most
  Postgres servers don't.
- Migration files are made for one database; files created for SQLite are refused on Postgres.

## Performance

Measured with `packages/integration/load.ts` on Postgres 17 (Docker, a 10-core laptop):
100,000 posts with two locales, drafts and versions, relationships, `hasMany` tags and blocks;
20 concurrent REST requests, a pool of 10 connections.

| Request | Requests/s | p50 | p95 |
|---|---|---|---|
| By id, relationships populated (`depth=2`) | 2,750 | 8 ms | 10 ms |
| By slug (`where[slug][equals]`) | 2,770 | 8 ms | 10 ms |
| First page of a list | 1,060 | 18 ms | 23 ms |
| Filter by relationship, sort by date | 560 | 34 ms | 55 ms |
| Admin list with drafts | 550 | 35 ms | 49 ms |
| Save a draft (with a version) | 500 | 38 ms | 52 ms |
| Random page among 8,000 | 150 | 129 ms | 189 ms |
| Filter by `hasMany` value, sort by number | 115 | 159 ms | 258 ms |
| `like` search | 100 | 198 ms | 262 ms |
| Inside blocks (`layout.blockType`) | 83 | 237 ms | 304 ms |

What that means for your site:

- **Pages and lookups are fast.** Frontends read by id or slug, and list the first pages.
- **Deep pages cost more** the further in they are: the database skips the rows before them.
  Paginate archives by date (`where[publishedAt][lt]=…`) rather than to page 5,000.
- **`like` reads every row**, unless the field has `index: 'trigram'` on Postgres (below). For
  a full site search, use a search service (Meilisearch, Algolia, Typesense) fed by
  [webhooks](./webhooks).
- **Queries inside blocks** read the JSON of every document. On Postgres, `equals` and `in` use
  JSON containment and are about six times faster than other operators; keep them for filters,
  not for every page view.
- **Cache public pages** (a CDN, or your framework's cache) and revalidate them from webhooks:
  most traffic then never reaches the CMS.
- More concurrent requests than connections wait for a connection; raise `max` on
  `postgres()` if the database has room.

## Search with like

`like` finds any part of a text, which no ordinary index helps with. On Postgres,
`index: 'trigram'` adds one (GIN with the `pg_trgm` extension) that does, in Thai as in English:

```ts
{ name: 'title', type: 'text', localized: true, index: 'trigram' }
```

At 100,000 posts, a Thai title search went from reading every row (about 250 ms a query) to
p95 25 ms under 20 concurrent requests. Localized fields get an index per locale.

- **The extension.** The first migration with a trigram index runs
  `CREATE EXTENSION IF NOT EXISTS pg_trgm`. Since Postgres 13 the database's owner may create it;
  Neon, Supabase and RDS allow it. Otherwise ask whoever runs the database to run that line once.
- **The database's LC_CTYPE.** Trigrams come from letters and digits as the database sees them:
  with `LC_CTYPE` `C` or `POSIX`, Thai letters aren't letters and the index can't find them
  (results stay right, only slow). Easy CMS warns at start. `C.UTF-8`, `en_US.UTF-8` and
  `th_TH.UTF-8` are fine, as are the defaults of Docker's Postgres image and of PGlite.
- **At least 3 characters.** Shorter searches can't use the index.
- **SQLite** has no such index: the option does nothing there, so a config works on both.

## Next steps

- [Database isolation](./database-isolation): a schema, database or server of its own.
- [Migrations & deployment](./deployment): migrations in production.
- [Backups & upgrades](./backups): back up the database.
