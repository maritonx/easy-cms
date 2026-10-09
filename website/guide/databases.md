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

## Common options

| Option | Default | |
|---|---|---|
| `tablePrefix` | `ecms_` | Prefix of every table Easy CMS creates |
| `migrationDir` | `easy-cms/migrations` | Where migration files live |

## Sharing a database with your app

Easy CMS creates and changes only tables with its prefix, so it can use your app's database.
Your own tables are never touched, in development or by migrations.

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
- **`like` reads every row.** For site search, use a search service (Meilisearch, Algolia,
  Typesense) fed by [webhooks](./webhooks), or add a `pg_trgm` index on Postgres yourself.
- **Queries inside blocks** read the JSON of every document. On Postgres, `equals` and `in` use
  JSON containment and are about six times faster than other operators; keep them for filters,
  not for every page view.
- **Cache public pages** (a CDN, or your framework's cache) and revalidate them from webhooks:
  most traffic then never reaches the CMS.
- More concurrent requests than connections wait for a connection; raise `max` on
  `postgres()` if the database has room.

## Next steps

- [Migrations & deployment](./deployment): migrations in production.
- [Backups & upgrades](./backups): back up the database.
