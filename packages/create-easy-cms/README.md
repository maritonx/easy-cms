# create-easy-cms

Adds Easy CMS to a Nuxt or Next.js project, or creates a standalone Easy CMS server in a new
directory. Part of [Easy CMS](https://github.com/maritonx/easy-cms), the embedded, code-first
headless CMS for Nuxt and Next.js.

## Usage

```bash
npm create easy-cms@latest [dir]
```

Or `pnpm create easy-cms`, `yarn create easy-cms` or `bun create easy-cms`.

It writes `easy-cms.config.ts`, adds a random `EASY_CMS_SECRET` to `.env`, updates
`.gitignore`, wires up the Nuxt module or the Next.js route handlers and config, and installs the
packages. Running it again is safe.

| Option | |
|---|---|
| `--db sqlite\|postgres` | The database (asks when not given) |
| `--pm npm\|pnpm\|yarn\|bun` | The package manager. Default: the project's (`packageManager`, then the lockfile), else the one you ran it with |
| `--standalone` | A standalone server even inside a Nuxt or Next.js project |
| `--yes` | Accept the defaults without asking |
| `--skip-install` | Only write files |

## Links

[Getting started](https://maritonx.github.io/easy-cms/guide/getting-started) · [Documentation](https://maritonx.github.io/easy-cms/) ([ภาษาไทย](https://maritonx.github.io/easy-cms/th/)) · [GitHub](https://github.com/maritonx/easy-cms)

MIT License
