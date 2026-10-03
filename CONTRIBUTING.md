# Contributing

Thanks for helping with Easy CMS. This page covers how the repository is laid out, how to build
and test it, and what a pull request needs.

## Setup

You need Node.js 22.12 or later and pnpm 10 (`corepack enable` picks the version in
`package.json`).

```bash
pnpm install
pnpm build        # every package, the examples and the docs
pnpm typecheck
pnpm test         # unit and integration tests
pnpm lint         # Biome
```

## Layout

| Path | |
|---|---|
| `packages/core` | Config, Local API, REST handler, auth, access control, hooks, type generation |
| `packages/drizzle` | Shared database layer; `db-sqlite` and `db-postgres` add the dialects |
| `packages/admin` | The admin SPA (Vue) and its static handler |
| `packages/nuxt`, `packages/next` | Framework adapters (keep them thin) |
| `packages/cli`, `packages/create-easy-cms` | The `easy-cms` CLI and the project generator |
| `packages/plugin-*`, `packages/email-smtp`, `packages/storage-s3`, `packages/richtext` | Official plugins and adapters |
| `packages/integration` | Test suites that run on every database |
| `examples/*` | Example apps, also the end-to-end fixtures |
| `e2e` | Playwright suite and the docs screenshot script |
| `smoke` | Package-manager smoke test (a local registry) |
| `website` | Documentation (VitePress, English and Thai) |
| `docs` | Design document, requirements (SRS) and architecture decisions (ADRs) |

## Tests

- **Unit and integration:** `pnpm test`. The integration suites run on SQLite and PGlite, and on
  a Postgres server too with `POSTGRES_URL=postgres://… pnpm --filter easy-cms-integration-tests test`.
- **End to end:** `pnpm test:e2e` runs the same admin suite against the three examples (Nuxt in
  development, Next.js as a production build, the standalone server and its frontend).
  Locally it uses your installed Chrome.
- **Package managers:** CI creates a standalone project with npm, pnpm, Yarn and Bun from a local
  registry and runs it. To do the same locally:

  ```bash
  npx verdaccio@6 --config smoke/verdaccio.yaml --listen 4873 &
  pnpm build
  node smoke/publish.ts
  node smoke/scaffold.ts pnpm     # or npm, yarn, bun
  ```

- **Docs:** `pnpm --dir website test` checks that the reference pages list every option, and
  `pnpm --dir website dev` serves the site. Commands in `` ```sh [pm] `` blocks get a tab per
  package manager. A new page goes in `website/sidebar.json` (titles in English and Thai), which
  both this site and easy-cms.io read; easy-cms.io builds its docs from the commit of the latest
  npm release.
- **Screenshots:** after admin changes, `pnpm docs:screenshots` retakes the docs' screenshots
  (English and Thai, light and dark).

## Pull requests

- Add tests for changes in behavior. Logic belongs in `core` or `drizzle`, not in the adapters.
- Document user-facing changes in the guide, in English and Thai.
- Add a changeset: `pnpm changeset`. All packages share one version.
- Record decisions that affect users or the architecture in `docs/adr/`, and update
  `docs/SRS.md`.
- Keep `README.md` and the package READMEs in line with what the release adds.

## Releases

Merging to `main` opens a "Version Packages" pull request; merging that publishes every package
to npm from CI, with npm trusted publishing (no tokens).

A **new package** must exist on npm before CI can publish it: publish it once by hand
(`pnpm publish --access public --no-git-checks` in its directory), then allow CI to publish it:

```bash
npx npm@12 trust github <package> --file release.yml --repo maritonx/easy-cms --allow-publish -y
```

## Security

Please report vulnerabilities privately, as described in [SECURITY.md](SECURITY.md).
