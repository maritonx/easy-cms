---
'create-easy-cms': minor
---

`create-easy-cms --from <link>` sets up a project from a config made in Studio (ADR-0074): it writes `easy-cms.config.ts` from the link (beside an existing one, as `easy-cms.config.studio.ts`), takes the database from the config's adapter, and installs every `@easy-cms` package it imports. The config travels in the link's hash, deflated; `create-easy-cms/studio-link` reads and writes such links.
