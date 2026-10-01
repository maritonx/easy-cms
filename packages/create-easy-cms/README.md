# create-easy-cms

Adds [Easy CMS](https://github.com/maritonx/easy-cms) to a Nuxt or Next.js project.

```bash
npm create easy-cms@latest [dir]   # or: pnpm create easy-cms, yarn create easy-cms, bun create easy-cms
```

Options: `--db sqlite|postgres`, `--pm npm|pnpm|yarn|bun`, `--standalone`, `--yes`, `--skip-install`.
It installs with your project's package manager (its `packageManager` field or lockfile), or the one
you ran it with.

Creates `easy-cms.config.ts`, adds `EASY_CMS_SECRET` to `.env`, updates `.gitignore`, wires the
Nuxt module or the Next.js route handlers and config, and installs the packages. Safe to run again.
