# @easy-cms/db-postgres

PostgreSQL database adapter for Easy CMS: a Postgres server through postgres.js, or PGlite (Postgres in WebAssembly) for local development. Part of [Easy CMS](https://github.com/maritonx/easy-cms), the embedded, code-first headless CMS for Nuxt and Next.js.

## Install

```bash
npm install @easy-cms/db-postgres
```

Or `pnpm add`, `yarn add` or `bun add`.

## Usage

```ts
import { postgres } from '@easy-cms/db-postgres'

export default defineConfig({
  db: process.env.DATABASE_URL
    ? postgres({ url: process.env.DATABASE_URL }) // a Postgres server, via postgres.js
    : postgres({ pglite: '.pglite' }), // Postgres in WebAssembly for local development
  // ...
})
```

| Option | Default | |
|---|---|---|
| `url` | — | Connection string |
| `max` | `10` | Pool size |
| `pglite` | — | Data directory (relative to the project), `memory://`, or a `PGlite` instance. Needs `@electric-sql/pglite`. |
| `tablePrefix` | `ecms_` | Prefix of every table Easy CMS creates |
| `migrationDir` | `easy-cms/migrations` | Where migration files are written |

Migration files record the database they were made for; files created for SQLite are refused.
Text sorting follows the database collation (server defaults like `en_US.UTF-8` sort case-insensitively).

## Links

[Databases](https://maritonx.github.io/easy-cms/guide/databases) · [Documentation](https://maritonx.github.io/easy-cms/) ([ภาษาไทย](https://maritonx.github.io/easy-cms/th/)) · [GitHub](https://github.com/maritonx/easy-cms)

MIT License
