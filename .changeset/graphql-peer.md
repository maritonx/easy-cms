---
"@easy-cms/plugin-graphql": minor
---

`graphql` is now a peer dependency (16 or 17) instead of a dependency, so the plugin and the graphql-js objects you pass to `extend` are always the same copy; with two copies graphql-js refuses the schema. npm, pnpm and Bun install it for you; with Yarn, run `yarn add graphql`. The tests now run with graphql 16 and with 17.
