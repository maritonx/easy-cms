# @easy-cms/db-memory

In-memory SQLite database adapter for Easy CMS: SQLite compiled to WebAssembly (sql.js), with the same tables and SQL as `@easy-cms/db-sqlite`, in Node and in browsers. For Studio and tests, not production: nothing is written to disk. Part of [Easy CMS](https://github.com/maritonx/easy-cms), the code-first CMS and app backend for Nuxt and Next.js.

## Install

```bash
npm install @easy-cms/db-memory
```

## Usage

```ts
import { dropMemoryDatabase, memory } from '@easy-cms/db-memory'

export default defineConfig({
  db: memory(), // a new, empty database each time the CMS starts
  // db: memory({ name: 'preview' }), // kept until dropMemoryDatabase('preview')
  // ...
})
```

| Option | Default | |
|---|---|---|
| `name` | — | Keeps the database under this name while the process runs; a CMS started again with it finds the documents and pushes its schema onto them |
| `sqlJs` | sql.js with the WebAssembly inside | `() => initSqlJs({ locateFile })` to serve the `.wasm` file yourself |
| `tablePrefix` | `ecms_` | Prefix of every table Easy CMS creates |

In a browser, bundle with the `easy-cms-browser` export condition (Vite: `resolve.conditions`): it picks the builds of `@easy-cms/core` and this package that use no Node module.

## Links

[Databases](https://easycms.dev/docs/databases#in-memory) · [Documentation](https://easycms.dev/docs) ([ภาษาไทย](https://easycms.dev/th/docs)) · [GitHub](https://github.com/maritonx/easy-cms)

MIT License
