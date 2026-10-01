# @easy-cms/db-sqlite

SQLite and libSQL (Turso) database adapter for Easy CMS. Part of [Easy CMS](https://github.com/maritonx/easy-cms), the embedded, code-first headless CMS for Nuxt and Next.js.

## Install

```bash
npm install @easy-cms/db-sqlite
```

Or `pnpm add`, `yarn add` or `bun add`.

## Usage

```ts
import { sqlite } from '@easy-cms/db-sqlite'

export default defineConfig({
  db: sqlite({ url: 'file:./cms.db' }),
  // ...
})
```

| Option | Default | |
|---|---|---|
| `url` | — | `file:./cms.db` (relative to the project root) or `libsql://…` |
| `authToken` | — | For Turso / remote libSQL |
| `tablePrefix` | `ecms_` | Prefix of every table Easy CMS creates |
| `migrationDir` | `easy-cms/migrations` | Where migration files are written |

In-memory databases (`:memory:`) are not supported because transactions open a second connection.

## Links

[Databases](https://maritonx.github.io/easy-cms/guide/databases) · [Documentation](https://maritonx.github.io/easy-cms/) ([ภาษาไทย](https://maritonx.github.io/easy-cms/th/)) · [GitHub](https://github.com/maritonx/easy-cms)

MIT License
