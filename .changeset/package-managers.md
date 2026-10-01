---
"create-easy-cms": minor
"@easy-cms/core": minor
"@easy-cms/nuxt": minor
---

npm, pnpm, Yarn and Bun.

- `create-easy-cms --pm npm|pnpm|yarn|bun` picks the package manager; without it, the project's `packageManager` field, then its lockfile, then the one you ran it with (`pnpm create easy-cms`, `bun create easy-cms`…).
- The next steps it prints use that package manager: `pnpm exec easy-cms migrate`, `yarn easy-cms migrate`, `bunx easy-cms migrate`, `bun run dev`.
- With Yarn 2 or later it writes `.yarnrc.yml` with `nodeLinker: node-modules` (Plug'n'Play isn't supported).
- When the package manager isn't installed it says how to get it, and prints the install commands.
- Messages from core and the Nuxt module no longer assume npx.
- The docs show every command for npm, pnpm, Yarn and Bun, and keep the one you pick.
